---
title: "DDD入门(二)：应用架构"  
category: "DDD"  
publishedAt: "2025-05-29"  
summary: "DDD入门系列"  
tags:  
  - DDD
banner: /images/banner/posts/0001-two-sum.webp 
alt: "图片替代文本"  
mathjax: false
---

# DDD（二）：应用架构

架构这个词是什么？如何理解？在软件工程中又指什么？

首先，架构这个词源于英文里的“Architecture“，源头是土木工程里的“建筑”和“结构”，而架构里的”架“同时又包含了”架子“（scaffolding）的含义，意指能快速搭建起来的固定结构。也就是说，就像盖房子，得先有个结实、不变的“结构”和“骨架”（scaffolding），“架构”就承担了这样的作用。

而在软件中的架构，就是指那些轻易不动的代码结构、设计模式、规范和组件间的沟通方式。

为什么架构如此在软件开发中如此重要？

在应用开发中架构之所以是最重要的第一步，是因为一个好架构能让我们的系统安全稳定，不容易崩；**快速迭代**，不管加新功能还是改就功能都很快；**团队友好**​：让团队内能力参差不齐的同学们都能有一个统一的开发规范，降低沟通成本，提升效率和代码质量。

那么一个好的架构应该是什么样？作者在这里列了几个关键目标，但是核心我认为只有两个字：**解耦**。让系统的各个部分别绑死在一起。

想象一下建摩天大楼，不管里面住了谁、搞什么活动、外面刮风下雨，大楼都得很稳。我们的软件也想这样。但现实是，我们常常只顾着搞“微服务”这种大概念，却忽略了服务内部的“小架构”，结果代码一团糟。

接下来我们就跟着作者的脚步，通过案例的分析和重构，来推演出一套高质量的DDD架构。

## Case Study

实现用户通过网页转账给另外一个帐号。支持不同币种之间的转账。

拿到这个需求之后，经过一些技术选型，最终可能拆解为需求如下

* 从MySQL查账户（用MyBatis）。
* 从雅虎（或其他）获取汇率（HTTP接口）。
* 校验余额，限额。
* 计算、扣款、入账、存数据库。
* 发Kafka审计日志。

于是我们立刻开始写代码：

```java
public class TransferController {

	private TransferService transferService;

	public Result transfer(String targetAccountNumber, BigDecimal amount, HttpSession session) {
		Long userId = (Long) session.getAttribute("userId");
		return transferService.transfer(userId, targetAccountNumber, amount, "CNY");
	}
}

public class TransferServiceImpl implements TransferService {

	private static final String TOPIC_AUDIT_LOG = "TOPIC_AUDIT_LOG";
	private AccountMapper accountDAO;
	private KafkaTemplate kafkaTemplate;
	private YahooForexService yahooForex;

	@Override
	public Result transfer(Long sourceUserId, String targetAccountNumber, BigDecimal targetAmount, 		String targetCurrency) {
	// 1. 从数据库读取数据，忽略所有校验逻辑如账号是否存在等
	AccountDO sourceAccountDO = accountDAO.selectByUserId(sourceUserId);
	AccountDO targetAccountDO = accountDAO.selectByAccountNumber(targetAccountNumber);

	// 2. 业务参数校验
	if (!targetAccountDO.getCurrency().equals(targetCurrency)) {
		throw new InvalidCurrencyException();
	}

	// 3. 获取外部数据，并且包含一定的业务逻辑
	// exchange rate = 1 source currency = X target currency
	BigDecimal exchangeRate = BigDecimal.ONE;
	if (sourceAccountDO.getCurrency().equals(targetCurrency)) {
	exchangeRate = yahooForex.getExchangeRate(sourceAccountDO.getCurrency(), targetCurrency);
		}
	BigDecimal sourceAmount = targetAmount.divide(exchangeRate, RoundingMode.DOWN);

	// 4. 业务参数校验
	if (sourceAccountDO.getAvailable().compareTo(sourceAmount) < 0) {
	throw new InsufficientFundsException();
	}

	if (sourceAccountDO.getDailyLimit().compareTo(sourceAmount) < 0) {
	throw new DailyLimitExceededException();
	}

	// 5. 计算新值，并且更新字段
	BigDecimal newSource = sourceAccountDO.getAvailable().subtract(sourceAmount);
	BigDecimal newTarget = targetAccountDO.getAvailable().add(targetAmount);
	sourceAccountDO.setAvailable(newSource);
	targetAccountDO.setAvailable(newTarget);

	// 6. 更新到数据库
	accountDAO.update(sourceAccountDO);
	accountDAO.update(targetAccountDO);

	// 7. 发送审计消息
	String message = sourceUserId + "," + targetAccountNumber + "," + targetAmount + "," + targetCurrency;
	kafkaTemplate.send(TOPIC_AUDIT_LOG, message);

	return Result.success(true);
	}
}
```

可以看到我们目前写的代码把这些事儿全塞一块儿了，混杂了。目前来看没有什么问题，这种写法叫**事务脚本：Transaction Script**。 简单功能还行，但时间一长就是个**定时炸弹**。
它有以下几个很大的问题：可维护性差、可扩展性差、可测试性差。

* 维护起来很难 ： 任何外部一变动，核心逻辑就可能受影响。结果就是天天救火，没空搞新东西。
    * 数据结构不稳定：数据库表结构一改，代码就得跟着改。
    * 依赖库升级：MyBatis升级了？Kafka客户端变了？等着头疼吧。
    * 第三方服务“任性”：雅虎API改了？核心逻辑就得重写。
    * 中间件更换：从Kafka换到RocketMQ？又得大改。
* 扩展性很差：**第一个功能写得很快，第十个功能可能要花十倍时间**，因为大部分精力都在修修补补。
    * 加个新功能（比如“跨行转账”），可能得从头写，因为现有逻辑跟原来的场景（比如从自家数据库取账户）绑太死了。
    * 业务逻辑没法复用，最后代码里全是if-else。
    * 为一个新功能改了数据存储，可能把老功能也搞坏了。
* 测试性烂到家
    * 环境搭建难：想测转账方法？你得先把数据库、模拟的（或真实的）雅虎服务、Kafka都整起来。
    * 测试跑得慢：I/O操作（网络、磁盘）本来就慢，等测试跑完黄花菜都凉了。
    * 高耦合导致测试用例爆炸：A、B、C三个步骤紧密耦合，想覆盖全，测试用例数量指数级增长。
      结果就是，大家不爱写测试，bug满天飞。

为什么会变成这样，让我们思考前人总结下来的原则，这些原则不是没理由存在的。
至少违反了以下软件设计的基本原则：

* ​**单一职责原则（SRP）**：那个Service类啥都干，有无数个理由需要改它。
* ​**依赖倒置原则（DIP）**：它依赖的是**具体实现**（MyBatis、雅虎的特定服务、Kafka），而不是**抽象**（接口）。​
* ​**开闭原则（OCP）**：想加新逻辑（比如手续费），就得去**修改**已有的、正在工作的代码，风险太高。

  ​

## Reconstruction Plan

把上面代码抽象分层之后，我们可以看到一个很大的问题就是：上层对下层有直接的依赖关系，导致耦合度很高。在业务层中对于下层的基础设施有强依赖，耦合度高。我们需要对每个节点做抽象和整理，来降低对外部依赖的耦合度。

**第一点：抽象数据存储层 – 别再直接跟数据库对话了，将领域模型与持久化解耦。**

数据库技术（MySQL, Oracle, NoSQL）、ORM框架（MyBatis, Hibernate, JPA）甚至表结构都可能发生变化。如果领域逻辑直接依赖这些具体实现，那么这些变化会直接冲击核心业务代码，导致维护成本激增。通过Repository接口，领域层只依赖于抽象，不关心具体实现。通过定义实体，避免被持久化的细节**污染**。

具体来说，领域层由原先直接写一行代码与数据库交互，现在要多分为几个步骤：

* ​创建**Account实体**（Entity）**​*：包含业务属性和行为，使用领域原语。
* ​创建**AccountRepository仓储接口**：定义对Account实体的持久化操作契约。​
* ​实现**AccountRepositoryImpl仓**储实现类：负责**Account**实体与**AccountPO**（数据传输对象）之间的转换，并调用具体的ORM（如MyBatis）进行数据库操作。

​
再具体一些，再来说明一下分别是什么：

* Account实体（Entity）：这不只是个傻乎乎的数据容器（像**AccountPO**那样只对应数据库字段）。**实体**代表一个**业务概念**（账户），并且有自己的**行为**（比如**withdraw**取款，**deposit**存款）。它还会用上更丰富的类型（比如**Money**金额，**UserId**用户ID——这些是之前提到的“领域原语”，简单说就是自带校验的智能值对象）。
* **AccountRepository**仓储接口：它定义了你能对账户做什么（查找、保存），但不管**怎么**做。
* AccountRepositoryImpl**仓储实现类**：这个具体类负责跟MyBatis和AccountPO打交道，在数据库世界和你的业务**Account**实体之间做转换。
* ​**关键点**：你的业务逻辑现在只跟**Account**实体和**AccountRepository**接口打交道，它不关心MyBatis或SQL。如果你换数据库，只需要改**AccountRepositoryImpl**。

**第二点：抽象第三方服务 – 引入防腐层（Anti-Corruption Layer, ACL）隔离外部系统**

类似对于数据库的抽象，所有第三方服务也需要通过抽象解决第三方服务不可控，入参出参强耦合的问题。

因为很多时候，我们的核心业务逻辑与特定的第三方服务实现紧密耦合。如果第三方服务API变更、更换服务商，业务代码需要大量修改。​

业务逻辑可能需要直接处理第三方服务返回的原始数据格式，这可能与内部领域模型不一致，导致代码中充斥着转换逻辑。

缓存、重试、熔断等策略需要分散在各个调用点，难以统一管理和维护。

测试业务逻辑需要依赖真实的第三方服务或复杂的Mock。

为此，我们解耦的步骤为：

* ​创建ExchangeRateService**接口**​：定义获取汇率的契约，使用领域内的**Currency**和**ExchangeRate**对象。
* ​实现**ExchangeRateServiceImpl**：调用实际的**YahooForexService**，并进行数据转换和适配。

​
**这种思想叫做防腐层，通过在系统间加入一个防腐层，能够有效的隔离外部依赖和内部逻辑，无论外部如何变更，内部代码可以尽可能的保持不变。**

ACL可以实现缓存、重试、熔断、降级、监控、日志记录等策略，而无需将这些非业务逻辑散布在核心业务代码中。

**第三点：抽象中间件 –同样应用防腐层思想**

**对Kafka也是一样的思路**。创建**AuditMessageProducer**接口和**AuditMessage**审计消息对象（又一个领域原语）。

* **AuditMessageProducerImpl**负责跟Kafka打交道，以及序列化你的**AuditMessage**。
* ​**关键点**：业务逻辑只管“发个审计消息”，它不关心底层是Kafka、RabbitMQ还是别的什么。

  ​

**第四点：封装业务逻辑 – 构建充血的领域模型**

如果业务逻辑都写在应用服务层，领域对象就只是数据容器，这会导致应用服务层臃肿，代码结构类似过程式脚本，难以维护和复用。

实体的方法可以保护其内部状态，确保状态的改变总是符合业务规则。例如，Account.withdraw()方法内部会检查余额，防止非法透支。

封装在领域对象中的业务逻辑可以在不同的应用场景（不同的应用服务）中被复用。

领域对象（尤其是实体和值对象）通常不依赖外部基础设施，易于进行细粒度的单元测试。

领域对象的行为和属性**直接映射业务概念**，使得代码更能反映业务需求，便于与领域专家沟通。

**一句话核心：使我们的业务逻辑内聚于领域模型，实现高内聚低耦合，提升代码的可理解性和可维护性。**

用Account实体类封装所有Account的行为，包括业务校验如下：

```java
@Data
public class Account {

    private AccountId id;
    private AccountNumber accountNumber;
    private UserId userId;
    private Money available;
    private Money dailyLimit;

    public Currency getCurrency() {
        return this.available.getCurrency();
    }

    // 转入
    public void deposit(Money money) {
        if (!this.getCurrency().equals(money.getCurrency())) {
            throw new InvalidCurrencyException();
        }
        this.available = this.available.add(money);
    }

    // 转出
    public void withdraw(Money money) {
        if (this.available.compareTo(money) < 0) {
            throw new InsufficientFundsException();
        }
        if (this.dailyLimit.compareTo(money) < 0) {
            throw new DailyLimitExceededException();
        }
        this.available = this.available.subtract(money);
    }
}
```
​
通过这一系列的重构步骤，目标是将系统中的不同关注点进行清晰的分离：领域核心逻辑（纯粹且稳定）、应用编排逻辑（连接领域与外部）、以及基础设施实现（易变且具体）。这种仅包含**Orchestration**（编排）的服务叫做Application Service（应用服务）。（在代码中放在domain包下的service包下，可以好好理解这种编排的思想）

实现了对核心业务的保护，比如避免持久化的污染。

DDD 不是什么神秘的技术，它是我们把代码进行**系统性**的解耦，保护核心业务逻辑不受外部技术细节的频繁变化影响，之后，自然而然会得到的结果。

如果今天能够重新写这段代码，考虑到最终的依赖关系，我们可能先写Domain层的业务逻辑，然后再写Application层的组件编排，最后才写每个外部依赖的具体实现。这种架构思路和代码组织结构就叫做Domain-Driven Design（领域驱动设计，或DDD）。***所以DDD不是一个特殊的架构设计，而是所有Transction Script代码经过合理重构后一定会抵达的终点。***

## Code Organization

那么上述思想在代码中如何组织结构呢？

在Java中我们可以通过POM Module和POM依赖来处理相互的关系。通过Spring/SpringBoot的容器来解决运行时动态注入具体实现的依赖的问题。


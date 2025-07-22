---
title: "设计模式解决软件工程熵增问题（五）"  
category: "SD"  
publishedAt: "2025-07-22"  
summary: "设计模式解决软件工程熵增问题系列"  
tags:  
  - Software
banner: /images/banner/posts/sd/sd-design-pattern-5.png
alt: "图片替代文本"  
mathjax: false
---


# 设计模式解决软件工程熵增问题（五）

简单的CRUD能让我们完成业务的基本功能，但无法优雅地处理复杂的业务流程。

当我们遇到像“价格试算”、“风控审核”这样**包含多个步骤、多种判断条件的业务**时，用CRUD的思维去写，很容易写出充满 if-else 的代码，难以维护和扩展。

那么我们很自然容易想到去使用设计模式，比如用策略模式解决大量if-else存在的问题。那么这样就可以了吗。

接下来应该考虑到的一点是，团队里的人都会用设计模式，这是好事。

但A同学写的责任链和B同学写的责任链可能完全是两套实现；今天为业务X建了一个规则树，明天为业务Y又建了一个类似的，但代码不能复用。长此以往，项目里充满了大量“**相似但不相同**”的轮子，新来的同事光是理解这些不同的实现就要花很长时间，这就是“熵增”，系统越来越混乱。

那么如何解决？对于这种相似但不相同的情况，我们很容易想到一种解决方案：**抽象（标准化）**。

与其让每个人都去造自己的轮子，不如由架构师或资深开发者提供一个**标准化的轮子模板**。就是——定义一个通用的、抽象的设计模式的模板。

将这些标准模板（如规则树、责任链、状态机等）沉淀到一个公共模块（如types模块）或一个独立的jar包里。这样，整个团队在需要使用某种设计模式时，都去继承和实现这个标准模板。

那么，想法很美好，如何去实现呢？上面也提到这是架构师做的工作，我们作为开发小白，能做到吗，在这里笔者想说，不要害怕尝试，再资深的工程师都是从打杂开始的，只是它们不愿意一直打杂。

## 实战：搞一个规则树模板

以我们平时最常见的场景，使用**优惠券**为例，这几乎所有电商、O2O等交易类业务都会涉及的核心概念。

平时我们在下单前，可能最关心：这个券到底能不能用？、用了券之后究竟多少钱？这些问题。

而作为开发者，我们就需要构建一个**价格试算引擎**，来精准地回答这些问题。不然用户可能自己算着是可以用的，但是一下单却只能使用原件购买，肯定会降低对我们平台的信任度。

今天，我们就以营销优惠券价格试算为例，一步步推演，如何从一堆杂乱的if-else代码中，设计并演化出一套通用的、可复用的，的规则树模板。

### 第零步：一个无法维护的 calculatePrice 方法

我们刚开始接到的需求是：计算用户在选择了某些商品和一张优惠券后，最终的订单价格。

好的，于是我们开始了最直观的实现：

```java
// 最初的、丑陋的实现
public class PriceService {
    public OrderPrice calculatePrice(User user, List<Product> products, Coupon coupon) {
        // 1. 检查优惠券本身是否有效
        if (coupon.isExpired() || !coupon.isActive()) {
            throw new CouponInvalidException("优惠券已失效");
        }

        // 2. 检查优惠券的使用门槛 (金额)
        BigDecimal totalAmount = products.stream().map(Product::getPrice).reduce(BigDecimal.ZERO, BigDecimal::add);
        if (totalAmount.compareTo(coupon.getThresholdAmount()) < 0) {
            throw new CouponInvalidException("订单未满使用门槛");
        }

        // 3. 检查优惠券的适用商品范围
        boolean isApplicable = false;
        for (Product product : products) {
            if (coupon.getApplicableProductIds().contains(product.getId())) {
                isApplicable = true;
                break;
            }
        }
        if (!isApplicable) {
            throw new CouponInvalidException("优惠券不适用于当前商品");
        }
        
        // 4. 检查优惠券的适用人群（比如，新人专享券）
        if (coupon.isForNewUser() && !user.isNew()) {
            throw new CouponInvalidException("此券为新人专享");
        }
        
        // 5. 根据券类型（满减、折扣）计算最终价格
        BigDecimal finalPrice;
        if (coupon.getType() == CouponType.CASH_REDUCTION) {
            finalPrice = totalAmount.subtract(coupon.getDiscountValue());
        } else if (coupon.getType() == CouponType.PERCENTAGE_DISCOUNT) {
            finalPrice = totalAmount.multiply(coupon.getDiscountValue());
        } else {
            // ... 更多券类型
            finalPrice = totalAmount;
        }

        // 6. 返回结果
        return new OrderPrice(totalAmount, finalPrice, ...);
    }
}
```

这种写法，确实可以应对初始需求。但是，

如果产品经理明天提出：“在再加一个 **地域限制** 的规则，再加一种**N元购**的券类型，我们就要硬着头皮去修改这个已经非常复杂的if-else代码。

接下来我们尝试来重构下代码。

### 别忘了单一职责原则

这个方法，看似是完成一个功能，计算优惠，但是深入进去一看，我们这个方法其实做了很多事情，我们要做的，就是把职责这个概念，拆分的尽可能小。

首先把这个大方法，拆解成一个个独立的、只做一件事的逻辑节点。

* 券有效期校验器
* 订单金额门槛校验器
* 适用商品校验器
* 适用人群校验器
* 满减券价格计算器
* 折扣券价格计算器

ok，现在这些“校验器”和“计算器”，就是我们可以抽象出来的一个个**Handler**(处理器)。它们是构建我们规则引擎的 `base unit`。

接下来怎么做？又遇到了一个值得思考的问题。如何把这些独立的`Handler`组织起来，让它们能按顺序,按我们所编排的工作，并且能共享数据（比如订单总金额）？

## 编排组织Handler

首先让我们先回答子问题一：如何让它们共享数据？

让我们聚焦两个具体的 Handler：

* `CalculateTotalAmountHandler`: 它的职责是计算购物车里所有商品的总金额。
* `CheckOrderAmountHandler`: 它的职责是检查这个总金额是否满足优惠券的使用门槛。

显然，`CheckOrderAmountHandler `依赖于 `CalculateTotalAmountHandler`的计算结果。我们该如何把这个总金额从第一个Handler传递给第二个Handler呢？

方案一：返回值传递

`CalculateTotalAmountHandler`计算完后，把总金额 return 出来。然后我们写一段“胶水代码”接收这个返回值，再把它作为参数传给 `CheckOrderAmountHandler`。

```java
// 胶水代码
BigDecimal totalAmount = calculateTotalAmountHandler.handle(...);
checkOrderAmountHandler.handle(..., totalAmount);
```

显然，这种这种方式非常僵硬。如果流程中间有很多个节点，每个节点都产生一些中间数据，我们就得写大量的胶水代码来做参数的接收和传递，整个流程控制会变得非常混乱。而且，每个**Handler**的输入参数都不一样，我们无法设计一个统一的接口。

方案二：啊哈！时刻 —— 上下文对象（数据总线）

既然挨个传递太麻烦，我们为什么不引入一个**公共数据篮子**呢？

* 我们创建一个Context对象，这个对象会在整个处理流程中从头传到尾。
* `CalculateTotalAmountHandler`计算出总金额后，不 return，而是把它放进这个Context对象里：`context.setTotalAmount(totalAmount)`。
* 轮到 `CheckOrderAmountHandler`执行时，它直接从同一个Context对象里取出总金额：`BigDecimal totalAmount = context.getTotalAmount()`。

通过引入一个共享的上下文对象 (Context)，我们完美地解决了节点间数据共享的问题。这个 Context 对象就像一条数据总线，所有节点都可以往上读写数据。

接下来让我们来看问题二：如何让它们按顺序工作？

我们已经解决了数据共享，现在怎么让 Handler 一个接一个地执行呢？

方案一：硬编码调用
还是写胶水代码，手动按顺序调用：

```java
// 更多的胶水代码
calculateTotalAmountHandler.handle(request, context);
checkOrderAmountHandler.handle(request, context);
verifyApplicableProductsHandler.handle(request, context);
// ...
```

还是我们最开始要摆脱的**过程化代码**。流程是写死的，如果想调整顺序，或者根据条件跳过某个Handler，就得修改这段硬编码的逻辑。我们想要的是一种更灵活、更可配置的组织方式。

方案二：链式调用（责任链模式）
让每个Handler持有下一个Handler的引用。

```
handlerA.setNext(handlerB);
handlerB.setNext(handlerC);
```

当handlerA执行完后，它负责调用`handlerB.handle()`。

这很好，解决了线性顺序的问题。但我们的**业务不是线性的**。比如，在所有校验都通过后，我们需要根据优惠券的类型（满减券 vs 折扣券）去调用不同的价格计算器。这是一个分支，简单的责任链无法优雅地处理。

方案三：将“执行”与“决策”分离 (规则树思想)

既然简单的链式调用不够灵活，那我们能不能让每个节点变得更聪明一点？

我们赋予每个节点两种能力：

* ​执行能力 (Execution)：处理自己份内的业务逻辑。​
* ​​决策能力 (Decision/Mapping)：在自己干完活之后，根据当前的情况（请求参数、上下文），决定下一步应该由谁来干。

这就意味着，一个“节点”对象，需要暴露两个核心方法：

* ​一个方法用来**执行**：handle(...)​
* ​一个方法用来**决策/导航**：**getNextHandler(...)

这个“节点”的概念，已经比一个纯粹的**Handler**要复杂了。它既是**Handler**（处理器），又是**Router**（路由器）。

​​现在，我们把上面的思考整合起来，就能理解 **StrategyHandler** 的诞生过程，以及它和普通**Handler**的区别。

在我们脑海里，最开始的Handler可能就是一个简单的接口，比如：
它的职责很模糊，输入输出也不标准。

```java
// V1.0 - 一个简单的处理器接口
interface Handler {
    void process(RequestContext context); 
}
```

引入“策略模式”思想，形成 StrategyHandler。
我们发现，不同的优惠券计算方式（满减、折扣），其实是同一类问题（价格计算）的不同策略 (Strategy)。满减券价格计算器和折扣券价格计算器可以被看作是两种可以互相替换的策略。
“策略模式”这个词给了我们灵感。我们决定把我们设计的这个通用的逻辑积木块，命名为 StrategyHandler，以体现其“处理不同策略”的内涵。

所以，StrategyHandler 在这里可以理解为**应用了策略模式思想的、更通用的处理器**。它和Handler在本质上是一回事，但StrategyHandler这个名字，更体现其设计的意图和通用性。

结合我们对“共享数据”（需要上下文D）和“按顺序/分支工作”（需要统一的输入T和输出R）的思考，最终的接口形态就浮出水面了：

```java
public interface StrategyHandler<T, D, R> {
    // 这个方法只负责“干活”
    R handle(T request, D context) throws Exception; 
}
```

而“按顺序/分支工作”的决策能力，我们把它分离出去，放到了 StrategyMapper 接口和 AbstractStrategyRouter 类中。

## 提炼决策职责

既然要让节点自己决定下一步，那么**决定下一步**这个动作，本身就是一种需要被定义的**能力**。我们把它抽象成一个接口。

来思考两个问题：

* 这个能力需要什么输入？
* 这个能力要产出什么？

它需要知道最原始的请求信息，才能根据请求内容做判断。需要 **T requestParameter**
它还需要知道到目前为止，流程中已经产生了哪些中间数据（比如用户标签、订单总额等），这些都存放在上下文里。需要 **D dynamicContext**
它的目标就是返回下一个应该被执行的处理器。这个处理器的类型就是我们之前定义好的 StrategyHandler<T, D, R>。

思考完这个问题，于是，一个专门负责**决策/导航/映射**的接口诞生了，我们称之为 `StrategyMapper`(策略映射器)：

```java
public interface StrategyMapper<T, D, R> {

    /**
     * 获取下一个待执行的策略（处理器）
     * 这就是导航的核心方法
     */
    StrategyHandler<T, D, R> get(T requestParameter, D dynamicContext) throws Exception;

}
```

这个接口非常纯粹，它的唯一职责就是：根据输入和上下文，告诉你下一步该找谁。

现在我们有了“决策”的接口规范，下一步就是让我们的“逻辑节点”拥有这种能力。

一个“逻辑节点”既要会“干活”（执行业务逻辑），又要会“指路”（决定下一步）。因此，一个完整的节点，应该同时实现 执行器(StrategyHandler) 和 决策器 (StrategyMapper) 两个接口。

```java
// 这是一个“概念上”的完整节点
public class A_Complete_Node implements StrategyHandler<...>, StrategyMapper<...> {

    @Override
    public R apply(...) {
        // 这是“干活”的部分
        // 1. 执行本节点的业务逻辑，比如校验库存
        // 2. 可能会修改上下文 dynamicContext
        // 3. 注意：这个方法本身不负责调用下一个节点
    }

    @Override
    public StrategyHandler<...> get(...) {
        // 这是“指路”的部分
        // 1. 根据 requestParameter 和 dynamicContext 中的信息进行判断
        // 2. if (库存充足) { return stockSufficientHandler; }
        //    else { return stockInsufficientHandler; }
    }
}
```

现在我们有了一堆既能干活又能指路的全能节点，但**谁来启动这个流程**？谁来把指路和干活这两个动作串联起来呢？

我们需要一个总指挥或总调度器，这就是 `AbstractStrategyRouter`的角色。
`AbstractStrategyRouter`本身也是一个全能节点的抽象，所以它理应同时实现 `StrategyHandler `和 `StrategyMapper`接口。

```java
public abstract class AbstractStrategyRouter<T, D, R> 
    implements StrategyMapper<T, D, R>, StrategyHandler<T, D, R> {
    
    // ...
    
    // 这是总指挥的核心方法，也是整个规则树的执行入口
    public R router(T requestParameter, D dynamicContext) throws Exception {
        // 1. 获取导航指令：
        //    调用 get() 方法。注意，这里的 get() 是 StrategyMapper 接口的方法。
        //    当一个具体的节点类继承了 AbstractStrategyRouter 时，它必须实现自己的 get() 逻辑。
        //    所以，这一步实际上是在问“当前这个节点，你告诉我下一步该谁干？”
        StrategyHandler<T, D, R> strategyHandler = get(requestParameter, dynamicContext);

        // 2. 派工执行：
        //    如果导航指令给出了下一个工人 (strategyHandler != null)...
        if (null != strategyHandler) {
            // ...就调用这个工人的 apply() 方法，让他干活。
            return strategyHandler.apply(requestParameter, dynamicContext);
        }
        
        // 3. 处理无指令情况：
        //    如果导航指令没有给出下一个工人（比如流程正常结束），
        //    就执行一个默认的处理逻辑。
        return defaultStrategyHandler.apply(requestParameter, dynamicContext);
    }
}
```

这就是模板方法模式了。

* 定义了所有业务逻辑都必须遵循的指挥流程（先get再apply），但它自己并不知道具体该怎么get（指路）和怎么apply（干活）。
* get() 和 apply() 的实现被延迟到子类：一个具体的节点，比如 RootNode，它继承了 AbstractStrategyRouter。
  * RootNode 的 apply() 方法负责执行根节点的业务逻辑（比如参数校验）。
  * RootNode 的 get() 方法负责根据校验结果，返回下一个节点（比如 SwitchNode）。

通过这种将决策能力（get）和执行能力（apply）分离，再由一个统一的调度方法（router）来**粘合**的设计，我们最终实现了按顺序/分支工作的目标，并且是以一种高度灵活、可配置的方式。

## 总结

将执行和决策分离，严格最尽可能小的粒度上遵循单一职责原则。


---
title: "DDD：用事件风暴驱动DDD领域划分"  
category: "DDD"  
publishedAt: "2025-06-03"  
summary: "DDD系列"  
tags:  
  - DDD
banner: /images/banner/posts/ddd/ddd-5.png
alt: "图片替代文本"  
mathjax: false
---
# DDD：用事件风暴驱动DDD领域划分

一个很重要的问题：如何进行领域的划分？或者你是根据什么进行领域的划分的？
这是DDD学习者逃不过的问题。

当我们面对复杂的业务系统时，这么乱的需求，该从哪里下手进行领域驱动设计（DDD）呢？领域、子域、限界上下文、聚合，到底是怎么从现实业务中长出来的？

这里其实是由一种非常高效的方法来解决这个问题的——事件风暴（Event Storming）。

事件风暴的核心思想很简单，就是跟着**业务的节奏走**，让领域自己自然的显现出来。

不是让我们一开始就去分模块，画框框找边界。而是先聚焦于业务流程中实际发生的事情，然后反向去追溯触发这些事件的用户行为和执行者，最后再识别出承载这些行为和状态的业务核心（聚合）。

这样说可能有些抽象，我们用一个熟悉的业务场景来串下：在线外卖订餐。

### 第一步：风暴领域事件：找到业务的关键时刻

什么是领域事件？

它们通常指在业务领域中已经发生过并且对业务有意义的事情。通常用**过去时态**描述，例如：“订单已创建”、“餐品已送达”、“用户已评价”。

怎么做？怎么头脑风暴？

召集业务专家、产品经理、开发人员等相关方。准备一面大墙（或在线协作白板）和大量的彩色即时贴（通常用橙色代表领域事件）。让大家自由地、尽可能多地写下在“在线外卖订餐”这个业务中，他们能想到的所有“已发生的事情”。不要怕多，不要怕乱，先发散思维。

现在我们在这个场景中，手里拿了橙色贴纸，我们会写些什么呢？现在来想一下平时点外卖的场景：

- 用户已选择餐品
- 订单已提交
- 支付已成功
- 商家已接单
- 餐品已开始制作
- 骑手已接单
- 餐品已取走
- 餐品已送达
- 订单已完成
- 用户已评价
- 退款已处理
- 优惠券已使用
- 新用户已注册
- 商家信息已更新

我们来总结一下，可以很明显的看出，领域事件是业务中客观存在的，而不是我们空想出来的。是业务流程中最真实、最不容易产生歧义的部分。从这里入手，能帮我们抓住业务的核心脉络。

### 第二步：追溯命令：谁触发了这些关键时刻？

什么是命令？

它是指用户或系统发出的，意图改变系统状态或触发领域事件的请求或动作。通常用动宾结构描述，表示一个明确的意图，例如：“提交订单”、“支付订单”、“评价订单”。一个命令通常会（期望）导致一个或多个领域事件的发生。

怎么追溯？

好，现在我们关注点在前面所识别出来的橙色的领域事件，一个一个找，现在我们手里有一张蓝色贴纸，边拿边思考：

针对每一个（或一组相关的）领域事件，反向思考：“是什么动作导致了这个事件的发生？”

用另一种颜色的即时贴，通常用蓝色代表命令，写下这些命令，并将它们贴在相应的领域事件旁边或前面。

比如，针对上面的领域事件，我们可以找到一些命令：

- 选择餐品 -> 用户已选择餐品
- 提交订单 -> 订单已提交
- 支付订单 -> 支付已成功
- 商家确认接单 -> 商家已接单
- 骑手抢单 -> 骑手已接单
- 确认送达 -> 餐品已送达
- 发表评价 -> 用户已评价

可以看到，命令揭示了系统的“交互点”和用户的“意图”。它们是连接用户与系统内部逻辑的桥梁。

### 第三步：识别执行者/ 角色 - 谁发出了这些命令？

什么是执行者/角色？
他们是发出命令的实体，可以是具体的用户类型（如“顾客”、“商家”、“骑手”），也可以是外部系统，甚至是定时任务。

怎么找？
这里就比较简单了，针对每个命令，思考：“是谁（或什么）发起了这个命令？

用另一种颜色的即时贴，通常用黄色代表Actor，写下这些执行者，并将它们贴在相应的命令旁边。

- 顾客 -> 选择餐品, 提交订单, 支付订单, 发表评价
- 商家 -> 商家确认接单
- 骑手 -> 骑手抢单, 确认送达
- 支付系统 (外部系统) -> (可能触发与支付相关的内部命令或事件)

### 第四步：聚合领域对象 (Aggregates) - 谁来承载这些行为和状态？

这是最关键的一步，也是从“业务流程”走向“领域模型”的核心。

什么是聚合？
简单来说，聚合就是业务领域中那些“有身份、有行为、有状态、能独立完成一些事情”的核心“东西”。

它是一组业务上紧密关联的实体（Entity）和值对象（Value Object）的集合，被视为一个数据修改和一致性管理的单元**。聚合有一个明确的根实体，称为聚合根（Aggregate Root），外部对象只能通过聚合根来访问和操作聚合内部的对象。

怎么做？

观察我们梳理出来的事件流和命令流，寻找那些，围绕着特定业务概念发生状态变化和行为的“名词”或“业务实体”。这些通常就是聚合根的候选。

将相关的命令和事件“聚集”到这些候选的聚合根周围。一个聚合会负责处理一组相关的命令，并产生相应的领域事件。

最后，用另一种颜色的即时贴，通常用粉色或紫色代表聚合，标识出来。比如：

- 订单 (Order)：围绕它发生了 订单已提交, 支付已成功, 商家已接单, 餐品已送达, 订单已完成等事件，以及提交订单, 支付订单等命令。它有自己的生命周期和状态（待支付、待发货、已完成等）。
- 用户 (User/Customer)：围绕它发生了 新用户已注册, 用户已评价等事件，以及发表评价等命令。它有自己的属性（如用户名、地址）和行为。
- 商家 (Restaurant/Merchant)：围绕它发生了 商家信息已更新, 商家已接单等事件，以及商家确认接单 等命令。它有自己的属性（如店名、菜单、营业状态）。
- 骑手 (Rider)：围绕它发生了 骑手已接单, 餐品已取走等事件，以及骑手抢单等命令。它有自己的状态（空闲、配送中）。
- 餐品 (MenuItem)：虽然它本身可能不会直接处理很多命令，但它是订单的重要组成部分，商家会管理餐品信息。

> 通过命令驱动聚合行为，聚合行为产生领域事件，这条线索非常清晰。
>

### 第五步：划分边界 - 限界上下文 (Bounded Contexts) 的浮现

当我们将事件、命令、执行者、聚合都梳理出来，并按照业务流程的时间顺序排列后，往往会发现一些自然的“聚类”现象。

什么是限界上下文？
它是一个明确的语义边界，在这个边界内，领域模型（包括聚合、实体、值对象以及它们使用的统一语言）有其唯一确定的含义。

不同的限界上下文可以有自己独立的模型，即使是相同的词汇，在不同的上下文中也可以有不同的含义（例如，“商品”在“销售上下文”和“库存上下文”中关注点不同）。

怎么做？（这是一个更复杂和需要经验的过程，事件风暴是起点）**

观察聚合的“亲疏关系”：哪些聚合经常一起协作来完成一个更大的业务能力？哪些聚合之间的交互相对较少？

寻找“语言边界”：在讨论中，是否发现某些术语在描述不同业务场景时含义发生了微妙的变化？这可能是不同限界上下文的信号。

考虑团队组织和技术关注点：不同的限界上下文可以由不同的团队负责，也可以采用不同的技术栈（在微服务架构中）。

在事件风暴图上尝试画出边界线：看看哪些事件、命令、聚合在逻辑上更像一个“内聚的整体”，它们共同支撑着某一块相对独立的业务能力。比如：

- **订单上下文 (Ordering Context)**：可能包含**订单**聚合，处理从下单到订单完成的核心流程。
- **用户上下文 (User Context)**：可能包含**用户**聚合，处理用户注册、认证、个人信息管理、评价等。
- **商家上下文 (Merchant Context)**：可能包含**商家**聚合和**餐品**聚合（或将餐品作为商家聚合的一部分），处理商家入驻、信息维护、菜单管理、接单等。
- **配送上下文 (Delivery Context)**：可能包含**骑手**聚合，处理骑手接单、取餐、送达等物流配送相关的业务。
- **支付上下文 (Payment Context)**：可能与外部支付系统交互，处理支付请求和结果。
- **营销上下文 (Marketing Context)**：可能处理优惠券的发放和使用。

限界上下文是DDD战略设计的核心。它帮助我们将复杂的“大领域”分解为若干个边界清晰、职责明确、可以独立演化的小领域。这是实现高内聚、低耦合的关键。

从限界上下文到子域的映射

通常来说，我们找到了限界上下文之后，一个个子域也会浮现出来，一个或多个紧密相关的限界上下文会构成一个子域 (Subdomain)。

- “订单上下文”、“支付上下文”、“营销上下文”可能共同构成了“交易核心子域”。当然，随着业务的进行，我们还可以继续分。
- “用户上下文”可能构成了“用户管理子域”。
- “商家上下文”可能构成了“商户服务子域”。
- “配送上下文”可能构成了“物流配送子域”。

然后，我们再根据这些子域对企业核心竞争力的贡献程度，将其划分为核心域、通用域和支撑域，从而指导我们的资源投入和技术选型。

至此，战略设计大致完成，接下来我们可以投入到战术设计上去。

---

参考资料:
- 事件风暴:[EventStorming](https://www.eventstorming.com/)

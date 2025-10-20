---
title: 订单先行（Order-First Pattern）"  
category: "SB-Q"  
publishedAt: "2025-10-19"  
summary: "场景题思考"  
tags:  
  - Software
banner: /images/banner/posts/sd/sd-order-first.png
alt: "图片替代文本"  
mathjax: false
---

# 订单先行（Order-First Pattern）

最近在做项目的过程中，发现在几个核心场景中都用到了一种类似的思想，在此做个总结。


话不多说，先附上代码。

#### 积分兑换SKU

```java
@RequestMapping("credit_pay_exchange_sku")
public Response<Boolean> creditPayExchangeSku() {
    // 步骤1: 创建活动订单
    UnpaidActivityOrderEntity unpaidOrder =
    raffleActivityAccountQuotaService.createOrder(skuRechargeEntity);

    // 步骤2: 扣减积分（执行业务逻辑）
    String orderId = creditAdjustService.createOrder(
        TradeEntity.builder()
            .amount(unpaidOrder.getPayAmount().negate())
            .outBusinessNo(unpaidOrder.getOutBusinessNo())
            .build()
    );
}
```

#### 用户执行抽奖

```java
@RequestMapping("draw")
public Response<ActivityDrawResponseDTO> draw() {
    // 步骤1: 创建抽奖订单（扣减抽奖次数）
    UserRaffleOrderEntity orderEntity =
            raffleActivityPartakeService.createOrder(userId, activityId);

    // 步骤2: 执行抽奖（业务逻辑）
    RaffleAwardEntity raffleAwardEntity =
            raffleStrategy.performRaffle(
                    RaffleFactorEntity.builder()
                            .userId(orderEntity.getUserId())
                            .strategyId(orderEntity.getStrategyId())
                            .build()
            );

    // 步骤3: 保存中奖记录
    awardService.saveUserAwardRecord(userAwardRecord);
}
```

#### 行为返利（消息队列）

```java
@RabbitListener(queuesToDeclare = @Queue("${spring.rabbitmq.topic.send_rebate}"))
public void listener(String message) {
    switch (rebateMessage.getRebateType()) {
        case "sku":
            // 步骤1: 创建充值订单
            raffleActivityAccountQuotaService.createOrder(skuRechargeEntity);
            break;
        case "integral":
            // 步骤1: 创建积分订单（直接入账）
            creditAdjustService.createOrder(tradeEntity);
            break;
    }
}
```

通过分析这三个核心业务场景（积分兑换、抽奖、异步返利）的代码，可以清晰地看到一种设计方式，我将其总结为**订单先行（Order First）**。

也就是做核心业务操作之前先做订单处理。类似于很多中间件中的WAL。 这是一种以资源预留和状态凭证为核心，结合同步编排与异步解耦的一种务实的，保证高可靠性的设计模式。


### 核心思想

在执行任何核心业务逻辑之前，系统做的第一件事，永远是创建一个订单或凭证 (createOrder)。这个订单不仅仅是交易订单，它可以是抽奖单、积分调整单、返利记录单等。

这个操作看起来很简单，也带来了问题，就是数据库中会带来大量的订单数据，那么我们为什么要做这样一种操作呢？

我总结了一下，其实它巧妙地解决了三个分布式系统中的核心难题：

**幂等性保障**：
在`credit_pay_exchange_sku`接口中，`createOrder`返回的`unpaidOrder`里必然包含一个全局唯一的业务号 (`outBusinessNo`)。

如果后续的`creditAdjustService.createOrder`因为网络超时而重试，下游服务可以依据这个唯一的`outBusinessNo`来判断是否是重复请求，从而避免重复扣减积分。


**状态的追踪与可补偿性：**

在`draw`接口中，如果在`performRaffle`执行抽奖时系统异常，那么我们创建的`UserRaffleOrderEntity`（抽奖订单）就成了一个可追溯的凭证。我们可以通过后台任务扫描这些“已创建但未完成”的抽奖单，进行补偿（如退还抽奖次数）或重试。

订单记录了业务流程的中间状态。它将一个复杂的、多步骤的操作，从一个执行完就忘的过程，变成了一个有状态、可管理、可恢复的过程。


_**这种设计体现了互联网系统的核心原则： 先记录后执行（日志先行）；状态驱动流程（状态机）；最终一致性（分布式事务）。**_


### 思考：为什么不是先业务操作再进行订单处理？

因为这样做，等于主动放弃了分布式系统中最为宝贵的几样东西——原子性、幂等性和可追溯性。

订单先行模式，本质上是一种防御性编程思想。它通过一个简单的顺序调换，将一个充满不确定性的、无状态的操作，巧妙地转化成了一个有状态的、可管理的、对失败友好的可靠事务。

比如：

```java
@Transactional
@PostMapping("/exchange")
public Response exchange(@RequestBody ExchangeRequest request) {
    // 步骤1：检查库存（外部RPC调用）
    boolean stockAvailable = stockService.checkAndLock(request.getProductId(), 1);
    if (!stockAvailable) {
        throw new BizException("库存不足");
    }

    // 步骤2：扣减用户积分（核心业务逻辑）
    creditService.deduct(request.getUserId(), request.getPoints());

    // 步骤3：创建兑换订单（持久化记录）
    Order order = createOrderRecord(request);
    orderRepository.save(order);

    return Response.success();
}
```
有哪些问题？

- 超时重试 -> 重复扣减：`creditService.deduct()`成功了，但向客户端返回响应时网络超时。前端框架的重试机制或用户的手动刷新，会让这个请求再来一遍。结果库存检查通过，积分又被扣了一次。
- 部分成功 -> 无状态：`creditService.deduct()`成功了，但在orderRepository.save()时，数据库连接池满了或者主库抖动，事务回滚。结果？用户的积分没了，兑换订单却没生成。不知道该不该给用户补积分。
- 故障恢复 -> 无据可查：服务在`deduct()`之后、`save()`之前挂了。重启之后，这次操作的痕迹就只有一条扣减积分的流水，没有任何上下文。想做补偿的话，连这次操作的意图是什么都不知道。


这些问题的根源在于，我们把最关键的**意图和凭证**的创建，放在了流程的最后。这就像先让客人吃饭，吃完了再让他买单，一旦客人跑了，就只能认栽。


### 思维改变

这种模式，其实本质上是一种思维模式的转变： 

从一种过程式的执行者思维：接收请求 -> 执行逻辑 -> 保存结果。 

转变为**事务性**的规划者思维：接收请求 -> 先立项（创建订单），获取唯一ID -> 带着项目ID去执行 -> 随时更新项目状态。

它虽然会增加代码量和一次数据库写入。但对于任何涉及到状态变更、资源消耗、跨服务调用的核心业务接口，这点成本换来的是系统的确定性、健壮性和可维护性的很大的提升。

**_下次设计一个新接口时，不妨先问自己一个问题：如果这个流程在任何一步中断，我能知道发生了什么吗？我能修复它吗？_**
---
title: "DDD：战术设计（二）充血模型"  
category: "DDD"  
publishedAt: "2025-06-03"  
summary: "DDD系列"  
tags:  
  - DDD
banner: /images/banner/posts/ddd/ddd-zhanshu-2.png
alt: "图片替代文本"  
mathjax: false
---
# DDD：战术设计（二）充血模型


在上一篇，我们聊了实体、值对象和聚合。可能会觉得实体和值对象，不就跟以前在`domain`包里建的类差不多。
聚合，也就是把几个关系近的类放一块儿。没那么夸张。

其实从表面看确实如此。DDD里的一些名词，没有那么神秘。

那么，DDD到底想干什么？

今天要聊的充血模型，才是DDD战术设计最核心的部分。

### 1. 贫血模型

绝大多数时候，我们用MVC框架写出来的代码，领域对象（`domain`包里的类）都是贫血模型 (Anemic Domain Model)。

什么是贫血模型？
简单说，就是一个类**只有数据，没有行为**。一个数据架子，上面摆满了各种数据，但它自己不知道怎么使用这些数据。

```java
// 典型的贫血模型 Order.java
public class Order {
    private Long orderId;
    private BigDecimal amount;
    private String status;
    private Long userId;
    // ... 可能还有几十个字段

    // 方法只有一堆的 getter 和 setter
    public Long getOrderId() { return orderId; }
    public void setOrderId(Long orderId) { this.orderId = orderId; }
    // ... 几十个 getter 和 setter
}
```

1.  类里只有字段和对应的`getter/setter`方法。
2.  它不包含任何业务逻辑。
3.  它通常和数据库的表结构一一对应。

**业务逻辑去哪了？**

全都在`Service`层里。

我们的代码调用链路通常是`Controller -> Service -> DAO`。`Controller`负责接收参数、调用`Service`、返回结果。而`Service`层，就成了所有业务逻辑的冗杂。

```java
// 臃肿的 OrderService.java
public class OrderService {
    private OrderDAO orderDAO;
    private UserDAO userDAO;
    private ProductDAO productDAO;
    private CouponDAO couponDAO;
    // ... 可能注入了七八个DAO

    public void cancelOrder(Long orderId) {
        // 1. 从DAO获取数据（贫血对象）
        Order order = orderDAO.findById(orderId);
        User user = userDAO.findById(order.getUserId());

        // 2. 在Service里执行一大堆业务逻辑判断
        if (order == null) {
            throw new BizException("订单不存在");
        }
        if (!"PAID".equals(order.getStatus())) {
            throw new BizException("只有已支付的订单才能取消");
        }
        if (user.isVip() && order.getAmount().compareTo(VIP_THRESHOLD) > 0) {
            // VIP大客户的取消逻辑可能更复杂...
        }

        // 3. 直接操作贫血对象，修改它的状态
        order.setStatus("CANCELLED");

        // 4. 调用其他DAO，执行其他数据操作
        couponDAO.returnCoupon(order.getCouponId()); // 返还优惠券
        productDAO.increaseStock(order.getProductId(), order.getQuantity()); // 恢复库存

        // 5. 将修改后的贫血对象存回去
        orderDAO.update(order);
    }
}
```

“贫血”，就是因为`Order`这个本该最懂订单业务的类，却对如何取消自己、需要满足什么条件一无所知。它没有“血液”，没有生命力，所有的业务行为都被抽离到了外部的`Service`中。

### 2. 充血模型：DDD的核心

DDD战术设计最与众不同的一点，就是要求你把聚合（以及其内部的实体、值对象）设计成充血模型 (Rich Domain Model)。

什么是充血模型？
简单说，就是数据和操作这些数据的业务行为，被封装在同一个类里。这个类不仅是个数据架子，更是一个有血、能自己处理自己事务的对象。

我们来给上面的`Order`聚合充血：

```java
// 充血模型 Order.java (聚合根)
public class OrderAggregateRoot  {
    private OrderId orderId;
    private BigDecimal amount;
    private String status;
    private Long userId;
    private Long couponId;
    private List<OrderItem> orderItems;

    // 构造函数、getter... (注意：setter通常是私有的，或不存在，修改状态要通过业务方法)
    private void setStatus(String status) { this.status = status; }

    /**
     * 取消订单 - 这是属于Order自己的业务行为！
     * @param couponRepository 用于返还优惠券
     * @param productRepository 用于恢复库存
     */
    public OrderCancelledEvent cancel() {
        // 1. 业务规则校验，由聚合根自己负责！
        if (!"PAID".equals(this.status)) {
            throw new BizException("只有已支付的订单才能取消");
        }

        // 2. 改变自己的状态
        this.setStatus("CANCELLED");
        
        // 3. 发布一个领域事件，通知外部世界“我被取消了”
        // 把返还优惠券、恢复库存等“副作用”交给事件的监听者去处理，进一步解耦
        return new OrderCancelledEvent(this.orderId, this.couponId, this.orderItems);
    }
}
```

现在，`Service`层（在DDD中我们称之为领域服务 Domain Service）会变成：

```java
// 瘦身后的 OrderApplicationService.java
public class OrderApplicationService {
    private IOrderRepository orderRepository; // 依赖仓储接口
    private IDomainEventPublisher eventPublisher; // 依赖事件发布器

    public void cancelOrder(OrderId orderId) {
        // 1. 从仓储获取“充血”的聚合根
        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> new BizException("订单不存在"));

        // 2. 调用聚合根自己的业务方法
        OrderCancelledEvent event = order.cancel();

        // 3. 将聚合的状态变更保存回去
        orderRepository.save(order);
        
        // 4. 发布领域事件
        eventPublisher.publish(event);
    }
}
```

可以看到区别，代码可读性极高。

*   业务逻辑回归：关于“什么情况下可以取消订单”的核心业务规则，被放回了`Order`类自己身上。`Order`最懂自己，这是天经地义的。
*   高内聚：订单的数据和订单的行为被紧密地封装在一起。想了解订单的所有业务，看`Order`类就够了，不用再去几十个`Service`里到处找。
*   应用服务变薄：`Application Service`不再处理具体的业务规则，只负责协调（加载聚合、调用方法、保存聚合、发布事件），而不去干预聚合的具体。

**充血模型，才是DDD战术建模的精华。它让你的代码组织方式，从面向过程的脚本式编程，回归到了真正面向对象的观念。**

### 3. 什么行为该充进去？

不是所有的逻辑都往聚合里塞。聚合里的行为，必须是**符合业务语义的**，而不是胡乱的面向数据库设计的行为。

应该充进去的行为：
*   核心业务规则和校验：比如 `order.cancel()` 里的状态检查。
*   状态变更：比如 `order.pay()` 会把状态变成`PAID`。
*   内部计算：比如 `order.recalculateTotalAmount()`。
*   保护业务不变量：确保聚合的数据在任何时候都是合法的。

不应该充进去的行为：
*   持久化逻辑：聚合不应该关心自己如何被存入数据库。所以，`order.insert()` 或 `order.update()` 这样的方法是绝对错误的,这是仓储（Repository）的职责。
*   跨聚合的协调：如果一个操作需要协调多个不同的聚合（比如下单操作需要同时操作`Order`聚合和`User`聚合），这个协调逻辑应该放在应用服务或领域服务中。
*   技术细节：发送邮件、记录日志、事务管理等，这些都不属于领域行为。

### 总结

DDD的战术设计，不在于引入了多少新名词，而在于通过充血模型这个核心，迫使我们构建出高内聚、低耦合、更能真实反映业务的模型。


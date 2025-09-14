---
title: "DDD：战术设计（一）实体，值对象，聚合根"  
category: "DDD"  
publishedAt: "2025-07-03"  
summary: "DDD系列"  
tags:  
  - DDD
banner: /images/banner/posts/ddd/ddd-zhanshu-1.png
alt: "图片替代文本"  
mathjax: false
---
# DDD：战术设计（一）实体，值对象，聚合根

战略设计过完之后，就是相对更难的，也是更核心的战术设计，这个步骤了，但是难也是难在代码落地上，这里先过下基本的概念，了解战术设计要做什么。

其实这里就开始牵扯到了类的设计，也就是我们通过战略设计得到的限界上下文中有哪些类，这些类之间如何配合解决上下文中要解决的问题。

战术设计里有很多高大上的词：聚合、实体、值对象，领域服务，领域事件，命令 ……

面试时，面试官可能会问： 

能结合你的项目，谈谈你是如何理解和应用DDD聚合的吗？如果只会说聚合就是一堆对象放一起，显然是不够的。

### 1. 实体 (Entity)

> 实体 (Entity)： 在DDD中，如果一个对象需要一个**唯一的标识符 (ID)**来跟踪其生命周期，并且其**属性是可变的**，那么它就是一个实体。

其实就是它有唯一标识，并且数据是允许变化的。
最最简单的理解，其实就是我们以前在MVC项目里写的`domain`类，比如一个`Order`类：

```java
// 传统MVC中的Order.java (通常是个贫血模型)
public class Order {
    private Long orderId; // 唯一标识
    private BigDecimal amount;
    private String status;
    private Long userId;
    // ... getters and setters
}
```

其实这个`Order`在DDD里就是一个典型的实体。

1.  首先，它有唯一标识 `orderId`：无论这个订单的状态（status）从待支付变成已完成，还是金额（amount）因为优惠而改变，只要`orderId`不变，它就还是那个订单。我们关心的是哪个订单。
2.  其次，它的数据是可变的：订单的状态、金额、收货地址等都会在其生命周期中发生变化。

在DDD的战术设计里，我们首先要识别出上下文中那些核心的、有生命周期的类，它们通常就是实体。

### 2. 值对象 (Value Object)

> 值对象 (Value Object)： 一个用于度量或描述事物属性的对象，它没有唯一标识符，其相等性是通过比较所有属性来判断的。核心特质是不可变性。

这个概念和传统MVC开发有点不一样。回到`Order`的例子，`orderId`是`Long`类型，
这太原始了，其实也可以建模成独立的类。比如一个订单ID可能不仅仅是一个数据库自增主键，还可能包含一个业务上更有意义的订单编号。我们可以把它建模成一个值对象：

代表的是一份不会变化的数据，在DDD中我们通常就可以成为值对象。
```java
// 一个代表订单标识的值对象
public final class OrderId { // final确保不可变
    private final Long id; // 数据库主键
    private final String orderNo; // 业务订单号

    // 构造函数、getter...

    @Override
    public boolean equals(Object o) {
        // ... 比较 id 和 orderNo 是否都相等
    }

    @Override
    public int hashCode() {
        // ... 基于 id 和 orderNo 生成哈希码
    }
}
```
这样做的原因主要有几个原因：

1.  它没有自己的唯一标识：`OrderId`本身不需要一个ID，它的值（`id`和`orderNo`）就完全定义了它。
2.  它是不可变的：一旦创建，`OrderId`的内容就不能再修改。
3.  它代表一份数据，而非一个东西：两个`OrderId`对象，只要它们的`id`和`orderNo`完全相同，我们就认为它们是相等的。

另一个典型的例子是收货地址 (`DeliveryAddress`)。一个地址由省、市、区、详细街道组成，它描述的是一个地点，本身没有生命周期。

```java
public final class DeliveryAddress {
    private final String province;
    private final String city;
    private final String street;
    // ...
}
```

### 3. 战术设计的核心，聚合 (Aggregate)

这是DDD战术设计中最重要、也最容易被误解的概念。

#### 问题：传统面向数据库设计的弊端

在传统MVC中，我们习惯一个数据库表对应一个`domain/entity`包下的一个类。比如订单系统有`t_order`、`t_order_item`两个表。我们就会创建`Order.java`和`OrderItem.java`两个类。

它们之间的关系通常是`OrderItem`里有一个`orderId`字段。我们要修改订单时，可能会这样写代码：

```java
// 在某个OrderService.java里...
public void addOrderItem(Long orderId, OrderItem newItem) {
    Order order = orderDao.findById(orderId);
    // 业务规则校验... 比如检查订单状态是否允许添加商品
    if (!"PENDING_PAYMENT".equals(order.getStatus())) {
        throw new BizException("订单已锁定，无法添加商品");
    }
    // 校验newItem的合法性...

    // 直接操作 orderItemDao
    orderItemDao.save(newItem);

    // 更新订单总价
    order.setTotalAmount(order.getTotalAmount().add(newItem.getPrice()));
    orderDao.update(order);
}
```
这里的问题是，业务规则（如检查订单状态）和数据操作（`orderDao`、`orderItemDao`）被分散在Service层，
`Order`和`OrderItem`自身只是数据容器，但它们之间的整体一致性确需要靠Service来手工维护。

#### DDD的解决方案：聚合

> 聚合 (Aggregate)： 一组业务上紧密关联的实体和值对象的集合，被视为一个数据修改和一致性管理的单元。聚合有一个聚合根 (Aggregate Root)，它是外部访问这个聚合的唯一入口。

DDD要求我们用更面向对象的思想来思考：也就是把有强关系的类，搞成一个聚合。一组聚合在一起的类，在最外层的就是聚合根。

怎么把不同的类聚合在一起？

其实聚合也是有边界的概念的。边界如何确定？

生命周期。聚合里面的类的生命周期被要求是一致的。创建的时候一起创建，删除的时候一起删除。更新的时候，必须放在一个事务里，要么一起成功，要么一起失败。



`Order`和`OrderItem`在业务上是一个整体，一个订单天然地“包含”它的订单项。`DeliveryAddress`也是这个订单的一部分。



所以，我们可以将它们建模成一个聚合：
```java
public class OrderAggregateRoot { // 标记为聚合根

    private OrderId orderId; // 实体标识，现在是值对象
    private BigDecimal totalAmount;
    private String status;
    
    // Order 包含了 OrderItem 的集合，OrderItem是聚合内部的实体
    private List<OrderItem> orderItems; 
    
    // Order 包含了 DeliveryAddress，这是一个值对象
    private DeliveryAddress deliveryAddress;

    // 关键：业务行为内聚到聚合根！
    public void addOrderItem(Product product, int quantity) {
        // 1. 业务规则校验，由聚合根自己负责！
        if (!"PENDING_PAYMENT".equals(this.status)) {
            throw new BizException("订单已锁定，无法添加商品");
        }

        // 2. 创建一个新的OrderItem（聚合内部的对象）
        OrderItem newItem = new OrderItem(product.getId(), product.getPrice(), quantity);
        
        // 3. 修改聚合内部的状态
        this.orderItems.add(newItem);
        this.recalculateTotalAmount(); // 重新计算总价的逻辑也封装在内部
    }

    private void recalculateTotalAmount() {
        this.totalAmount = this.orderItems.stream()
            .map(OrderItem::getTotalPrice)
            .reduce(BigDecimal.ZERO, BigDecimal::add);
    }
    
    // ... 其他业务方法，如 cancel(), pay(), ship()
}
```

聚合的几个核心要点：

1.  边界概念：聚合定义了一个清晰的业务边界。`Order`, `OrderItem`, `DeliveryAddress`都在这个边界内。
2.  聚合根 (Aggregate Root)：`OrderAggregateRoot`是这个聚合的根。外部世界**只能**通过`OrderAggregateRoot`对象来访问和修改其内部的`orderItems`和`deliveryAddress`，**绝不能**绕过`OrderAggregateRoot`直接去操作`OrderItem`。聚合根是这个聚合的入口，负责维护内部所有对象的一致性。
3.  一致的生命周期：聚合边界内的对象，其生命周期是保持一致的。创建`OrderAggregateRoot`时，`OrderItem`和`DeliveryAddress`也随之创建。删除`Order`时，它们也一起被删除。
4.  事务边界：对一个聚合的任何修改，都必须在一个事务内完成，要么一起成功，要么一起失败。保证了聚合的数据一致性。


一般来说，如果我们分析业务的时候，分析出上面四点，就可以搞一个聚合根聚合起来了。

### 4. 聚合的搬运工，仓储 (Repository)

这里多提一点，既然提到了聚合根，DDD架构的仓储层，其实就是用来把我们的数据根具体的持久层进行交互的layer。

比如，我们要把一个聚合从持久层查询出来，就可以用聚合对应的仓储来查询。

有点类似与之前的DAO，但又不只是DAO。


> 仓储 (Repository)： 介于领域模型和数据持久化之间的抽象层。它提供了一种类似内存集合的接口，让上层代码（如应用服务）可以通过它来获取和保存聚合，而无需关心底层的数据库实现。

仓储负责将聚合从数据库中重建出来，或者将聚合的状态拆解并存入数据库。

```java
// 接口定义在Domain层
public interface IOrderRepository {
    Optional<Order> findById(OrderId orderId);
    void save(Order order);
}

// 实现在Infrastructure层
public class OrderRepositoryImpl implements IOrderRepository {
    // ... 注入JPA/MyBatis的Mapper

    @Override
    public Optional<Order> findById(OrderId orderId) {
        // 1. 从数据库查询出 OrderPO 和 List<OrderItemPO>
        // 2. 将PO转换(映射)为 Order 聚合根 和其内部的 OrderItem 列表
        // 3. 返回完整的 Order 聚合
    }

    @Override
    public void save(Order order) {
        // 1. 将 Order 聚合根拆解、转换为 OrderPO 和 List<OrderItemPO>
        // 2. 在一个事务内，保存或更新这些PO到数据库
    }
}
```
**关键点**：仓储的操作单位是聚合，它隐藏了所有的数据库细节。


### 总结

DDD战术设计的这些新的名词，其实是写代码思维的一个改变，由面向数据库编程，变成面向业务编写，以一种更面向对象的方式去实现代码。

*   从面向数据库表的设计，转变为面向业务概念和行为的设计。
*   从业务逻辑散落在Service层，转变为逻辑内聚到领域对象（聚合）自身。
*   通过聚合这个强大的工具，定义了清晰的业务边界和一致性边界，使得复杂的业务逻辑被拆解和封装，极大提高了代码的可维护性和可理解性。




> 在我们之前的MVC项目里，订单相关的逻辑分散在好几个Service里，`Order`和`OrderItem`都只是贫血的数据类。
> 在我们重构时，我们引入了DDD的战术设计。我们识别出`Order`是一个**聚合根**，它包含了`OrderItem`实体和`DeliveryAddress`值对象
。我们把添加订单项、修改地址、计算总价等核心业务规则都内聚到了`Order`聚合根的方法中，确保了任何修改都必须通过聚合根这个唯一的入口，
从而保证了订单内部数据的强一致性。我们还定义了`IOrderRepository`接口来负责整个聚合的持久化，实现了领域模型与数据库的解耦……


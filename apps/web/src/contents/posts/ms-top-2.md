---
title: "Microservice(二)：深入理解事务性发件箱模式"
category: "Software Development"
publishedAt: "2025-06-06"
summary: "SD"  
tags:  
  - Microservice
banner: /images/banner/posts/microservice/ms-top-02.png
alt: "图片替代文本"  
mathjax: false
---


# 深入理解事务性发件箱模式：牢牢把握住每一条消息

在构建复杂的分布式系统时，我们经常需要在完成一个业务操作（比如在数据库下单 🛒）之后，通知其他系统或者模块执行后续任务（比如发送邮件 📧，更新缓存 🔄）。一个常见的做法是，在业务操作的同一个事务中，直接调用消息队列（MQ）的发送接口。

听起来很直接，很简单，🤔 但是，这里隐藏着一个经典的分布式难题：**数据库操作和MQ发送操作，它们不属于同一个事务管理器，如何保证这两个操作的原子性呢？**

这可能导致以下情况：

* 数据库操作成功了 👍，但MQ发送失败了 ❌（网络问题、MQ挂了）。结果：业务完成了，但下游的通知丢了，石沉大海 🌊。
* MQ发送成功了 👍，但数据库操作失败回滚了 ❌。结果：下游收到了一个“幽灵”消息 👻，对应的业务数据可能根本不存在或状态不一致。

这两种情况都会导致数据不一致，是我们极力希望避免的。传统的分布式事务（如XA、TCC）虽然能解决这个问题，但它们引入的复杂度和性能开销往往让人望而却步 😫。

那么，有没有一种更轻量、更可靠的方式呢？这就是我们今天要隆重介绍的主角—— **事务性发件箱模式 (Transactional Outbox Pattern)** 。

## 理论先行：什么是事务发件箱模式？

事务性发件箱模式是一种通过**本地数据库事务**来保证“业务操作”和“发送消息的意图”原子性执行的一种精妙设计。它的核心思想是：

* **引入“发件箱”表** 🗳️：在与业务数据相同的数据库中，创建一个额外的表，我们称之为“发件箱表”（Outbox Table）。这张表专门用来存储那些**将要被发送到消息队列的消息**。
* **原子写入** ✍️：当执行一个需要发布事件的业务操作时，在**同一个本地数据库事务**中，同时完成以下两件事：
  1. 对业务数据表进行增删改操作。
  2. 向“发件箱表”插入一条记录，这条记录代表了要发送的MQ消息（包含消息内容、目标主题、状态等）。
* **独立的“消息中继”服务** 🚀：有一个独立的进程或线程（我们称之为“消息中继”或“事件发布器”），它会定期或实时地进行如下操作：
  1. 轮询“发件箱表”，查找那些状态为“待发送”的消息。
  2. 将这些消息发布到真正的消息队列（如RabbitMQ, Kafka）。
  3. 消息成功发布到MQ后，更新“发件箱表”中对应记录的状态为“已发送”，或者直接删除该记录。

**为什么这样做能保证可靠性？**

1. **原子性保证** ：核心业务操作和“记录要发送的消息”被绑定在同一个数据库事务中。数据库的ACID特性就会保证它们要么都成功，要么都失败。这样就避免了“业务成功但消息意图丢失”，或者“消息发送的意图记录但业务操作失败”的情况。
2. **持久化保障** ：即使应用程序在事务提交后、消息中继服务发送消息前不幸崩溃 💥，由于消息意图已经持久化在发件箱表中，当中继服务恢复或应用重启后，它仍然可以从发件箱中找到未发送的消息并进行处理。
3. **解耦清晰** ：业务逻辑的执行与消息的实际发送是解耦的。业务代码不需要关心MQ是否可用或发送是否立即成功，可以“发射后不管”（fire-and-forget，但实际上我们管了 😉）。

**没有绝对的银弹，那么这样做有什么缺点呢？** ⚖️

* **消息延迟** ：消息的实际发送会比业务操作完成晚一步（因为需要中继服务轮询或触发）。
* **数据库额外负载** ：增加了对发件箱表的读写操作，可能会对数据库造成一定的压力。
* **实现消息中继服务的成本** ：需要额外实现这个消息中继服务，并且这个服务需要保证自身的健壮性和幂等性（防止重复发送）。

## 动手实践：以用户中奖记录保存与发奖通知为例 🎁

### 在DB中创建`task`表：充当“发件箱”

```java
@Data
public class Task {
    private String id;          // 自增ID (实际可能是UUID或业务ID)
    private String userId;      // 关联的用户ID
    private String topic;       // 消息主题 (对应MQ的Topic/Exchange)
    private String messageId;   // 消息编号 (MQ消息的唯一ID)
    private String message;     // 消息主体 (JSON序列化后的消息内容)
    private String state;       // 任务状态；create-创建、completed-完成、fail-失败
    private Date createTime;
    private Date updateTime;
}
```

### 编写业务方法：`saveUserAwardRecord`

```java
@Override
public void saveUserAwardRecord(UserAwardRecordAggregate userAwardRecordAggregate) {

    UserAwardRecordEntity userAwardRecordEntity = userAwardRecordAggregate.getUserAwardRecordEntity(); // 业务实体
    TaskEntity taskEntity = userAwardRecordAggregate.getTaskEntity(); // 消息任务实体
    String userId = userAwardRecordEntity.getUserId();
    // ... (其他变量获取)

    // 1. 将业务实体和消息任务实体转换为数据库POJO
    UserAwardRecord userAwardRecord = new UserAwardRecord(); // 中奖记录PO
    // ... (userAwardRecord 属性赋值)
    userAwardRecord.setAwardState(userAwardRecordEntity.getAwardState().getCode()); // 初始状态，如 "create" (待发奖)

    Task task = new Task(); // 发件箱任务PO
    task.setUserId(taskEntity.getUserId());
    task.setTopic(taskEntity.getTopic());
    task.setMessageId(taskEntity.getMessageId());
    task.setMessage(JSON.toJSONString(taskEntity.getMessage())); // 序列化后的MQ消息内容
    task.setState(taskEntity.getState().getCode()); // 初始状态，如 "create" (待发送)

    UserRaffleOrder userRaffleOrderReq = new UserRaffleOrder(); // 用于更新抽奖订单状态的PO
    // ... (userRaffleOrderReq 属性赋值)

    try {
        dbRouter.doRouter(userId); // 如果有分库分表，路由到正确的库

        // 2. 【核心】使用编程式事务，保证业务数据写入和Task记录写入的原子性
        transactionTemplate.execute(status -> {
            try {
                // a. 写入中奖记录 (业务数据)
                userAwardRecordDao.insert(userAwardRecord);
                // b. 写入MQ任务记录到task表 (发件箱数据)
                taskDao.insert(task);
                // c. 更新抽奖订单状态 (其他相关业务数据)
                int count = userRaffleOrderDao.updateUserRaffleOrderStateUsed(userRaffleOrderReq);
                if (1 != count) { // 校验是否成功更新，防止重复抽奖等
                    status.setRollbackOnly();
                    log.error("写入中奖记录，用户抽奖单已使用过，不可重复抽奖 userId: {} ...", userId); // 实际项目中填充完整日志
                    throw new AppException(ResponseCode.ACTIVITY_ORDER_ERROR.getCode(), "用户抽奖单已使用"); // 举例
                }
                return 1;
            } catch (DuplicateKeyException e) { // 处理唯一索引冲突等DB异常
                status.setRollbackOnly();
                log.error("写入中奖记录，唯一索引冲突 userId: {} ...", userId); // 实际项目中填充完整日志
                throw new AppException(ResponseCode.INDEX_DUP.getCode(), e);
            }
        });
    } finally {
        dbRouter.clear(); // 清理分库分表路由信息
    }

    // 3. 【优化】事务成功提交后，立即尝试发送一次MQ消息 (提高实时性)
    try {
        eventPublisher.publish(task.getTopic(), task.getMessage()); // 调用MQ发送工具类
        // 如果发送成功，更新task表中的状态为 "completed"
        taskDao.updateTaskSendMessageCompleted(task);
        log.info("写入中奖记录，发送MQ消息完成 userId: {} ...", userId); // 实际项目中填充完整日志
    } catch (Exception e) {
        log.error("写入中奖记录，发送MQ消息失败 userId: {} ...", userId); // 实际项目中填充完整日志
        // 如果发送失败，更新task表中的状态为 "fail" (或保持 "create"，等待定时任务补偿)
        taskDao.updateTaskSendMessageFail(task);
    }
}
```

为了让消息尽快送达 🚀，在数据库事务成功提交后，我们会**立即尝试**调用 `eventPublisher.publish` 来发送MQ消息。

* 如果这次发送成功 🎉，`task` 表中对应记录的状态会更新为 `completed`。
* 如果这次发送失败 😥（比如网络瞬断），`task` 表的状态会更新为 `fail`。但请注意，即使这里更新状态失败，由于Task记录（状态为`create`或未成功更新为`completed`）已经在DB中，后续的补偿机制依然会生效。我们有后备军！💪

### “消息中继”服务：`SendMessageTaskJob.java`

我们这里使用Spring的定时任务 (`@Scheduled`)，它会定期（比如每5秒）“巡逻”：

```java
@Slf4j
@Component()
public class SendMessageTaskJob {

    @Resource
    private ITaskService taskService; // 内部会调用 ITaskDao
    @Resource
    private IDBRouterStrategy dbRouter; // 处理分库分表

    @Scheduled(cron = "0/5 * * * * ?") // 每5秒执行一次检查
    public void exec_db01() { // 示例：处理第一个库的任务
        try {
            dbRouter.setDBKey(1);
            dbRouter.setTBKey(0);

            // a. 从task表查询状态不是 "completed" 的任务
            List<TaskEntity> taskEntities = taskService.queryNoSendMessageTaskList();
            if (taskEntities.isEmpty()) return; // 没有任务，休息一下 ☕

            // b. 遍历这些待处理的任务
            for (TaskEntity taskEntity : taskEntities) {
                try {
                    // c. 尝试重新发送MQ消息
                    taskService.sendMessage(taskEntity); // 内部调用 eventPublisher
                    // d. 如果发送成功，更新task表状态为 "completed"
                    taskService.updateTaskSendMessageCompleted(taskEntity.getUserId(), taskEntity.getMessageId());
                } catch (Exception e) {
                    log.error("定时任务，发送MQ消息失败 userId: {} topic: {}", taskEntity.getUserId(), taskEntity.getTopic());
                    // e. 如果仍然失败，更新task表状态为 "fail" (或者增加重试次数字段，达到上限后标记为fail)
                    taskService.updateTaskSendMessageFail(taskEntity.getUserId(), taskEntity.getMessageId());
                }
            }
        } catch (Exception e) {
            log.error("定时任务，扫描MQ任务表发送消息失败。", e);
        } finally {
            dbRouter.clear();
        }
    }
    // 可能还有 exec_db02() 等方法处理其他分库的任务
}
```

这个定时任务就是事务性发件箱模式中的“消息中继”角色。它定期从`task`表中捞取那些“创建了但未成功发送”或“上次发送失败”的消息任务，然后尝试将这些消息重新发送到MQ，并根据发送结果更新`task`表的状态。

之后，一些**消息消费者**会根据MQ上的消息，来**执行实际的发奖操作**。例如，如果是积分奖品 ，可能会调用积分服务增加用户积分，并更新用户中奖记录的状态为“已完成”。

也就是说，用户中奖了，我们不直接在主流程里给他发奖（这可能很慢），而是通过MQ异步调用其他服务来执行发奖等复杂操作。这样就提高了主接口的一个响应时间，用户体验up up！💨

除了上述的发奖通知，我们也可以将这种模式应用于：

* **行为返利** 🚶‍♀️➡️🎁：用户完成签到等行为后，记录返利订单和发送返利MQ的Task。
* **积分调整** 📈📉：用户积分账户发生变动后，记录积分流水和发送积分调整成功MQ的Task。

## 总结 🏁

通过将“发件箱”的职责赋予通用的 `task` 表，并结合“**事务内记录意图 + 事务后即时尝试 + 后台定时补偿**”的策略，非常优雅且可靠地解决了分布式环境下业务操作与MQ消息发送的原子性问题。

这种模式虽然引入了额外的`task`表和定时任务，增加了一些复杂性，但它换来的是系统消息传递的**强可靠性** 💪，这在许多业务场景中是非常值得的。它也是在不使用重量级分布式事务情况下，实现“准事务”效果的常用且有效的手段。


---

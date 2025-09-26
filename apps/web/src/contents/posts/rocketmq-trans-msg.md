---
title: "RocketMQ的事务消息"  
category: "ReadCode"  
publishedAt: "2025-07-20"  
summary: "ReadCode"  
tags:  
  - DevOps
banner: /images/banner/posts/rocketmq/rocketmq-trans-msg.png
alt: "图片替代文本"  
mathjax: false
---

## RocketMQ的事务消息

RocketMQ的事务消息，基本的实现思路都应该知道：半消息+回查机制。今天深入到代码以及日常API的使用来理解下。

分布式事务问题。为了解决一半成功，一半失败的局面，大家想出了很多办法，比如TCC、Saga，还有我们今天要聊的RocketMQ的事务消息。

### 核心思想

RocketMQ的事务消息，本质上是对二阶段提交（2PC）思想的一种巧妙实现。

**第一阶段：发送“半消息”（Prepare Message）**

当你要执行一个本地事务（比如创建订单），同时要发送一个消息时，你不会直接把消息发出去。你会先发一个“半消息”给RocketMQ的Broker。这个“半消息”很特殊，它被Broker接收了，也存储了，但对下游的消费者来说，是完全“隐身”的，消费者根本不知道它的存在。

**第二阶段：执行本地事务 & 提交/回滚**

半消息发送成功后，你就可以安心地去执行本地事务，比如往订单表里`INSERT`一条数据。

* **如果本地事务成功了**：就给Broker再发一个`COMMIT`指令。Broker收到后，会把那个半消息标记为可投递，这时候消费者才能真正地消费到它。
* **如果本地事务失败了**：就给Broker发一个`ROLLBACK`指令。Broker会直接把那个半消息给删了，就当无事发生。

**事务状态回查**

最关键的问题来了：如果在执行完本地事务，准备发送`COMMIT`指令的时候，应用突然崩了，或者断网了，怎么办？这时候Broker那边就只有一个半消息，它不知道该提交还是该回滚，就这么一直挂着，就会出现问题了。

所以，RocketMQ设计了：事务状态回回查机制。

对于那些长时间没有收到`COMMIT`或`ROLLBACK`指令的半消息，Broker会不耐烦地反过来问这个生产者：之前你发的那个消息（ID是xxx）对应的本地事务，到底成功了没。

所以，在我们的生产者应用里，必须实现一个**回查监听器**。这个监听器唯一的任务就是，当Broker来问的时候，你去查一下本地事务的最终状态，然后明确地告诉Broker，是该`COMMIT`还是`ROLLBACK`。有了这层保障，数据一致性才算是真正闭环。

### 上手实战写代码

理论说完了，来试试怎么在自己的应用中使用。要用事务消息，代码关键就是实现`TransactionListener`接口。

首先，需要一个特殊的`TransactionMQProducer`。

```java
// 使用事务消息，必须用 TransactionMQProducer
TransactionMQProducer producer = new TransactionMQProducer("my-tx-producer-group");
producer.setNamesrvAddr("127.0.0.1:9876");

// 给生产者设置一个线程池，用来处理Broker的回查请求
ExecutorService executorService = new ThreadPoolExecutor(2, 5, 100, TimeUnit.SECONDS, 
    new ArrayBlockingQueue<Runnable>(2000), new ThreadFactory() {
    @Override
    public Thread newThread(Runnable r) {
        Thread thread = new Thread(r);
        thread.setName("client-transaction-msg-check-thread");
        return thread;
    }
});
producer.setExecutorService(executorService);

// 设置核心的事务监听器
producer.setTransactionListener(new OrderTransactionListener());
producer.start();
```

重点就是最后一行`setTransactionListener`。这个`OrderTransactionListener`就是我们需要自己实现的，它有两个核心方法。

```java
// com.alibaba.rocketmq.client.producer.TransactionListener
public class OrderTransactionListener implements TransactionListener {

    // 存放本地事务的执行状态，key是事务ID，value是状态
    private ConcurrentHashMap<String, Integer> localTrans = new ConcurrentHashMap<>();

    /**
     * 当“半消息”发送成功后，这个方法会被回调，用来执行本地事务
     */
    @Override
    public LocalTransactionState executeLocalTransaction(Message msg, Object arg) {
        String transactionId = msg.getTransactionId();
        localTrans.put(transactionId, 0); // 初始状态：未知

        try {
            // ===============================================
            //  在这里执行我们的本地事务，比如创建订单、操作数据库等
            //  Business logic (e.g., create order in database)
            System.out.println("正在执行本地事务...");
            Thread.sleep(120000); // 模拟业务耗时
            System.out.println("本地事务执行成功！");
            // ===============================================
            
            localTrans.put(transactionId, 1); // 状态：成功
            // 本地事务成功，告诉Broker可以提交消息了
            return LocalTransactionState.COMMIT_MESSAGE;
        } catch (Exception e) {
            e.printStackTrace();
            System.out.println("本地事务执行失败");
            localTrans.put(transactionId, 2); // 状态：失败
            // 本地事务失败，告诉Broker回滚消息
            return LocalTransactionState.ROLLBACK_MESSAGE;
        }
    }

    /**
     * 当Broker发现一个半消息长期没被处理，会回调这个方法来查询本地事务状态
     */
    @Override
    public LocalTransactionState checkLocalTransaction(MessageExt msg) {
        String transactionId = msg.getTransactionId();
        Integer status = localTrans.get(transactionId);
        
        System.out.println("Broker回查事务状态, transactionId: " + transactionId + ", status: " + status);

        if (null != status) {
            switch (status) {
                case 0:
                    // 还在处理中，告诉Broker等会儿再来问
                    return LocalTransactionState.UNKNOW;
                case 1:
                    // 确认成功，提交
                    return LocalTransactionState.COMMIT_MESSAGE;
                case 2:
                    // 确认失败，回滚
                    return LocalTransactionState.ROLLBACK_MESSAGE;
            }
        }
        // 如果连事务ID都找不到了，说明本地事务可能因为某些原因就没执行，直接回滚
        return LocalTransactionState.ROLLBACK_MESSAGE;
    }
}
```

**核心就是**实现`TransactionListener`接口的两个方法：`executeLocalTransaction`负责执行业务，`checkLocalTransaction`负责兜底。

但是注意，在实际项目中，`checkLocalTransaction`方法里，不应该像这样用一个内存里的Map来存状态，这里只是帮助理解。而应该去查数据库里的事务状态表，这样才能保证应用重启后状态不丢失。

最后，发送消息的方式也变了，要用`sendMessageInTransaction`。需要使用专门的 TransactionMQProducer，并调用 sendMessageInTransaction() 方法来发送消息。

总结一下，自己实现就是这四点要注意：Listener实现接口的两个方法。需要使用专门的生产者去调用专门的方法去发送消息。

```java
// 发送事务消息
Message msg = new Message("TransactionTopic", "tags", "keys", 
        "Hello RocketMQ".getBytes(StandardCharsets.UTF_8));
producer.sendMessageInTransaction(msg, null);
```

### 这一切是如何发生的

来看看源码。关键逻辑在`DefaultMQProducerImpl`的`sendMessageInTransaction`方法里。

```java
// org.apache.rocketmq.client.impl.producer.DefaultMQProducerImpl
public TransactionSendResult sendMessageInTransaction(final Message msg, final Object arg) throws MQClientException {
    TransactionListener transactionListener = this.getTransactionListener();
    // ... 省略各种校验 ...

    SendResult sendResult = null;
    // 1. 设置消息类型为“半消息”
    MessageAccessor.putProperty(msg, MessageConst.PROPERTY_TRAN_MSG, "true");
    MessageAccessor.putProperty(msg, MessageConst.PROPERTY_PRODUCER_GROUP, 
            this.defaultMQProducer.getProducerGroup());
    
    try {
        // 2. 发送“半消息”
        sendResult = this.send(msg);
    } catch (Exception e) {
        throw new MQClientException("send message Exception", e);
    }

    LocalTransactionState localTransactionState = LocalTransactionState.UNKNOW;
    Throwable localException = null;
    switch (sendResult.getSendStatus()) {
        case SEND_OK: {
            try {
                // ...
                // 3. “半消息”发送成功后，回调我们自己实现的 executeLocalTransaction 方法
                localTransactionState = transactionListener.executeLocalTransaction(msg, arg);
                if (null == localTransactionState) {
                    localTransactionState = LocalTransactionState.UNKNOW;
                }
            } catch (Throwable e) {
                localException = e;
                localTransactionState = LocalTransactionState.ROLLBACK_MESSAGE;
            }
        }
        break;
        // ...
    }

    try {
        // 4. 根据 executeLocalTransaction 的返回结果，发送 COMMIT 或 ROLLBACK 指令
        this.endTransaction(sendResult, localTransactionState, localException);
    } catch (Exception e) {
        // ...
    }

    // ... 构造并返回结果 ...
}
```

源码清清楚楚地展示了整个流程：

- 先给消息打上`TRAN_MSG`的标记。
- 调用`send`方法，把这个“半消息”发出去。
- `send`成功后，立刻回调我们写的`executeLocalTransaction`方法。
- 最后，根据`executeLocalTransaction`的返回值（`COMMIT`, `ROLLBACK` 或 `UNKNOW`），调用`endTransaction`方法去通知Broker做最终决定。

整个过程就在生产者的一个方法调用里，逻辑很清晰。

### 结语

RocketMQ的事务消息，当然，它也不是银弹。

需要仔细设计`checkLocalTransaction`逻辑，保证它的幂等和可靠性。消费端也必须做好幂等消费，因为在某些极端情况下（比如`COMMIT`成功了，但ACK没返回，Broker触发了回查），消息还是有可能会被重复投递的。

技术就是这样，没有完美的方案，只有最适合的场景。

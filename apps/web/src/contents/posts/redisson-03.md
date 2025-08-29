---
title: "Redisson源码（三）：释放锁"  
category: "Article"  
publishedAt: "2025-06-29"  
summary: "Article"  
tags:  
  - Article
banner: /images/banner/posts/redisson/redisson-3.png
alt: "图片替代文本"  
mathjax: false
---

# Redisson源码（三）：释放锁

前面我们已经了解了 Redisson 是如何通过 Lua 脚本和看门狗机制实现 `lock()` 的，也就是获取锁的流程。  接下来深入进`lock.lock()` 和 `lock.unlock()`其中的 `lock.unlock()` 进行了解，了解它是如何释放锁的。

在深入源码之前，首先，还是先思考一个问题，如果让我们自己去设计释放锁的逻辑，我们会怎么做？

一个锁其实就是 Redis 中的一个key，直接 `DEL` 命令看似好像就可以解决。

```redis
DEL myLock
```

在最理想的情况下，它确实能工作。但真实的情况远没有这么浮浅。分布式系统的复杂性，恰恰在于那些不理想的麻烦情况。

一：删错了怎么办？

`DEL` 命令有一个问题是它不问青红皂白，只要 key 存在，就一删了之。这会引发一个非常经典的分布式锁失效场景。

就比如，线程 A 获取了锁，但它的业务逻辑执行时间非常长，超过了锁的过期时间（比如 30 秒）。此时会发生什么？

1. T=0s: 线程 A 获取锁 `myLock` 成功，设置过期时间 30 秒。
2. T=30s: 线程 A 的业务还在执行，但 `myLock` 因为超时，被 Redis 自动删除了。
3. T=31s: 线程 B 尝试获取锁，由于 `myLock` 已不存在，线程 B 成功获取了锁。
4. T=35s: 线程 A 的业务终于执行完毕，它调用了 `unlock()` 方法。

如果 `unlock()` 的实现就是简单的 `DEL myLock`，那么线程 A 就会把线程 B **刚刚获取的、并且合法持有的锁给删除了**。线程 C 可能在 T=36s 时也获取了锁，导致线程 B 和 C 同时进入临界区，分布式锁形同虚设。

所以为了解决这个问题，我们的 `DEL` 操作前需要加一个什么前提条件？

很容易就能想到，在删除锁之前，先判断下这个锁的持有者是不是我这个线程自己。保证“**只删自己的锁**”。

这就要求我们在加锁时，存入的值必须是一个唯一的身份标识（比如 `UUID:threadId`）。解锁逻辑就变成了：

```
// 伪代码
if (GET myLock == "我的身份ID") {
    DEL myLock;
}
```

但是这又引入了新的问题：`GET` 和 `DEL` 是两个操作，非原子！如果在 `GET` 和 `DEL` 之间发生点什么，又会出现问题。

---

我们知道，Redisson 的 `RLock` 是可重入的。一个线程可以多次调用 `lock()`。

假设我一个线程 A 先后 5 次调用了 `lock()`，获取了 5 层锁。当它第一次调用 `unlock()` 时，如果直接执行 `DEL myLock`，会发生什么？

显然整个锁都被释放了。但实际上，我线程 A 只是想退出最内层的那把锁，它仍然持有外面的 4 层。这种删除方式，完全破坏了可重入的语义。

**思考：** 所以要想正确处理可重入的问题，我们需要在 Redis 里记录什么信息？`unlock` 的逻辑又该如何调整？

我们需要多存一个数值，也就是一个**计数器**。每次 `lock()`，计数器加一；每次 `unlock()`，计数器减一。只有当计数器减到 0 的时候，才能真正地执行 `DEL` 操作。

## Redisson源码

综合上面的分析，我们知道了要想解决以上问题，需要一个即保证原子性，身份的验证和计数器技术的操作。Redisson正是这么做的，用了原子性、身份验证与计数集于一身的 Lua 脚本。

现在，我们把上面遇到的所有问题汇总一下，一个健壮的 `unlock` 操作，必须同时满足：

1. **原子性**：判断和删除操作必须打包在一起执行。
2. **身份验证**：只能删除自己持有的锁。
3. **支持可重入**：需要正确处理重入计数。

直接看 `RedissonLock` 中 `unlock` 操作的核心 Lua 脚本，看看它是如何解决所有问题的。

### Lua脚本

**脚本原文:**

```lua
if (redis.call('hexists', KEYS[1], ARGV[3]) == 0) then
    return nil;
end;
local counter = redis.call('hincrby', KEYS[1], ARGV[3], -1);
if (counter > 0) then
    redis.call('pexpire', KEYS[1], ARGV[2]);
    return 0;
else
    redis.call('del', KEYS[1]);
    redis.call('publish', KEYS[2], ARGV[1]);
    return 1;
end;
return nil;
```

5个参数。

* `KEYS[1]`: 锁的名称（Key）。例如，`redisson.getLock("myLock")` 中的 `"myLock"`。
* `KEYS[2]`: 用于发布/订阅（Pub/Sub）的 Channel 名称。Redisson 内部会根据锁名生成，例如 `"redisson_lock__channel:{myLock}"`。
* `ARGV[1]`: 解锁时要发布的消息内容。这是一个内部常量，`LockPubSub.UNLOCK_MESSAGE`，其值为 `0`。
* `ARGV[2]`: 锁的默认租约时间（lease time），通常是看门狗的超时时间，例如 `30000` (毫秒)。
* `ARGV[3]`: 锁的持有者唯一标识。这是一个由 `UUID` 和 `threadId` 拼接而成的字符串，例如 `"a0e2a2a8-a53c-4b7c-9b7e-41a4a4d6b7b2:1"`。

我们将脚本分为四个逻辑部分进行解读。

#### **第一部分：前置安全检查 (Guard Clause)**

```lua
if (redis.call('hexists', KEYS[1], ARGV[3]) == 0) then
    return nil;
end;
```

* **`redis.call('hexists', KEYS[1], ARGV[3])`**: 这是脚本的第一道防线。
    * `hexists` 是 Redis Hash 的一个命令，用于检查指定的 Hash 中是否存在某个 `field`。
    * 在这里，它检查 `myLock` (KEYS[1]) 这个 Hash 中，是否存在一个名为 `"uuid:threadId"` (ARGV[3]) 的 `field`。
    * 如果存在，意味着当前尝试解锁的客户端线程确实是这个锁的持有者。
* **`== 0`**: `hexists` 命令如果找不到对应的 `field`，会返回 `0`。
* **`return nil`**: 如果检查结果为 `0`，脚本会立即终止并返回 `nil`。

**设计意图:**
这部分代码的核心目的是**防止误解锁**。什么情况下会发生误解锁？

1. **锁已过期被动释放**：线程A持有锁，但因业务耗时过长，锁已自动过期。之后线程B获取了该锁。当线程A执行完业务调用 `unlock` 时，如果没有这个检查，它会把线程B的锁错误地释放掉。
2. **程序逻辑错误**：某个线程根本没有获取锁，却错误地调用了 `unlock`。
3. **客户端重启/网络分区**：客户端A获取锁后崩溃，看门狗失效，锁过期。客户端A重启后，某个残留的 `finally` 块中的 `unlock` 被执行。

返回 `nil` 会被 Redisson 的 Java 客户端捕获，并最终转化为一个 `IllegalMonitorStateException`，完全符合 Java `java.util.concurrent.locks.Lock` 接口的规范。

#### **第二部分：核心状态变更 - 重入计数递减**

```lua
local counter = redis.call('hincrby', KEYS[1], ARGV[3], -1);
```

* **`redis.call('hincrby', KEYS[1], ARGV[3], -1)`**: 这是实现**可重入**特性的关键所在。
    * `hincrby` 命令会原子性地将 Hash 中指定 `field` 的 `value` 加上一个整数。
    * 在这里，它将 `myLock` (KEYS[1]) 中 `"uuid:threadId"` (ARGV[3]) 这个 `field` 对应的 `value`（即重入次数）减去 1。
    * 这个操作是**原子**的，确保了在高并发下计数的准确性。
* **`local counter = ...`**: `hincrby` 命令执行后，会返回**计算后的新值**。脚本将这个新值存入局部变量 `counter`，以便后续进行判断。

**设计意图:**
这行代码优雅地处理了锁的重入语义。每调用一次 `unlock`，计数就减一。例如，一个线程重入了5次，计数为5。前4次调用 `unlock` 后，`counter` 的值将依次变为4, 3, 2, 1。只有在第5次调用后，`counter` 才会变为 `0`。

#### **第三部分：条件分支 - 判断锁的最终状态**

```lua
if (counter > 0) then
    -- 分支 A: 锁仍被持有
    redis.call('pexpire', KEYS[1], ARGV[2]);
    return 0;
else
    -- 分支 B: 锁已完全释放
    redis.call('del', KEYS[1]);
    redis.call('publish', KEYS[2], ARGV[1]);
    return 1;
end;
```

脚本的决策中心，根据 `counter` 的值，决定锁的命运是被释放还是其他情况。

**分支 A: `counter > 0` (锁仍被持有)**

* **`redis.call('pexpire', KEYS[1], ARGV[2])`**: 这是非常精妙的一个设计。**为什么要在这里刷新过期时间？**

    * **场景**: 假设一个锁的默认过期时间是30秒。一个线程重入了锁，在内层逻辑执行了28秒。此时，它调用 `unlock` 退回到外层逻辑，`counter` 从2减为1。如果没有这一步，那么这个锁只剩下2秒的生命周期，外层逻辑很可能还没执行完，锁就过期了。
    * **目的**: 因此，每次退出一层重入时，都必须像加锁时一样，**将锁的过期时间重置**为 `internalLockLeaseTime` (ARGV[2])。这确保了只要线程还持有任何一层的锁，整个锁就不会因超时而意外失效。这是一个重要的**高可用性保障**。
* **`return 0`**: 返回数字 `0`。这个返回值告知 Redisson 客户端，解锁操作已成功执行，但锁**尚未完全释放**。客户端收到 `0` 后，会认为 `unlock` 调用成功，但不会做任何额外操作。

**分支 B: `counter <= 0` (锁已完全释放)**

* **`redis.call('del', KEYS[1])`**: 当重入计数归零时，意味着锁可以被彻底清除了。`del` 命令将整个 Hash 从 Redis 中删除。
* **`redis.call('publish', KEYS[2], ARGV[1])`**: 这是**唤醒机制**的核心。
    * 向 `redisson_lock__channel:{myLock}` (KEYS[2]) 这个频道发布一条消息。
    * 所有因获取这个锁失败而订阅了这个频道的其他客户端线程，都会收到这条消息。
    * 收到消息后，它们就会被唤醒，从等待状态中恢复，并再次尝试获取锁。这避免了客户端进行无效的、消耗资源的循环轮询。
* **`return 1`**: 返回数字 `1`。这个返回值告知 Redisson 客户端，锁**已被成功且完全地释放**。

#### **第四部分：冗余返回 (Redundant Return)**

```lua
return nil;
```

在正常的逻辑流程中，脚本会在 `if/else` 分支中通过 `return 0` 或 `return 1` 退出。这最后一行 `return nil` 理论上是不可达的。它的存在更多是为了代码的完整性和健壮性，以防未来脚本逻辑变更或出现意外情况时，有一个明确的默认返回值。

通过这种方式，Redisson 以极高的效率和无与伦比的健壮性，实现了一个看似简单的 `unlock` 操作。

* **第一步 (`hexists`)**：直接解决了“误删”问题。它先检查锁的 Hash 结构中，是否存在当前线程的 Field。如果不存在（锁已过期或本来就不是你的），直接返回，什么也不做。
* **第二步 (`hincrby`)**：巧妙地解决了“可重入”问题。利用 Redis 的原子计数指令，安全地将重入次数减一。
* **第三步 (if/else)**：根据 `hincrby` 返回的计数器值，做出精确的判断：
    * 如果 `counter > 0`，说明锁还在被重入持有，不能删除。此时，它还做了一个非常重要的操作——`pexpire`，**重置了锁的过期时间**，确保外层锁的有效期得到保障。
    * 如果 `counter <= 0`，说明锁已被完全释放。此时才执行 `del`，并 `publish` 一条消息，去**唤醒那些正在等待这把锁的线程**。

### 源码结构

理解了解锁的核心逻辑，也就是LUA脚本之后，再来过一遍这一块的代码结构。也就是过一下`unlock` 的调用链路。

一个常见的误解是，`unlock` 的所有逻辑都封装在 `RedissonLock` 类中。但当我们打开`RedissonLock.java`，会发现里面并没有 `unlock()` 方法。

这是因为 Redisson 在这里运用了**模板方法设计模式（Template Method Pattern）**。

`unlock` 的通用逻辑被抽象到了父类 `org.redisson.RedissonBaseLock` 中。看一下它的精简后源码：

```java
public abstract class RedissonBaseLock extends RedissonObject implements RLock {

    @Override
    public void unlock() {
        try {
            // 同步调用，阻塞等待异步结果
            get(unlockAsync());
        } catch (Exception e) {
            throw new RedissonException("unlock failed", e);
        }
    }

    @Override
    public RFuture<Void> unlockAsync() {
        // 获取当前线程 ID，发起异步解锁
        return unlockAsync(Thread.currentThread().getId());
    }

    public RFuture<Void> unlockAsync(long threadId) {
        // 核心：调用一个由子类实现的抽象方法
        RFuture<Boolean> future = unlockInnerAsync(threadId);

        // 返回结果的后处理
        CompletionStage<Void> f = future.handle((res, e) -> {
            // 1. 取消看门狗的续期任务
            cancelExpirationRenewal(threadId);
            
            if (e != null) {
                throw new RedissonException("unlock failed", e);
            }
            // 2. 检查解锁结果，如果为 null，说明尝试解锁一个不属于自己的锁
            if (res == null) {
                throw new IllegalMonitorStateException("Attempt to unlock lock, not locked by current thread...");
            }
            return null;
        });
        return new CompletableFutureWrapper<>(f);
    }
    
    // 模板方法中的“钩子”，由子类具体实现
    protected abstract RFuture<Boolean> unlockInnerAsync(long threadId);
}
```

从这段代码我们可以看到 `RedissonBaseLock` 定义的 `unlock` 骨架方法：

1. **API 统一**：提供了同步的 `unlock()` 和异步的 `unlockAsync()` 接口。
2. **通用逻辑处理**：负责取消看门狗（Watchdog）的定时续期任务，并根据解锁结果进行统一的异常处理（如抛出 `IllegalMonitorStateException`）。
3. **核心逻辑委派**：将最关键的、与 Redis 交互的内部解锁逻辑 `unlockInnerAsync` 定义为抽象方法，**委派给子类去实现**。

使用模板方法设计的好处是显而易见的，代码复用、职责清晰。无论是可重入锁 (`RedissonLock`) 还是公平锁 (`RedissonFairLock`)，它们的解锁流程都遵循这个模板，只需各自实现unique的 `unlockInnerAsync` 即可。

前面谈的lua脚本，就是 `RedissonLock.java`，它实现 `unlockInnerAsync` 这个核心方法的核心逻辑。

### 结论：远不止是 DEL

回到我们最初的问题：`unlock()` 是简单的 `DEL` 吗？

一个看似简单的 `unlock()`，在 Redisson 的实现中，是一个集身份验证、状态更新、条件判断、高可用保障（刷新过期时间）、高效唤醒（Pub/Sub）于一体的微型原子事务。它通过一段精心设计的 Lua 脚本，优雅地规避了分布式环境下所有可能出现的棘手问题。

这正是优秀开源框架的魅力所在。好的源码是好的老师，教会我们用最基础的工具实现最复杂的应用。

## 总结

通过对 `unlock()` 的源码追溯和 Lua 脚本的深度剖析，我们可以总结出 Redisson 分布式锁设计的几个好的原则，以后我们开发的时候也可以借鉴。

首先就是抽象和封装，通过模板方法模式，把通用逻辑和特定实现分离开，可以使得代码结构清晰，易于扩展。

然后就是利用Lua脚本，把复杂的多个操作封装成一个原子性的服务端事务，杜绝了并发场景下的竟态条件。

最后就是通信方面的高效设计，没有使用低效的客户端轮询，而是采用 Redis 的 **Pub/Sub** 机制实现了一套高效、低延迟的分布式等待/唤醒系统。

一行简单的 `lock.unlock()`，背后是如此深思熟虑的架构设计和对分布式环境下各种复杂场景的周全考虑。

希望在未来的工作中，我们不仅能用好 Redisson，更能理解其背后的设计思想，并根据此构建出属于自己的健壮、高效的分布式应用。



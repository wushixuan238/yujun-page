---
title: "Redisson源码（一）：释放锁"  
category: "ReadCode"  
publishedAt: "2025-07-29"  
summary: "ReadCode"  
tags:  
  - ReadCode
banner: /images/banner/posts/redisson/redisson-1.png
alt: "图片替代文本"  
mathjax: false
---

# Redisson源码（一）：RLock总览


在实现分布式系统时，如何确保数据在并发访问下的一致性，是一个绕不开的话题。

分布式锁，是解决这一问题的关键。而在众多 Java 分布式锁实现中，Redisson 是我们用的最多的实现。

我们每天都在使用 `redisson.getLock("myLock").lock()`，但在这代码背后，Redisson 做了什么我们可能还不知道。

接下来，将从：数据结构、原子性的保障、可重入性实现、以及锁续期机制（看门狗）到等待策略，这几个方面先对分布式锁的实现有个了解。



### 一、选择 Hash 而不是 String

要理解一个锁，首先要看它在 Redis 中长什么”。一个最简单的分布式锁，可以用 `SET key value NX EX seconds` 实现，底层是一个 String。
但 Redisson 却用了更复杂的 **Hash** 结构，为什么要多存一个值？有什么用？

为了实现**可重入性**。一个可重入锁，必须记录两个核心内容：
* **当前锁的持有者**
* **该持有者重入的次数**

Hash 的 `field-value` 结构天然地满足了这个需求。

当一个 `RLock`（名为 `myLock`）被锁定时，它在 Redis 中的结构是这样的：
```shell
> HGETALL myLock
1) "a0e2a2a8-a53c-4b7c-9b7e-41a4a4d6b7b2:1"  # Field
2) "2"                                         # Value
```
*   **Field**: 这是一个全局唯一的持有者ID，由 Redisson 客户端实例的 `UUID` 和当前 `线程ID` 拼接而成。它标识了是哪个客户端的哪个线程持有了锁。
*   **Value**: 一个计数器，代表这个持有者已经重入了 2 次。


### 二、大量的Lua脚本来保证原子性

加锁的过程中，我们很常见的一个操作序列是：读，改，写。比如加锁过程的检查锁状态 -> 然后更新锁状态，这些过程如果不是原子性的，就会导致多个客户端同时获取锁。

Redisson 源码中使用了大量的Lua脚本，**将所有核心逻辑封装在 Lua 脚本中**，利用 Redis 服务端执行 Lua 脚本的一个原子性，来避免了竞态条件的发生。

比如，加锁操作的核心 Lua 脚本（`RedissonLock.java` 中 `tryLockInnerAsync` 的逻辑）：

```lua
-- KEYS[1]: 锁名 (e.g., "myLock")
-- ARGV[1]: 锁的过期时间 (e.g., 30000 ms)
-- ARGV[2]: 持有者ID (e.g., "uuid:threadId")

-- 1. 尝试获取锁 (锁不存在)
if (redis.call('exists', KEYS[1]) == 0) then
    redis.call('hset', KEYS[1], ARGV[2], 1); -- 设置持有者和重入次数1
    redis.call('pexpire', KEYS[1], ARGV[1]); -- 设置过期时间
    return nil; -- 返回 nil 表示成功
end;

-- 2. 尝试重入 (锁存在且持有者是自己)
if (redis.call('hexists', KEYS[1], ARGV[2]) == 1) then
    redis.call('hincrby', KEYS[1], ARGV[2], 1); -- 重入次数+1
    redis.call('pexpire', KEYS[1], ARGV[1]); -- 刷新过期时间
    return nil; -- 返回 nil 表示成功
end;

-- 3. 获取锁失败 (锁被他人持有)
return redis.call('pttl', KEYS[1]); -- 返回锁的剩余过期时间
```

*   `hincrby` ：`hincrby` 命令原子性地为计数值加一，实现了重入逻辑。
*   `pexpire`刷新：无论是首次加锁还是重入，都会刷新它的一个过期时间，确保锁在持有期间的有效性。
*   失败返回 TTL：当锁被他人持有时，脚本并不会让客户端傻等，而是返回剩余的 TTL，为后续的高效等待策略提供了保障。

### 三、Watchdog 让锁永不过期

为锁设置过期时间解决了死锁的问题，但引入了新的问题：如果业务执行时间超过了锁的过期时间，锁会被自动释放，导致其他线程进入临界区。

Redisson 通过**看门狗（Watchdog）机制**，解决了这个问题。具体解决的思路主要有以下几个步骤：

1.  触发条件：当我们调用无参的 `lock()` 方法时，看门狗机制就会被激活。
2.  初始化过期时间：Redisson 会先用一个默认的 `lockWatchdogTimeout`（默认30秒）作为锁的初始过期时间。
3.  后台续期：在加锁成功后，Redisson 会启动一个后台的定时任务。这个任务会在锁的过期时间的 **1/3** 处（默认10秒）执行。
4.  续期逻辑：任务执行时，会检查当前线程是否还持有该锁。如果是，就通过一个 Lua 脚本，将锁的过期时间重新设置为 `lockWatchdogTimeout`。
5.  循环往复：续期成功后，看门狗会再次调度下一次的续期任务（又一个10秒后），形成一个不断的循环。
6.  终止：当 `unlock()` 方法被调用时，会先取消这个后台续期任务，然后再执行解锁脚本。

**源码**：
看门狗的启动逻辑位于 `RedissonLock.java` 的 `tryAcquireAsync` 方法中。加锁成功后，会调用 `scheduleExpirationRenewal(threadId)` 来启动这个续期循环。

```java
// RedissonLock.java -> tryAcquireAsync
future.whenComplete((res, e) -> {
    // ...
    if (res == null) { // res == null 表示加锁成功
        scheduleExpirationRenewal(threadId);
    }
});
```

Watchdog 机制确保了只要客户端实例还存活，业务逻辑还没执行完，锁就不会因为超时而丢失，提高了分布式锁的一个可靠性。

### 四、Pub/Sub实现高效的等待

回到前面的加锁逻辑，如果当锁被占用时，失败的线程应该如何等待？

能想到的最粗暴的方式是 `while(true)` 循环重试，但这会造成大量无效的 Redis 请求和 CPU 空转。

Redisson 这里**又**巧妙的利用了 Redis 的发布/订阅（Pub/Sub）机制，搞了一套高效的分布式等待/唤醒系统。具体思路如下：

1.  尝试加锁失败：线程 A 调用 `lock()`，执行 Lua 脚本后返回了一个 TTL，表示锁被占用。
2.  订阅 Channel：线程 A 不会轮询，而是会 `SUBSCRIBE` 一个与锁名相关的特殊 Channel（例如 `redisson_lock__channel:{myLock}`）。
3.  进入休眠：订阅完成后，线程 A 会利用 Java 的 `Semaphore` 或 `CompletableFuture` 等同步工具，在本地进入 `WAITING` 状态，让出 CPU，安静地等待信号。
4.  释放锁并发布消息：当持有锁的线程 B 调用 `unlock()` 时，其执行的解锁 Lua 脚本在最后一步，除了 `DEL` 锁的 Key，还会额外执行一个 `PUBLISH` 命令，向上述 Channel 发送一条解锁消息。
5.  唤醒并重试：Redis 将这条消息推送给所有订阅了该 Channel 的客户端。线程 A 收到消息后，会从休眠中被唤醒，然后再次尝试获取锁。

**源码：**
这部分逻辑主要封装在 `RedissonLock` 的 `subscribe.subscribeAsync()` 和 `LockPubSub` 类中。

通过事件驱动的模式，Event-Driven。将通信模型从客户端低效的拉（Pull）模式转变成了服务端高效的推（Push）模式，避免了“惊群效应”，等待期间的资源消耗也降到很低，不会有多余的CPU空转。


### 总结

`RedissonLock` 利用了Redis 提供的多种工具，Hash, Lua, Pub/Sub, TTL组合,解决了分布式锁的几个主要问题，分别包括：


*   用 Hash 来实现可重入性。
*   用 Lua 脚本来保证原子性
*   用 Watchdog 机制保障锁的有效性，解决业务超时问题。
*   用 Pub/Sub 机制实现高效等待，提升性能。


以上只是对Redisson的几个核心设计，粗略的过了一遍，接下来的文章将会深入讨论下细节。

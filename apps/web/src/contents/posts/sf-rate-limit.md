---
title: "Redis实现限流的一些方案"  
category: "SD"  
publishedAt: "2025-09-24"  
summary: "Redis实现限流的一些方案"  
tags:  
  - Software
banner: /images/banner/posts/sd/redis-rate-limit.png
alt: "图片替代文本"  
mathjax: false
---


## Redis实现限流的一些方案

在日常工作中，限流是必须做的。市面上实现限流的方案不少，比如Guava的RateLimiter，或者一些网关层自带的限流插件。但这些方案在分布式环境下，或多或少都有点不太合适。

通过我们熟知的Redis，利用它来打造一个分布式限流系统。

### 为啥是Redis？

快。

Redis是基于内存的，读写性能很好，对于限流这种需要高频读写的场景非常适合。而且，Redis支持的原子操作，比如`INCR`和`EXPIRE`，能确保我们在并发环境下的数据的一致性，这对于限流来说无疑是很重要的。

说到原子性，就不得不提一下Lua脚本。

Redis可以执行Lua脚本，而且整个脚本的执行是原子性的。这意味着，我们可以把一系列的读、写、判断逻辑封装到一个Lua脚本里，然后一下扔给Redis去执行，中间不会被其他任何命令给插队。

这样一来，就彻底杜绝了并发场景下可能出现的各种问题，比如说，限流的计数器在**读-改-写**的过程中被别的请求给插入了。用Lua脚本来实现限流逻辑，不仅代码更简洁，性能也更好，毕竟减少了多次网络请求的开销。

所以，总结一下，优点主要是超高的性能，大部分命令（如INCR, HINCRBY）和Lua脚本提供原子操作，有很多数据结构来支持多种灵活限流算法的实现。

### 简单的计数器模式

先从最简单的实现开始——固定窗口计数器。

这是最容易想到的方法，用来限制在固定时间窗口内的请求次数。也特别好理解，就是在指定的时间窗口内，限制请求的数量。比如说，我们规定，每个用户每分钟只能访问某个接口100次。

实现起来也特别直接，用一个Redis的字符串键就行，键的格式可以设计成`rate:limit:user_id:api_path`。

每次有请求进来，就用`INCR`命令给这个键加一。如果是这个时间窗口内的第一个请求，这个键还不存在，`INCR`之后值会变成1，这时候我们顺手给它设置一个过期时间，比如60秒。

之后每次请求进来，都先判断一下这个键的值是不是已经超过100了，没超过就放行，超过了就直接拒绝。

这种方法实现是简单，但有个问题。如果在时间窗口的最后几秒突然涌进来一大波请求，然后下一个时间窗口的一开始又来一波，这就相当于在很短的时间内，请求量翻倍了，系统的压力瞬间就上去了。

### 更平滑的滑动窗口

为了解决上面那个问题，我们可以用滑动窗口算法。这种算法会把时间窗口再划分成更小的格子，然后统计整个窗口内所有格子的请求总数。随着时间的推移，窗口会不断向右滑动，旧的格子被丢弃，新的格子加进来。

这种方案用Redis的有序集合（Sorted Set）就能很巧妙地实现。

我们可以把每次请求的时间戳作为score，请求的唯一标识（比如UUID）作为member，存到有序集合里。每次有新请求进来，就先用`ZREMRANGEBYSCORE`命令，把窗口之外的旧数据给清掉，然后再用`ZCARD`命令看看当前窗口内还有多少请求，没超限就用`ZADD`把新请求加进去，超了就拒绝。

```
# 假设窗口是 60 秒
now_timestamp = System.currentTimeMillis()
window_start_timestamp = now_timestamp - 60000

# 1. 移除窗口之外的旧记录
ZREMRANGEBYSCORE user:123:api_a 0 window_start_timestamp

# 2. 获取窗口内的请求数量
current_count = ZCARD user:123:api_a

# 3. 判断是否超过阈值
if current_count < limit:
    # 4. 如果没超过，添加当前请求记录
    ZADD user:123:api_a now_timestamp unique_request_id
    return "Allowed"
else:
    return "Rejected"
```

这个方案比固定窗口要平滑得多，能有效地防止流量毛刺。

### 令牌桶与漏桶

除了上面说的两种，还有两种更经典的算法：令牌桶（Token Bucket）和漏桶（Leaky Bucket）。

令牌桶就像一个固定容量的桶，系统会以恒定的速率往里面放令牌。每次请求过来，都得先从桶里拿一个令牌，拿到了才能继续，拿不到就说明令牌用完了，请求被拒绝。这种算法的好处是，它允许一定程度的突发流量，只要桶里还有令牌，就算短时间内请求量大一点也没关系。

而漏桶算法则更像一个漏水的桶，请求来了就先放进桶里排队，桶底有个洞，以恒定的速率把请求漏出去，交给下游系统处理。如果请求进来的速度比漏出去的速度快，桶满了，后面的请求就只能被丢弃。漏桶算法的特点是，它能强制让请求以一个平滑的速率流出，不管进来的时候流量有多大。

这两种算法用Redis和Lua脚本也都能实现。也是目前非常主流和高效的分布式限流方案。

比如说令牌桶，我们可以在Redis里存一个哈希表，里面记录了桶里还剩多少令牌，以及上次放令牌的时间。每次请求进来，就用Lua脚本原子性地计算一下这段时间应该新生成多少令牌，再加上原来剩下的，看看够不够这次请求用。

将令牌桶的状态（剩余令牌数、上次刷新时间）存储在 Redis 的 **HASH** 中。所有**计算新增令牌 -> 判断 -> 扣减**的逻辑都封装在一个 Lua 脚本中，以保证原子性。

比如key是 `token_bucket:user:123:api_a`，field1是 `tokens`，也就是剩余令牌数，field2是`last_refill_timestamp`，也就是上次刷新的时间戳。

```
-- KEYS[1]: 令牌桶的 key
-- ARGV[1]: 桶的容量 (capacity)
-- ARGV[2]: 令牌生成速率 (rate, tokens per second)
-- ARGV[3]: 当前时间戳 (milliseconds)

local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local rate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])

-- 使用 HGETALL 获取桶的当前状态
local bucket_state = redis.call('HGETALL', key)
local last_tokens
local last_refill_timestamp

-- 如果桶是第一次使用，进行初始化
if #bucket_state == 0 then
    last_tokens = capacity
    last_refill_timestamp = now
else
    -- bucket_state 是一个数组 [key1, val1, key2, val2, ...]
    last_tokens = tonumber(bucket_state[2])
    last_refill_timestamp = tonumber(bucket_state[4])
end

-- 1. 惰性计算需要补充的令牌
local time_delta = now - last_refill_timestamp
if time_delta > 0 then
    local new_tokens = math.floor((time_delta * rate) / 1000)
    if new_tokens > 0 then
        last_tokens = math.min(capacity, last_tokens + new_tokens)
        last_refill_timestamp = now
    end
end

-- 2. 判断并尝试获取令牌
if last_tokens > 0 then
    last_tokens = last_tokens - 1
    -- 使用 HMSET 更新桶的状态
    redis.call('HMSET', key, 'tokens', 
     , 'last_refill_timestamp', last_refill_timestamp)
    -- 设置一个合理的过期时间，防止冷数据占用内存
    redis.call('EXPIRE', key, capacity / rate * 2) 
    
    return 1 -- 返回 1 表示成功
else
    -- 即使令牌不够，也要更新状态，以便下次计算
    redis.call('HMSET', key, 'tokens', last_tokens, 
    'last_refill_timestamp', last_refill_timestamp)
    redis.call('EXPIRE', key, capacity / rate * 2)
    return 0 -- 返回 0 表示失败
end
```

这个方案也是目前工业界的最佳实践之一。它只占用一个 Redis Key，内存开销极小。完美实现了令牌桶算法，既能严格控制平均速率，也能应对突发流量。在项目中，我们会将这个 Lua 脚本预加载到 Redis 中，应用代码每次只需要通过`EVALSHA`命令调用即可，效率非常高。

### 总结

说了这么多理论，其实在实际工作中，我们往往需要根据具体的业务场景来选择最合适的限流方案。

比如，对于一些需要严格控制调用频率的API，漏桶算法可能更合适，因为它能保证一个非常平稳的输出速率。而对于一些允许一定突发流量，但又不希望被打死的场景，令牌桶就更加灵活。至于滑动窗口，在统计和实时性上表现不错，很多API网关喜欢用。

还有个事情，就是限流的粒度问题。你是想针对单个用户限流，还是针对IP，或者是针对整个应用？这个得想清楚。不同的粒度，Redis里key的设计就不一样。这个没什么标准答案，看自己的业务需求。




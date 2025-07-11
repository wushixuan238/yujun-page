---
title: "高并发库存扣减方案思考"
category: "SD"
publishedAt: "2025-06-19"
summary: "SD"  
tags:  
  - Microservice
banner: /images/banner/posts/sd/stock-sub.png
alt: "图片替代文本"  
mathjax: false
---




# 高并发库存扣减方案思考

在实际业务开发场景中，“库存超卖”这个词，对于电商、秒杀、抽奖等任何涉及限量资源的系统来说，都像一个挥之不去的梦魇。一旦发生，轻则用户投诉、运营叫苦，重则公司资损、口碑崩塌。

那么我们如何设计一个有相对较高的性能，较好的鲁棒性的方案呢？

我们来一步一步推进这个设计的思路。
在库存扣减的早期探索中，我们可能最先想到的是利用**数据库的行级锁**。当一个请求要扣减库存时，先`SELECT ... FOR UPDATE`锁定那条库存记录，然后再执行UPDATE。这种方式数据一致性最强，但遗憾的是，在高并发下，数据库很快就会成为整个系统的瓶颈，大量的请求因为等待锁而超时，用户体验直线下降。显然，数据库扛不住这种压力。

于是，我们将目光投向了性能卓越的Redis。一个自然的想法是使用Redis的独占锁（比如`SET key random_value NX EX lock_timeout`）。

在扣减库存前，先获取这个商品的全局锁，成功后再去操作Redis中的库存计数器，操作完毕释放锁。这比数据库锁性能好很多，但新的问题又来了：所有对同一商品库存的扣减请求，依然需要在这个独占锁上排队。即使Redis里还有库存，但因为锁是独占的，系统的吞吐量依然不佳，无法充分发挥Redis的高并发能力。

### `DECR`

为了追求更高的并发和更细的控制粒度，我们转向了一种“**无锁化**”（更准确地说是基于乐观思想的细粒度控制）设计。其核心之一就是Redis的`DECR key`原子递减命令。

DECR的原子性保证了在高并发下，对库存总数的修改是准确的，不会出现多个线程读取旧值然后各自减1导致的“幻读”或“写丢失”。这个操作本身，就有点像数据库的原子计数器，1、2、3、4... 它在数值层面是可靠的。

初步设想：只用DECR行不行？
具体的业务代码如下：

```java
// 伪代码  简化版
long stock = redis.decr("product_stock_123"); // 对商品A的库存执行DECR
if (stock >= 0) {
    // 认为扣减成功，执行后续业务 (比如创建订单, 准备发货)
    return true; // 认为扣减成功
} else {
    // 库存不足 (DECR后stock < 0)
    redis.incr("product_stock_123"); // 补偿
    return false; // 库存不足
}
```

但是，现在我们有这样一个场景：商品A库存仅剩1件。多个用户（比如用户X、用户Y、用户Z）在同一时刻或非常接近的时刻都尝试购买这最后一件商品。

由于Redis的DECR是原子且单线程处理的，这10个（或更多）并发请求对product_stock_A的DECR操作会被Redis服务器排队依次执行。

现在，一个幸运儿X，它的DECR请求最先被Redis处理。product_stock_A的值从1变为0。DECR命令返回0给用户X的应用实例。其他请求（用户Y、Z等）：它们的DECR请求随后被处理。

* 用户Y的DECR：product_stock_A从0变为-1。DECR返回-1。
* 用户Z的DECR：product_stock_A从-1变为-2。DECR返回-2。
* 以此类推。

接下来我们来深入业务逻辑，用户X的应用实例：收到DECR返回值为0。根据if (stock >= 0)的判断，它认为自己成功扣减了库存，于是开始执行后续业务（比如创建订单，准备通知发货等）。

用户Y、Z等的应用实例：收到DECR返回值为负数。根据else分支，它们会执行redis.incr("product_stock_A")（尝试将库存从-1、-2等恢复到0），并认为自己扣减失败。

看似很好，那么存在哪些问题？
首先就是成功的唯一性没有得到保证：

虽然只有一个用户X的应用实例的DECR返回了0，但如果后续的业务流程非常复杂，比如用户X的应用实例在创建订单的过程中，因为某种原因（如网络超时、DB短暂不可用）失败了或者处理得很慢，而它并没有一个明确的机制来“**释放**”它刚刚通过DECR声明的这个名额。
DECR只是改变了一个共享的计数值。它并没有为“这最后一个被成功DECR下来的单位”打上一个明确的、被某个请求占有的标记。

如果用户X的后续业务失败，且没有妥善处理“名额释放”（这在单纯DECR方案中很难做到完美），那么这个库存单位实际上是“悬空”了——它从总数上被扣了，但没有成功分配给任何用户。其他用户也因为DECR返回负数而无法获取。（也就是会导致**少卖问题**）

第二点，就是对**单个库存单位**的精细控制不足，难以实现复杂的后续流程管理和幂等。

比如我们需要对“成功扣减的这一个单位”进行追踪或后续操作。

* 如果用户X的请求因为网络原因被客户端重试了，或者后续发MQ的流程需要重试。我们如何知道“扣减最后一个库存并为用户X创建订单”这个完整的业务操作是不是已经被成功执行过一次了？单纯依赖DECR的返回值（比如0）作为判断依据是不够的，因为另一个完全不同的请求（如果时序凑巧）也可能在某个时间点（比如库存恢复后再次被消耗时）遇到DECR返回0。
* 某些业务可能允许用户“预占”一个库存单位一段时间（比如订单待支付状态），如果超时未支付则释放。单纯DECR无法很好地管理这种有时效性的“占用”状态。
* 我们希望将“这一个被成功扣减的库存单位”与“发起这个扣减请求的特定用户/会话/请求ID”强绑定起来，以便后续审计或处理。DECR本身不提供这种绑定。


这个方案看似简单，但正如我们之前分析的，它在“**最后一个名额**”的界定和“单个库存单位”的精细控制上存在不足。

### `SETNX`

这就是为什么我们在DECR之后，引入了SETNX key value（SET if Not eXists）作为消耗标记。

在多个请求都“看似”成功（DECR后surplus >=0）的并发场景中，通过为一个与surplus值相关的唯一key（如总库存key_surplus值）执行SETNX，选出唯一的“天选之子”，授予它对刚刚那个被DECR下来的库存单位的最终消耗权。这是防止因并发导致同一库存单位被重复分配（即超卖）的直接手段。

具体来说，如何弥补上述的不足：

* 明确最后一个名额的归属
  * 当用户X的DECR返回0时，它会立即尝试SETNX stock_total_SKU123_0 "locked"。
  * 只有这个SETNX成功的线程，才算真正获得了这最后一个名额的“所有权”或“消耗权”。
  * 如果此时有另一个用户X'（可能是X的重试请求，或者一个极度并发的请求）也通过某种方式（尽管在严格串行DECR下，第二个让库存从1到0的DECR会返回-1）“看到”了surplus=0并尝试SETNX ..._0，它会失败。
  * 这就为最后一个名额的分配提供了一个清晰、原子的裁决机制。
* 为“单个库存单位”提供精细控制点
  * stock_total_SKU123_0这个Redis key本身，就成为了“最后一个库存单位已被用户X的这个请求成功获取”的凭证。
  * 如果用户X的后续业务（如创建订单）需要重试，它可以先检查stock_total_SKU123_0这个key是否还存在并且是自己之前设置的（可以通过value存更复杂的信息，或者业务订单号作为幂等判断）。如果标记已存在，说明可能已经处理过。
  * SETNX时可以设置过期时间。如果用户X在获得名额后一定时间内没有完成后续操作（如支付），这个标记可以自动过期，库存名额可以被“释放”（虽然释放逻辑需要额外实现，比如检查标记是否存在来判断是否可重新分配，或者总库存数的回补）。
  * 虽然key本身是基于surplus，但哪个请求成功设置了这个key，就意味着这个请求绑定了这个消耗事件。

SETNX的引入，通过创建一个与该次成功扣减（特定surplus值）相关联的唯一标记，弥补了这些不足，为库存的精细化、可靠化管理提供了坚实的基础。即使这意味着在客户端层面是两步操作，其带来的并发安全和流程控制上的好处通常是值得的（而Lua脚本则是将这两步在服务端原子化的最终方案）。

然而，SETNX（“加锁”）的意义远不止于此，它更深层的价值在于“兜底”和“流水记录”

每一个成功SETNX创建的key（如..._SKUID_99）就像一个独立的、一次性的“消耗凭证”或“电子回执”。这些“回执”独立存在于Redis中。如果因为某些异常情况，DECR操作的那个总库存计数器的值变得不准确了，这些独立的“回执”可以作为重要的参照物，帮助我们发现问题。

可以增强系统在异常场景下的健壮性，具体来说：

如果Redis集群发生网络分区或主从切换时数据有微小延迟，单纯依赖一个可能暂时不一致的总库存计数器是有风险的。而每个消耗凭证的SETNX操作，如果在新主上尝试创建已存在的key会失败，这提供了一层额外的保护。

从备份恢复Redis数据，或者运维手动调整总库存计数器时，如果操作失误导致总库存数不准，这些已存在的“消耗凭证”可以帮助我们判断恢复的库存是否合理。比如，如果恢复后的总库存数是50，但我们发现Redis里还存在..._SKUID_55这样的消耗凭证，那显然数据有问题。

运营可能会直接在Redis层面（或通过后台工具间接）修改总库存数。如果这种修改与实际已通过SETNX标记的消耗情况不符，后续的SETNX操作就可能失败（比如运营把库存改少了，但消耗凭证显示已经消耗到那个数了），从而提前暴露问题，而不是让系统在错误的库存基数上继续运行。

如果没有这些SETNX产生的独立标记，当总库存计数器因为各种隐蔽原因（哪怕是万分之一的概率）出错时，我们可能完全无从知晓，直到发生严重的超卖或少卖事故。这些标记就像一个个“哨兵”，让库存的消耗过程更“有迹可循”，提升了系统的可观测性和可控性。

```java
// ... (伪代码)
public boolean subtractStockInRedis(String stockCountKey, String uniqueMarkerPrefix, Long itemId, Date activityEndTime) {
    long currentSurplus = redisService.decr(stockCountKey); // 原子递减

    if (currentSurplus < 0) {
        redisService.setAtomicLong(stockCountKey, 0); // 恢复总数
        return false;
    }
    if (currentSurplus == 0 && isActivitySkuStock(stockCountKey)) {
        // eventPublisher.publish(activitySkuStockZeroEvent, itemId); // SKU库存为0通知
    }

    // 为这个具体的剩余量打上一次性消耗标记，这个标记也作为流水和兜底校验
    String consumptionMarkerKey = uniqueMarkerPrefix + itemId + Constants.UNDERLINE + currentSurplus;
    long expireMillis = calculateMarkerExpireTime(activityEndTime);
    Boolean markerAcquired = redisService.setNx(consumptionMarkerKey, "1", expireMillis, TimeUnit.MILLISECONDS);

    if (!markerAcquired) {
        log.warn("消耗标记获取失败 (可能名额被抢，或异常状态导致冲突): {}", consumptionMarkerKey);
        // 即使DECR了，但没拿到标记，也算失败。这里可以考虑补偿INCR，但更优是Lua。
        return false;
    }
    // 成功获取标记，才算真正成功
    return true;
}
```

### 动态补内存

当我们引入**动态补充库存**的需求时，原先基于DECR剩余量并标记surplus的方案就显得捉襟见肘了，因为补库存（通过INCRBY增加总剩余量）后，新产生的surplus值可能与历史消耗标记冲突。

这里我们可以使用 基于 INCR已消耗量的方案。参见另一篇博客。

### 数据库同步：异步的最终一致

无论Redis层面如何设计，库存数据最终都需要与数据库同步。我们可以采用以下方案：

* 异步更新：通过MQ或Redisson延迟队列，将Redis的库存消耗事件通知给后台任务。
* 后台任务：负责更新数据库的库存字段。
* 库存为零的特殊处理：快速同步DB并将库存置零。

### 总结

DECR是基础的原子计数，保证了数量层面的基本准确。SETNX（针对特定消耗单位的标记）是核心的并发控制器，确保了“名额”的唯一分配。同时也是一层重要的兜底和流水校验机制，它为系统在面对各种不可预期的分布式异常、数据恢复问题、甚至人为误操作时，提供了一份宝贵的“状态证据”和“安全护栏”。知道哪里可能出错，并为之设计防护，这正是从**能用**到**可靠**的关键一步。


最终的完美方案往往是Lua脚本，它能将客户端的多步操作封装为服务端的原子执行，彻底消除间隙风险，同时保留DECR的高效和SETNX的控制力与校验价值。

---

在设计高并发系统时，多问自己一句“如果这里出错了会怎么样？我能知道吗？我能恢复吗？” 往往就能引导我们走向更健壮、更可靠的设计。与各位共勉。💪

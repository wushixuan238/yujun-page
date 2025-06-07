---
title: "ElasticSearch（二）：分库分表下的准实时搜索"  
category: "SD"  
publishedAt: "2025-06-03"  
summary: "ES入门系列"  
tags:  
  - ES
banner: images/banner/posts/es/es-02.png
alt: "图片替代文本"  
mathjax: false
---

# ElasticSearch（二）：分库分表下的准实时搜索🚀

在上一篇我们学习了如何在单体MySQL环境下集成Elasticsearch构建基本的商品搜索功能。然而，在真实的C端（面向消费者）场景中，我们经常会采用**分库分表**的方案来承载巨大的数据流量和存储压力。例如，我们会以**用户ID**为切分键，将用户的抽奖订单、签到记录等行为数据分散到各个物理库表中。

这样做极大地提升了C端用户服务的性能和可扩展性。但是，新的挑战也随之而来：运营团队需要对全量数据进行分析、统计和查询，以制定营销策略、监控活动效果。分库分表后，数据散落在各个库中，传统的聚合查询变得异常复杂和低效。我们总不能轮询每一个分库分表去捞数据吧，那样效率就很慢了。😫

为了解决这个问题，我们需要一套能够将这些分散数据重新聚合的方案。而**Elasticsearch**凭借其强大的聚合分析和全文检索能力，成为了理想的数据归宿。关键在于，如何高效、准实时地将分库分表MySQL中的数据同步到Elasticsearch呢？

就是引入**变更数据捕获 (Change Data Capture, CDC)** 技术，而 **Canal** 正是阿里巴巴开源的一款优秀的基于MySQL数据库binlog的增量订阅与消费组件。更进一步，我们将利用 **Canal Adapter** 来简化数据同步到Elasticsearch的过程。

本篇博客，我们将深入探讨如何在一个营销平台的背景下，构建一个 **分库分表MySQL -> Canal Server -> Canal Adapter -> Elasticsearch** 的数据同步链路，实现准实时的运营数据查询和分析能力。

**你将从本文学到：**

* C端场景下分库分表（按用户ID切分）的典型应用及其带来的数据聚合难题。
* Canal的核心工作原理及其在CDC中的关键角色。
* Canal Adapter如何简化将binlog变更同步到Elasticsearch的过程。
* 针对营销平台特定库表（如`raffle_activity_order`, `user_raffle_order`）的Canal及Adapter配置实战。
* 如何在Elasticsearch中为同步过来的数据创建合适的索引和Mapping。
* 通过Kibana进行数据验证和索引模式管理。
* 如何通过实际业务操作（如执行抽奖、签到）来触发数据同步并验证其效果。

## 🏛️ 组件介绍与整体架构

### Canal：数据的“搬运工”与“翻译官”

Canal，译为水道/管道/沟渠，顾名思义，它的主要用途就是基于MySQL数据库的增量日志（binlog）进行解析，提供增量数据的订阅和消费服务。

> 早在阿里巴巴初期，由于杭州和美国双机房部署的需求，跨机房数据同步主要依赖于业务层面的trigger来获取增量变更。从2010年开始，阿里逐步转向通过解析数据库日志来获取增量变更，从而催生了大量的数据库增量订阅和消费业务，Canal便是这一背景下的杰出产物。

**它的工作原理其实很巧妙：**
Canal会模拟一个MySQL的从库（slave）的交互协议，向MySQL主库（master）发送`dump`协议请求。当MySQL主库收到这个请求后，便会开始将二进制日志（binary log）推送给这个“伪装”的从库，也就是Canal Server。Canal Server接收到binlog后，会对其进行解析，提取出结构化的数据变更事件（INSERT, UPDATE, DELETE），然后根据配置将这些变更分发出去。

### Canal Adapter：直达ES的“特快专递”

虽然Canal Server负责捕获和解析binlog，但如何将这些变更数据高效、正确地写入目标存储（如Elasticsearch）呢？这时，Canal Adapter就派上用场了。Canal Adapter是Canal生态中的一个重要组件，它可以消费Canal Server解析后的数据，并根据预设的适配器（Adapter）配置，将数据写入到各种目标数据源，包括Elasticsearch、HBase、Kafka、RocketMQ等。

对于我们的场景，我们将使用Canal Adapter的**ES适配器**，它可以直接将数据变更同步到Elasticsearch中，省去了我们自己编写复杂消费端逻辑的麻烦。

### 整体架构图

```
+---------------------+     +---------------------+     +-----------------------+     +-------------------+
|                     |     |                     |     |                       |     |                   |
|  MySQL分片集群      | --> |    Canal Server     | --> |     Canal Adapter     | --> |   Elasticsearch   |
| (big_market_01,    |     | (订阅Binlog)        |     | (ES适配器, 同步数据)  |     | (统一索引)        |
|  big_market_02)     |     |                     |     |                       |     |                   |
+---------------------+     +---------------------+     +-----------------------+     +-------------------+
        ^                                                                                       |
        |                                                                                       |
        |  (应用层通过分库分表中间件写入/读取 - 用户行为)                                           | (运营侧查询/分析)
        +---------------------------------------------------------------------------------------+
```

**以上数据流转的核心逻辑：**

1. 用户在营销平台进行抽奖、签到等操作，数据通过分库分表规则写入到例如 `big_market_01.raffle_activity_order_00` 或 `big_market_02.user_raffle_order_01` 等具体的MySQL分片表中。
2. MySQL产生binlog记录这些数据变更。
3. Canal Server订阅这些MySQL实例的binlog，解析出结构化的变更事件。
4. Canal Adapter连接到Canal Server，获取这些变更事件。
5. Canal Adapter根据其ES适配器的配置（比如哪个库的哪个表对应ES的哪个索引，字段如何映射等），将数据自动同步到Elasticsearch中。
6. 运营人员通过Kibana或内部数据平台查询Elasticsearch，获取聚合后的全量数据进行分析。


## 🎯 功能预期

本次实战，我们将重点选大营销平台的 `big_market_01` 和 `big_market_02` 两个分库中的 `raffle_activity_order` 和 `user_raffle_order` 相关分片表（假设它们是按某种规则分片的，例如 `raffle_activity_order_xx`）进行Elasticsearch同步配置。通过学习这个过程，你可以触类旁通，为项目中其他的库表配置同步。

## 🛠️ 环境安装与配置

> **环境脚本说明：** 假设我们已经准备好了包含Canal、Canal Adapter、Kibana、Logstash（如果用到）以及Docker Compose 脚本文件的工程环境。我们这里重点关注与数据同步相关的配置。

### 1. MySQL侧准备

* **开启Binlog：**
  确保你的所有MySQL分片实例（例如 `big_market_01` 和 `big_market_02` 所在的MySQL服务）都已经开启了binlog，并且binlog格式为 `ROW`。
  在MySQL的配置文件 (`my.cnf` 或 `my.ini`) 中检查或添加：

    ```ini
    [mysqld]
    log-bin=mysql-bin
    binlog_format=ROW
    server-id=XXX  # 每个MySQL实例的server-id必须全局唯一
    ```

  重启MySQL使配置生效。
* **创建Canal连接账户：**
  为Canal创建一个专用的MySQL账户，并授予必要的复制权限 (REPLICATION SLAVE, REPLICATION CLIENT)。

    ```sql
    CREATE USER 'canal'@'%' IDENTIFIED BY 'your_canal_password';
    GRANT SELECT, REPLICATION SLAVE, REPLICATION CLIENT ON *.* TO 'canal'@'%';
    FLUSH PRIVILEGES;
    ```

### 2. Canal Server 配置

Canal Server需要知道它应该去监听哪些MySQL实例。这通常在 `canal.properties` 和各个 `destination` 的 `instance.properties` 中配置。

* **`conf/canal.properties`**:
  确保 `canal.serverMode = tcp` (因为Adapter会通过TCP连接Server)。

  ```properties
  canal.port = 11111
  canal.serverMode = tcp
  # ... 其他配置
  ```
* **`conf/<destination_name>/instance.properties`**:
  我们需要为每个要监听的MySQL**实例**（不是每个库，如果多个库在同一个MySQL实例上，一个destination就够了，通过filter来区分库表）配置一个destination。
  例如，如果 `big_market_01` 和 `big_market_02` 是两个不同的MySQL实例，你需要两个destination。如果它们在同一个MySQL实例上，但你想分开管理或过滤，也可以创建两个。

  假设为 `big_market_01` 创建 `conf/bm_db01/instance.properties`:

  ```properties
  canal.instance.master.address = host_of_big_market_01_mysql:3306
  canal.instance.dbUsername = canal
  canal.instance.dbPassword = your_canal_password
  # 监听big_market_01库下所有raffle_activity_order_xx 和 user_raffle_order_xx 表
  canal.instance.filter.regex = big_market_01\\.raffle_activity_order_\\d+,big_market_01\\.user_raffle_order_\\d+
  # 如果表名没有规律的后缀，而是完全不同的表名，可以用逗号分隔
  # canal.instance.filter.regex = big_market_01\\.tableA,big_market_01\\.tableB
  ```

  类似地，为 `big_market_02` 创建 `conf/bm_db02/instance.properties`。

### 3. Canal Adapter 配置 (核心！)

Canal Adapter负责将从Canal Server获取的数据同步到Elasticsearch。它的配置主要涉及：

* **`conf/application.yml` (Adapter的主配置文件):**
  这里需要配置Adapter要连接的Canal Server地址、要处理的`destination`，以及全局的ES连接信息。

    ```yaml
    canalAdapters:
      - instance: bm_db01 # 对应Canal Server中的destination名称
        # sourceConnector: # Canal Server连接信息，如果Adapter和Server在同一部署，很多可以默认
        #   type: canal # 或 rds ...
        #   properties:
        #     canal.server.host: localhost # Canal Server的主机，如果是Docker网络，可能是canal-server容器名
        #     canal.server.port: 11111
        #     canal.destination: bm_db01
        #     canal.user: ""
        #     canal.passwd: ""
        groups:
          - groupId: g1
            outerAdapters: # 配置外部适配器，即目标数据源
              - name: es7 # 指定使用es7的适配器 (确保你的Adapter版本支持es7)
                mode: sync # 同步模式
                properties:
                  # ES连接信息
                  elasticsearch.hosts: elasticsearch:9200 # Docker网络中的ES服务名和端口
                  # elasticsearch.username: # 如果ES有认证
                  # elasticsearch.password:
                  # elasticsearch.cluster.name: # 如果有集群名
      - instance: bm_db02 # 第二个destination的配置，类似bm_db01
        # ...
        groups:
          - groupId: g1
            outerAdapters:
              - name: es7
                mode: sync
                properties:
                  elasticsearch.hosts: elasticsearch:9200
    # ... 其他Adapter全局配置
    ```
* **库表同步映射配置 (YML文件)：**
  根据你的博文描述，需要在Canal Adapter的 `conf/es7/` 目录下（或者你指定的ES适配器对应的配置目录）为每个需要同步的**逻辑表**（即使它在MySQL中是分片表）创建一个YML配置文件。这个YML文件定义了从MySQL表到ES索引的映射关系、主键、字段映射等。

  例如，为 `raffle_activity_order` (逻辑表名，它可能对应MySQL中的 `big_market_01.raffle_activity_order_xx` 和 `big_market_02.raffle_activity_order_yy`) 创建 `conf/es7/big_market_raffle_activity_order.yml`:

    ```yaml
    # 数据源信息 (Adapter会根据这个信息匹配Canal Server传来的数据)
    dataSourceKey: defaultDS # 默认，或与application.yml中配置的对应
    destination: bm_db01 # 这个配置属于哪个destination，或者可以配置为监听所有
    groupId: g1
    # 逻辑表名，Adapter会用这个名字去匹配Canal Server事件中的表名（可能需要正则或通配符）
    # 或者，更常见的是，这里的 table 字段直接指定了要同步到ES的索引名，
    # 而具体的MySQL表名匹配规则在更上层的Adapter配置或通过canal.instance.filter.regex来处理。
    # Canal Adapter的YML配置细节较多，具体字段名和结构请参考官方文档。
    # 这里是一个简化的概念，实际YML可能更复杂。
    
    # 简化的YML示例，更准确的配置请查阅Canal Adapter文档
    # 通常YML文件名会是 database-table.yml 或类似格式，Adapter会加载它们
    # 假设YML文件名直接对应ES的索引名，或者在内部指定
    # File: conf/es7/big_market_raffle_activity_order.yml
    elasticsearch:
      # ES索引名，将所有分片表的raffle_activity_order数据同步到这个统一索引
      index: big_market.raffle_activity_order
      # id对应MySQL表中的主键字段名，用于ES文档的_id
      # 如果是联合主键，可能需要特殊处理或自定义生成策略
      pk: _order_id # 假设MySQL表中的主键是 order_id，同步到ES时字段名为 _order_id
      # （注意：Adapter的YML配置中，字段名可能不需要前缀 "_" , 它会自动处理或根据配置添加）
      # mapping: # 可选，如果ES索引的mapping不是自动创建或需要更精细控制
      #   fields:
      //         - column: order_id
      //           name: _order_id
      //           type: keyword
      //         - column: user_id
      //           name: _user_id
      //           type: keyword
      //         ... 其他字段映射
    ```

  需要为 `user_raffle_order` 也创建一个类似的YML配置文件。
  **重要：Canal Adapter的YML配置文件格式和具体字段非常关键，强烈建议查阅你所使用的Canal Adapter版本的官方文档来获取准确的配置方法。** 上述YML仅为示意。

### 4. 运行状态检查

* 确保MySQL、Canal Server、Canal Adapter、Elasticsearch、Kibana都已启动。
* 使用Portainer或Docker日志命令 (`docker logs <container_name>`) 查看各个组件的运行日志，确保没有错误，特别是：
   * Canal Server是否成功连接到所有MySQL实例并开始拉取binlog。
   * Canal Adapter是否成功连接到Canal Server并获取到`destination`的数据。
   * Canal Adapter是否成功连接到Elasticsearch。
   * Canal Adapter在处理数据时是否有错误（例如YML配置错误、字段映射问题、ES写入权限问题等）。

## 🔮 ES索引创建与数据验证

### 1. 创建ES索引 (手动或通过Adapter自动创建)

* **手动创建 (通过cURL或Kibana Dev Tools):**
  在数据同步开始前，或者如果Adapter配置为不自动创建索引，你需要手动创建ES索引并定义好Mapping。这能让你对字段类型（`text`, `keyword`, `date`, `long`等）有更精确的控制，特别是对于需要分词的文本字段和需要精确匹配或聚合的keyword字段。

  **big_market.raffle_activity_order 索引创建 (使用提供的cURL):**

  ```shell
  curl -X PUT "http://127.0.0.1:9200/big_market.raffle_activity_order" -H 'Content-Type: application/json' -d'
  {
      "mappings": {
        "properties": {
          "_user_id":{"type": "keyword"},
          "_sku":{"type": "keyword"},
          "_activity_id":{"type": "keyword"},
          "_activity_name":{"type": "text", "analyzer": "ik_smart"},
          "_strategy_id":{"type": "keyword"},
          "_order_id":{"type": "keyword"},
          "_order_time":{"type": "date", "format": "yyyy-MM-dd HH:mm:ss||epoch_millis"},
          "_total_count":{"type": "integer"},
          "_day_count":{"type": "integer"},
          "_month_count":{"type": "integer"},
          "_pay_amount":{"type": "double"},
          "_state":{"type": "keyword"},
          "_out_business_no":{"type": "keyword"},
          "_create_time":{"type": "date", "format": "yyyy-MM-dd HH:mm:ss||epoch_millis"},
          "_update_time":{"type": "date", "format": "yyyy-MM-dd HH:mm:ss||epoch_millis"}
        }
      }
  }'
  ```

  **big_market.user_raffle_order 索引创建 (使用提供的cURL):**

  ```shell
  curl -X PUT "http://127.0.0.1:9200/big_market.user_raffle_order" -H 'Content-Type: application/json' -d'
  {
      "mappings": {
        "properties": {
          "_user_id":{"type": "keyword"},
          "_activity_id":{"type": "keyword"},
          "_activity_name":{"type": "text", "analyzer": "ik_smart"},
          "_strategy_id":{"type": "keyword"},
          "_order_id":{"type": "keyword"},
          "_order_time":{"type": "date", "format": "yyyy-MM-dd HH:mm:ss||epoch_millis"},
          "_order_state":{"type": "keyword"},
          "_create_time":{"type": "date", "format": "yyyy-MM-dd HH:mm:ss||epoch_millis"},
          "_update_time":{"type": "date", "format": "yyyy-MM-dd HH:mm:ss||epoch_millis"}
        }
      }
  }'
  ```

  **注意我对Mapping的建议性修改：**

   * `_user_id`, `_activity_id`, `_order_id` 等ID类字段通常用 `keyword` 类型，因为它们用于精确匹配、过滤或聚合，不需要分词。
   * `_activity_name` 这种可能需要模糊搜索的文本字段用 `text` 类型，并指定一个合适的分词器 (如 `ik_smart` 或 `ik_max_word`，前提是你的ES已安装IK分词器)。
   * `_order_time`, `_create_time`, `_update_time` 等时间字段用 `date` 类型，并可以指定 `format` (多种格式用 `||` 分隔，`epoch_millis` 表示毫秒时间戳)。
   * 数值型字段（如count, amount）应使用 `integer`, `long`, `double`, `float` 等数值类型。
   * 状态、类型等枚举性质的字段用 `keyword`。
   * **你提供的Mapping中所有字段都是 `text`，这对于非文本字段（如ID、日期、数字）来说是不合适的，会影响搜索、排序和聚合的准确性和性能。请务必根据字段的实际含义调整类型。**
* **Adapter自动创建：**
  某些版本的Canal Adapter或其ES适配器可能支持根据YML配置或源表结构自动创建索引和基础的Mapping。但这通常不如手动精细控制Mapping来得好。如果依赖自动创建，请务必检查生成的Mapping是否符合你的预期。

### 2. 在Kibana中创建索引模式 (Index Pattern / Data View)

* 打开Kibana (`http://127.0.0.1:5601`)。
* 导航到 "Stack Management" -> "Index Patterns" (或 "Data Views")。
* 点击 "Create index pattern"。
* **输入索引模式名称：**
   * 对于 `big_market.raffle_activity_order` 索引，就输入 `big_market.raffle_activity_order`。
   * 对于 `big_market.user_raffle_order` 索引，就输入 `big_market.user_raffle_order`。
   * (或者，如果你想用一个模式匹配多个相关的索引，可以使用通配符，例如 `big_market.*_order`。)
* **选择时间字段：** 选择一个合适的时间字段，如 `_create_time` 或 `_order_time`。
* 点击 "Create index pattern"。

### 3. 触发数据变更并验证同步

现在，环境和配置都已就绪，就可以验证我们的数据同步链路了。

* **执行业务操作：**
  运行你提供的测试方法（或其他能触发相关表数据变更的业务操作）：

    ```java
    // 在你的测试类或服务中执行
    @Test
    public void test_draw_for_es_sync() { // 给测试方法一个更明确的名称
        for (int i = 0; i < 10; i++) { // 可以先少量测试，比如1-2次
            ActivityDrawRequestDTO request = new ActivityDrawRequestDTO();
            request.setActivityId(100301L); // 确保这个活动ID存在且会操作你监听的表
            request.setUserId("xiaofuge_es_test_" + i); // 使用不同的用户ID，避免主键冲突
            Response<ActivityDrawResponseDTO> response = raffleActivityService.draw(request);
            log.info("ES同步测试 - 抽奖请求参数：{}", JSON.toJSONString(request));
            log.info("ES同步测试 - 抽奖测试结果：{}", JSON.toJSONString(response));
            // 可以在这里加个短暂的延时，等待Canal同步
            try { Thread.sleep(500); } catch (InterruptedException ignored) {}
        }
    }
    
    @Test
    public void test_calendarSignRebate_for_es_sync() throws InterruptedException {
        String userIdForSign = "xiaofuge_sign_test_01";
        Response<Boolean> response = raffleActivityService.calendarSignRebate(userIdForSign);
        log.info("ES同步测试 - 签到返利用户ID：{}", userIdForSign);
        log.info("ES同步测试 - 签到返利测试结果：{}", JSON.toJSONString(response));
        // new CountDownLatch(1).await(); // 如果是想在测试方法结束前阻塞，可以保留，否则去掉
    }
    ```

  **确保这些操作会修改你通过Canal监听的表 (例如 `raffle_activity_order_xx` 或 `user_raffle_order_xx`)。**
* **观察日志：**

   * MySQL的binlog是否产生新条目。
   * Canal Server的对应destination日志是否有新的数据拉取和解析记录。
   * Canal Adapter的日志是否有接收到数据并尝试写入ES的记录。注意是否有错误信息。
* **在Kibana Discover页面查看数据：**

   * 导航到 "Discover"页面 (`http://127.0.0.1:5601/app/discover`)。
   * 选择你刚刚创建的索引模式 (例如 `big_market.raffle_activity_order`)。
   * 调整时间范围到“最近几分钟”或“今天”。
   * 你应该能看到由 `test_draw()` 或 `test_calendarSignRebate()` 操作产生的新的数据记录已经同步到了Elasticsearch中！🎉
   * 尝试搜索这些新记录，例如按 `_user_id` 或 `_order_id` 搜索。

## 💡 关键挑战与思考

* **分片键的处理：** Canal Adapter通常需要知道如何从源数据中提取ES文档的 `_id`。如果你的分片键（如用户ID）本身不是MySQL表的主键，或者ES的 `_id` 需要由多个字段组合而成，你可能需要在Adapter的YML配置中进行更复杂的`pk`定义或使用脚本进行转换。
* **一致性与延迟：** 这是一套准实时同步系统，数据从MySQL到ES可被搜索之间存在一定的延迟。需要监控这个延迟，确保其在可接受范围内。
* **Mapping的重要性：** 再次强调，在ES中为字段设置正确的类型（`keyword`, `text`, `date`, `integer`等）对于后续的搜索、聚合、排序至关重要。直接使用`text`类型作为所有字段的默认类型是不可取的。
* **Canal Adapter的深入学习：** Canal Adapter的配置（特别是YML映射文件）有很多细节和高级功能（如字段过滤、重命名、ETL脚本等），值得深入研究其官方文档。
* **全量与增量的配合：** 对于历史数据的初始化，仍然需要一个全量同步的方案。Canal主要解决的是增量数据的同步。

## 🏁 总结

通过整合营销平台的分库分表MySQL、强大的CDC工具Canal以及便捷的Canal Adapter，我们成功地为运营团队构建了一套能够将分散数据聚合到Elasticsearch，并实现准实时查询和分析的解决方案。解决了分库分表带来的数据聚合难题。

这套架构在处理C端高并发写入和运营侧复杂查询的场景中非常实用。希望本篇实战分享，能帮助你更好地理解和应用这套技术栈。💪

---

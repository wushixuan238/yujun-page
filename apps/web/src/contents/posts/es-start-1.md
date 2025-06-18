---
title: "ElasticSearch入门（一）：商品搜索系统"  
category: "SD"  
publishedAt: "2025-05-31"  
summary: "ES入门系列"  
tags:  
  - ES
banner: images/banner/posts/es/es-01.png
alt: "图片替代文本"  
mathjax: false
---

# ElasticSearch入门（一）：商品搜索系统 🚀

ElasticSearch （简称ES）是一个非常重要的搜索引擎，对于Java后端开发来说是必须掌握的技能。代码是最好的老师，接下来我们基于一个简单的场景来进行初步的学习和认识。

想像一下，现在我们有一个在线商店，商品信息存储在MySQL中。我们的目标是，让用户能够通过商品名称、描述、价格范围、分类等条件快速搜索到商品。🛍️

🛠️使用到的技术栈如下：

* `Spring Boot`：快速搭建Java后端应用。
* `MyBatis`：操作MySQL数据库。
* `MySQL`：存储商品原始数据。
* `Elasticsearch`：为搜索而生，提供强大的全文搜索和分析能力。🔍
* `Kibana`：可视化`Elasticsearch`中的数据，并进行查询调试。📊

### 📁项目结构概览

```xml
elasticsearch-demo/
        ├── pom.xml
        ├── src/
        │   ├── main/
        │   │   ├── java/
        │   │   │   └── com/example/elasticsearchdemo/
        │   │   │       ├── ElasticsearchDemoApplication.java
        │   │   │       ├── config/
        │   │   │       │   └── ElasticsearchConfig.java  // ES客户端配置
        │   │   │       ├── controller/
        │   │   │       │   └── ProductController.java    // API接口
        │   │   │       ├── entity/
        │   │   │       │   └── Product.java              // 商品实体 (同时用于MySQL和ES)
        │   │   │       ├── mapper/
        │   │   │       │   └── ProductMapper.java        // MyBatis Mapper接口
        │   │   │       ├── repository/
        │   │   │       │   └── ProductEsRepository.java  // Spring Data ES Repository
        │   │   │       └── service/
        │   │   │           └── ProductService.java       // 业务逻辑
        │   │   └── resources/
        │   │       ├── application.yml           // Spring Boot配置
        │   │       ├── mybatis/
        │   │       ├─────mapper/
        └── ProductMapper.xml     // MyBatis SQL映射
        │   │       ├─────config/
        │   │       │   └── mybatis-config.xml     // MyBatis 配置文件
        │   │       └── static/
        │   │       └── templates/
        │   └── test/
        └── Docker-compose.yml                  // 用于快速启动MySQL, ES, Kibana
```

### ⚙️核心依赖及配置文件

pom.xml (部分核心依赖):

```xml
<parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>2.7.1</version>
    <relativePath/> <!-- lookup parent from repository -->
</parent>

<properties>
<java.version>8</java.version>
<!-- 统一管理 Elasticsearch 版本 -->
<elasticsearch.version>7.17.12</elasticsearch.version>
</properties>

<dependencies>
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-web</artifactId>
</dependency>
<dependency>
    <groupId>org.mybatis.spring.boot</groupId>
    <artifactId>mybatis-spring-boot-starter</artifactId>
    <version>2.1.4</version>
</dependency>
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-data-elasticsearch</artifactId>
</dependency>
<dependency>
    <groupId>mysql</groupId>
    <artifactId>mysql-connector-java</artifactId>
    <scope>runtime</scope>
    <version>8.0.30</version> <!-- 与你的MySQL版本匹配 -->
</dependency>
<dependency>
    <groupId>org.projectlombok</groupId>
    <artifactId>lombok</artifactId>
    <optional>true</optional>
</dependency>
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-test</artifactId>
    <scope>test</scope>
</dependency>
</dependencies>
        </project>
```

​**温馨提示**​💡：spring-boot-starter-data-elasticsearch 会引入 `elasticsearch-rest-high-level-client`。如果你使用的 ES 版本是 8.x+，官方推荐使用新的 `elasticsearch-java `客户端。为了简单起见，我们这里使用与 Spring Boot 2.7.x 兼容性较好的 `RestHighLevelClient`。如果你要用新的客户端，依赖和配置方式会有所不同。

**application.yml**

```yaml
server:
  port: 8080

spring:
  application:
    name: elasticsearch-demo
  datasource:
    url: jdbc:mysql://localhost:3306/es_demo?useUnicode=true&characterEncoding=utf-8&serverTimezone=Asia/Shanghai
    username: root
    password: your_mysql_password
    driver-class-name: com.mysql.cj.jdbc.Driver
  elasticsearch:
    # rest: # Spring Boot 2.x 使用 rest.uris
    uris: http://localhost:9200 # ES的地址
    # username: # 如果你的ES有密码保护
    # password:
  # 对于 Spring Boot 3.x 和新的 Java Client，配置会是这样：
  # elasticsearch:
  #   client:
  #     uris: http://localhost:9200

mybatis:
  mapper-locations: classpath:/mybatis/mapper/*.xml
  config-location: classpath:/mybatis/config/mybatis-config.xml

logging:
  level:
    org.springframework.data.elasticsearch.client.WIRE: TRACE # 打印ES请求日志，方便调试
    com.example.elasticsearchdemo: DEBUG
```

### 库表数据准备

库表数据很简单，我们只需要一个库和一个商品表 `product`：

```sql
CREATE TABLE `product` (
                           `id` BIGINT NOT NULL AUTO_INCREMENT,
                           `name` VARCHAR(255) NOT NULL,
                           `description` TEXT,
                           `price` DECIMAL(10, 2) NOT NULL,
                           `category` VARCHAR(100),
                           `tags` VARCHAR(255) COMMENT '逗号分隔的标签',
                           `stock` INT DEFAULT 0,
                           `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                           `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                           PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
```

### API介绍

本节提供的API主要有两部分，一部分负责直接操作我们后端MySQL数据库，这部分对于Java后端的老兵们来说，应该是我们的舒适区，所以我们会快速过一遍，让大家有个印象即可。具体细节可看仓库代码。

```shell
POST /api/products/db: 新增商品到MySQL

GET /api/products/db/{id}: 根据ID从MySQL查询商品

GET /api/products/db: 获取MySQL中所有商品

PUT /api/products/db/{id}: 根据ID更新MySQL中的商品

DELETE /api/products/db/{id}: 根据ID从MySQL删除商品
```

另一部分负责直接与Elasticsearch进行交互。这是我们本篇博客重点要学习的地方。

### ES高级商品搜索🕵️‍♂️📊

在我们深入了解这个强大的搜索接口之前，让我们可以思考一个问题：为什么不用MySQL中的 `SELECT` 语句来搜索呢？ES中的搜索比它更好更快吗？以便为后续学习原理做准备。

```java
public List<Product> searchProductsAdvanced(String keyword, String category, BigDecimal minPrice, BigDecimal maxPrice, Integer page, Integer size) {
        // 任务开始
        NativeSearchQueryBuilder queryBuilder = new NativeSearchQueryBuilder();
        // 用来装载各种搜索条件
        BoolQueryBuilder boolQuery = QueryBuilders.boolQuery();

        // --- 步骤1: 处理用户输入的关键词
        if (keyword != null && !keyword.trim().isEmpty()) {
            logger.debug("用户输入的关键词是: '{}'。准备在商品名称和描述中大海捞针！🌊", keyword);
            boolQuery.must(QueryBuilders.multiMatchQuery(keyword, "name", "description"));
        }
        if (category != null && !category.trim().isEmpty()) {
            logger.debug("用户指定了分类: '{}'。准备进行精确打击！🎯", category);
            /
            boolQuery.filter(QueryBuilders.termQuery("category", category)); 
        }
        BoolQueryBuilder priceBoolQuery = QueryBuilders.boolQuery();
        boolean hasPriceCondition = false; 
        if (minPrice != null) {
            logger.debug("用户设置了最低价格: {}", minPrice);
            priceBoolQuery.must(QueryBuilders.rangeQuery("price").gte(minPrice.doubleValue()));
            hasPriceCondition = true; // 有价格条件啦！
        }
        if (maxPrice != null) {
            logger.debug("用户设置了最高价格: {}", maxPrice);
            priceBoolQuery.must(QueryBuilders.rangeQuery("price").lte(maxPrice.doubleValue()));
            hasPriceCondition = true; // 又一个价格条件！
        }
        if (hasPriceCondition) {
            logger.debug("价格区间条件已设定，加入到主查询中。💰");
          
            boolQuery.filter(priceBoolQuery);
        }   
        if (!boolQuery.hasClauses()) {
            logger.info("用户未提供任何搜索条件。ES将根据其默认行为处理（可能匹配所有，或根据索引设置）。");
        }
        queryBuilder.withQuery(boolQuery);
        if (page != null && size != null && page >= 0 && size > 0) {
            logger.debug("分页设置：查看第 {} 页，每页 {} 条。", page, size);
            queryBuilder.withPageable(PageRequest.of(page, size));
        } else {
            
            logger.debug("用户未指定分页，使用默认设置：查看第 0 页，每页 10 条。");
            queryBuilder.withPageable(PageRequest.of(0, 10));
        }
        NativeSearchQuery searchQuery = queryBuilder.build();
        logger.debug("发往Elasticsearch的最终查询DSL: {}", searchQuery.getQuery().toString());
    
        logger.info("正在向Elasticsearch发送搜索请求...");
        SearchHits<Product> searchHits = elasticsearchOperations.search(searchQuery, Product.class, IndexCoordinates.of(INDEX_NAME));
        logger.info("Elasticsearch返回了 {} 条匹配的结果。", searchHits.getTotalHits());
        return searchHits.getSearchHits().stream()
                .map(SearchHit::getContent) // 从每个SearchHit中提取出Product对象
                .collect(Collectors.toList()); // 汇集成一个List<Product>
    }
```

总结上述核心步骤如下：

1. **首先准备好 ES搜索指令构建器**：`NativeSearchQueryBuilder`，这是我们用来组装最终发送给ES完整搜索命令的工具。
2. **再准备一个条件逻辑的组合器**：`BoolQueryBuilder`，这是用来灵活组合各种“必须满足”（must）、“应该满足”（should）、“必须不满足”（must_not）以及“过滤”（filter）条件的容器。
3. **接下来就可以进行搜索条件的组装**，逐一分析入参并添加**搜索线索**。
    1. 分类筛选🏷️：如果用户指定了商品分类，就构建一个 `term` 查询，指示ES精确匹配该分类，并将其作为过滤 (`filter`) 条件加入“条件逻辑组合器”（过滤条件不影响得分，效率更高）。
    2. 价格区间筛选 💰：如果用户设定了最低价或最高价（或两者都有），就构建一个 `range` 查询，指示ES筛选出价格在此区间的商品，并将其也作为过滤 (`filter`) 条件加入。
    3. 将所有条件打包：将包含所有已添加条件的“条件逻辑组合器” (`BoolQueryBuilder`) 设置为“ES搜索指令构建器” (`NativeSearchQueryBuilder`) 的主查询体 (`withQuery`)。
4. **添加分页与排序**：根据用户提供的页码 (page) 和每页数量 (size)（或使用默认值），配置分页参数 (withPageable)，告诉ES我们想看结果的哪一部分。如果需要，可以添加排序规则 (withSort)，比如按价格升序或按相关性（默认）排序。
5. **构建完整的ES搜索命令**：调用ES搜索指令构建器的 `build() `方法，生成一个最终的、原生的Elasticsearch查询对象 (`NativeSearchQuery`)。这个对象完整地描述了我们要执行的搜索操作。
6. **向ES发送指令**：使用 `elasticsearchOperations`（Spring Data ES提供的与ES交互的核心工具）的 `search() `方法，将构建好的 `NativeSearchQuery` 发送给ES服务。ES执行查询后，返回一个包含搜索结果的 `SearchHits` 对象，里面有匹配到的文档、总命中数、得分等信息。
7. **处理ES返回的结果**：从 `SearchHits` 中提取出实际的商品数据（`Product` 对象），忽略ES返回的其他元信息（如得分、高亮等，除非需要），并将它们收集成一个 `List`，使用 Stream API。将这个最终的商品列表返回给调用方（通常是Controller）。

对于第一次接触的同学来说可能比较复杂，熟能生巧，简单来说，核心就是 ： 收集条件，构建查询（DSL），配置分页/ 排序，执行搜索，处理结果。

### 🔄 同步数据到ES

接下来我们手动将MySQL数据库中`product`表里的所有商品数据同步到ES的`products`索引中，逻辑也很简单：

1. 从Mysql数据库中获取所有商品数据。
2. 将从数据库获取的所有商品数据批量保存到ES中。

```java
public long syncAllProductsToEs() {
        List<Product> allProductsFromDb = productMapper.findAll();
        if (allProductsFromDb.isEmpty()) {
            logger.info("No products found in DB to sync.");
            return 0;
        }
	// 同步的核心步骤，将数据库中的数据列表 批量保存到ES中
        productEsRepository.saveAll(allProductsFromDb);
        logger.info("Successfully synced {} products from DB to Elasticsearch.", allProductsFromDb.size());
        return allProductsFromDb.size();
    }
```

`productEsRepository` 是 Spring Data Elasticsearch 的 Repository 接口，它负责与Elasticsearch进行交互。`saveAll` 是 ElasticsearchRepository 提供的一个标准方法，用于一次性保存多个文档到ES，它比逐条保存效率更高。

具体来说，`productEsRepository` 会先将列表中的每个对象转换成ES能理解的JSON格式，然后发送给Elasticsearch服务，ES会将这些文档存储到名为 `products` 的索引中。
注： 这个索引名是在 `Product.java `实体类的 `@Document(indexName = "products") `注解中定义的。

---

**关于同步策略的碎碎念** **🗣️**

这里我们为了让大家先对整个流程有个初步的理解，采用了一种在生产环境中几乎不会使用的“笨办法”：**全量同步**（Full Synchronization）。即每次调用都会把Mysql中的所有商品数据都尝试写入ES中，这对于数据量不大的情况或者初始化同步是可行的👌。

但对于数据量非常大且频繁变动的生产环境，那这种全量同步的方式就会变得非常缓慢和低效！😫 。通常会采用更高效的**增量同步策略**。

在后续的博客中，我们会介绍更加优雅、高效的**增量同步策略**，敬请期待！😉

### 🚀 小实验：MySQL vs Elasticsearch 性能初探 ⏱️

理论说了这么多，Elasticsearch到底在搜索性能上比直接查MySQL快多少呢？口说无凭，我们来做一个简单的小实验直观感受一下。

**实验目标：** 对比在一定数据量下，针对特定搜索条件，直接查询MySQL和通过Elasticsearch进行搜索的响应时间。具体步骤如下：

1. 引入`EasyRandom`并批量插入数据
   为了让对比更有意义，我们需要一些像样的数据量。手动一条条插太慢了，这里我们使用`EasyRandom`库，来进行随机对象的生成。
2. 同步数据到Elasticsearch 🚛
   首先，调用我们前面创建的API，向MySQL插入 10000 条数据，等待其完成。然后，调用同步API，将MySQL中的所有数据同步到ES。
3. 定义搜索条件 🎯
   我们将选择一个能体现ES全文搜索和多条件组合能力的场景：

    * **关键词：** "笔记本" (期望能在 `name` 或 `description` 中模糊匹配)
    * **分类：** 假设我们随机生成的数据中，有些商品分类是 "数码产品"
    * **价格范围：** 假设我们想找价格在 100 到 800 之间的。
4. 计时开始：分别测试MySQL和ES的查询接口⏱️
   我们将使用工具（ApiFox）多次调用以下两个接口，并记录平均响应时间。
5. 成绩揭晓：分析结果与结论📊🏆

可以看到结果为125ms和40ms。（读者可自行测试，结果可能会有偏差）

当然，这并不意味着MySQL一无是处。MySQL在事务处理、关系维护、数据一致性等方面依然是基石。这里的实验只是为了凸显在“搜索”这一特定领域，ES作为专业搜索引擎的强大之处。在实际项目中，我们通常会将两者结合使用，MySQL作为主数据存储，ES作为搜索引擎，通过数据同步机制保持两者数据的一致性（或最终一致性）。

---

本节内容对应的代码仓库地址：  [es-demo](https://github.com/wushixuan238/es-demo)。仓库里有完整的代码，欢迎大家Clone下来动手实践。💻

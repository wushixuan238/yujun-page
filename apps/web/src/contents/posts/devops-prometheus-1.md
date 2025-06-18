---
title: "Prometheus + Grafana 实时监控大盘"  
category: "DevOps"  
publishedAt: "2025-06-14"  
summary: "DevOps"  
tags:  
  - DevOps
banner: /images/banner/posts/dev-ops/dev-ops-prometheus-1.png
alt: "图片替代文本"  
mathjax: false
---


# Prometheus + Grafana 实时监控大盘

想让应用性能不再是个玄学问题，就要亲手给它打造一个仪表盘，绝对不能仅靠日志和感觉来判断线上应用的健康状况。这个仪表盘能把所有关键指标——比如实时QPS、CPU占用、内存曲线——都转化为直观的图表。这样，我们就能用数据说话，精确地找到瓶颈、评估容量，而不是靠猜测。

本篇文章主要用于初识 `Prometheus` + `Grafana` + `JMeter` ，并利用它们打造技术报告中一些炫酷、信息量爆炸的监控大盘。
具体步骤如下：

* 创建一个模拟的 Spring Boot 接口。
* 使用 Docker 快速部署 Prometheus 和 Grafana。
* 将 Spring Boot 应用接入监控，并在 Grafana 上创建出专业级的监控图表。

## 创建被监控的测试应用 (Spring Boot)

创建SpringBoot应用，引入必要的依赖：

```xml
<dependencies>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
	<!--监控：actuator-上报，prometheus-采集，grafana-展示-->
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-actuator</artifactId>
    </dependency>
    <dependency>
        <groupId>io.micrometer</groupId>
        <artifactId>micrometer-registry-prometheus</artifactId>
        <scope>runtime</scope>
    </dependency>
</dependencies>
```

模拟一个接口（或者已有一个真实的接口）：

```java
@RestController
public class RaffleController {

    private final Random random = new Random();

    @PostMapping("/api/raffle/draw")
    public String drawRaffle() {
        try {
            // 模拟业务处理耗时，50-150ms
            int processingTime = 50 + random.nextInt(100);
            Thread.sleep(processingTime);

            // 模拟抽奖成功或失败
            if (random.nextInt(10) < 8) { // 80% 概率成功
                return "{\"code\": \"200\", \"message\": \"恭喜你，抽奖成功！\"}";
            } else {
                return "{\"code\": \"500\", \"message\": \"哎呀，库存不足，抽奖失败！\"}";
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return "{\"code\": \"503\", \"message\": \"服务器繁忙，请稍后再试！\"}";
        }
    }
}
```

# 搭建监控系统 (Prometheus + Grafana)

我们将使用 Docker Compose 来一键启动和管理我们的监控服务，这是目前最流行、最便捷的方式。

如果环境还没有安装的话，在你的docker-compose文件中，添加下面内容：

```yaml
# 数据采集
  prometheus:
    image: bitnami/prometheus:2.47.2
    container_name: prometheus
    restart: always
    ports:
      - 9099:9090
    volumes:
      - ./prometheus/prometheus.yml:/etc/prometheus/prometheus.yml
    networks:
      - my-network

  # 监控界面
  grafana:
    image: grafana/grafana:10.2.0
    container_name: grafana
    restart: always
    ports:
      - 4000:4000
    depends_on:
      - prometheus
    volumes:
      - ./grafana:/etc/grafana
    networks:
      - my-network

networks:
  my-network:
    driver: bridge
```

注意：在启动 Prometheus 容器时，`prometheus.yml `核心配置文件是至关重要的。
创建 Prometheus 配置文件:
在你的devops目录下，创建一个名为 prometheus 的文件夹，并在其中新建一个 prometheus.yml 文件。这个文件告诉 Prometheus 去哪里抓取监控数据。

```yaml
# prometheus/prometheus.yml

global:
  scrape_interval: 15s # 每 15 秒抓取一次

scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090'] # 抓取 Prometheus 自己的数据

  - job_name: 'spring-boot-app'
    metrics_path: '/actuator/prometheus' # Spring Boot 应用暴露指标的路径
    static_configs:
      # 这里是关键！host.docker.internal 是一个特殊的 DNS 名称，
      # 在 Docker 容器内部，它会解析为你宿主机的 IP 地址。
      - targets: ['172.17.0.1:8080']
```

它告诉 Prometheus 要去哪里、以什么频率、抓取哪些监控数据。

或者，如果我们有更复杂的场景，比如一个典型的、用于监控一个分布式应用（多实例部署）的 Prometheus 配置：

```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'big-market-app'
    metrics_path: '/actuator/prometheus'
    static_configs:
      - targets:
          - 'big-market-app-01:8091'
          - 'big-market-app-02:8092'
        labels:
          app: 'big-market-app'
```

这段配置的核心思想是：告诉Prometheus，我这里有一个叫 big-market-app 的监控任务。请你每隔 15 秒，就去访问 big-market-app-01:8091 和 big-market-app-02:8092 这两个地址，记住要去它们的 /actuator/prometheus 路径下拿数据。哦对了，所有从这两个地方拿回来的数据，都请帮我贴上一个 app="big-market-app" 的标签，方便我以后整理和查询。

如果没有自定义的配置文件的话，也就是启动 Prometheus 容器时，没有挂载自己的 prometheus.yml，容器并不会报错。因为它会使用镜像中内置的一个默认的、最小化的 `prometheus.yml`。这个默认配置文件的内容大致是：

```yaml
global:
  scrape_interval: 15s
scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']
```

这个配置的唯一作用就是让 Prometheus 每隔 15 秒抓取它自己。
所以，结果就是会得到一个成功运行、但毫无用处的 Prometheus 容器。它能监控自己的健康状况，但对于你的任何其他应用（比如 Spring Boot、MySQL 等）都一无所知。




### Grafana可视化

我们要做的就只有在 Grafana 中配置数据源和仪表盘。

登录 Grafana：访问 `http://localhost:3000`。默认用户名和密码都是 admin。

接着添加数据源：

* 点击左侧菜单的齿轮图标 (Configuration) -> "Data Sources"。
* 点击 "Add data source"，选择 "Prometheus"。
* 在 "Prometheus server URL" 中填入 `http://prometheus:9090`。（注意：因为 Grafana 和 Prometheus 在同一个 Docker 网络中，可以直接使用服务名 prometheus 作为主机名）。
* 点击 "Save & test"，如果显示绿色成功提示，说明连接成功。

最后一步，导入现成的仪表盘。社区里有大量现成的优秀 Spring Boot 监控模板，我们可以直接导入使用：

* 点击左侧菜单的 “+” (Create) -> "Import"。
* 在 "Import via grafana.com" 输入框中填入 ID 12856，然后点击 "Load"。这是一个非常受欢迎的 Spring Boot 2 APM 仪表盘。
* 在下一个页面，选择你刚刚配置的 Prometheus 数据源，点击 "Import"。

现在仪表盘还是空的，因为没有流量。之后制造压力，观察图表。


### 使用 JMeter 专业压测

现在，我们将使用 Apache JMeter 这个行业标准的压测工具，来模拟大量用户同时抽奖。

> 前提：请先从 JMeter 官网下载并解压，确保可以运行 bin目录下的jmeter.bat(Windows) 或jmeter.sh(Mac/Linux) 来启动 JMeter 的图形化界面。

步骤 1: 创建基础测试计划

* 打开 JMeter。
* 右键点击左侧的“测试计划” -> “添加” -> “线程(用户)” -> “线程组”。

步骤 2: 配置线程组 - 定义虚拟用户规模

线程组用来定义我们将模拟多少用户、以多快的速度、进行多少次测试。

* ​线程数 (Number of Threads): 填入 50。这代表我们将模拟 50 个并发用户。​
* ​Ramp-up 时间 (秒): 填入 10。这代表 JMeter 会在 10 秒内，将这 50 个用户全部启动起来（平均每秒启动 5 个），这样可以给服务器一个缓冲，而不是瞬间冲击。​
* ​循环次数 (Loop Count): 勾选 永远 (Forever)。我们将让这 50 个用户不停地循环抽奖，直到我们手动停止，这样才能在 Grafana 上看到持续的负载。


步骤 3: 添加 HTTP 请求 - 定义用户的任务

现在需要告诉这 50 个用户，他们具体要做什么。

* 右键点击你创建的“线程组” -> “添加” -> “取样器” -> “HTTP 请求”。
* ​配置 HTTP 请求：

    * 名称: 可以起个有意义的名字，比如 POST 抽奖接口。
    * ​协议: http
    * 服务器名称或 IP: localhost
    * 端口号: 8080
    * 方法: 非常重要！我们的接口是 POST，所以这里必须选择**POST**。
    * 路径: /api/raffle/draw


步骤 4: 添加监听器 - 在 JMeter 中观察结果

为了确保我们的压测脚本配置正确，并能实时看到结果，我们需要添加两个核心的监听器。

* ​右键点击线程组 -> 添加 -> 监听器 -> **查看结果树**。
  ​* ​作用：它会显示出每一次请求的详细信息。压测开始后，我们可以用它来检查最初的几个请求是否成功（显示为绿色），如果失败了，可以方便地查看原因。​
* ​右键点击线程组 -> 添加 -> 监听器 -> **聚合报告**。
  ​* ​​​作用：它以表格形式实时统计压测的核心指标，如：样本数、平均响应时间、错误率、以及最重要的 **吞吐量 (Throughput)**，这个值约等于我们常说的 **TPS (每秒事务数)**。

  ​​​

步骤 5: 启动压测。

* ​保存测试计划：在启动前，JMeter 会提示你保存测试计划，给它起个名字（如 **raffle-test.jmx**）并保存。​
* ​启动：点击工具栏上那个绿色的“启动”按钮。

​初步观察：

* ​切换到查看**结果树**，应该能看到滚动的绿色请求记录。
* 切换到**聚合报告**，会看到吞吐量一列的数字在不断攀升并稳定在一个值附近。
* 切换到 Grafana ：打开 Grafana 仪表盘（ID: 12856 或你自己创建的）。将会看到与 完全不同的景象：
    * ​QPS/RPS 图表：不再是小打小闹的线条，而是一条持续稳定在高位，数值约等于你在 JMeter 聚合报告里看到的吞吐量。​
    * ​响应时间图表：可以清晰地看到在 50 并发下，接口的平均响应时间和 P95/P99 响应时间是多少。​
    * ​JVM 内存图表：会看到一个非常经典的**锯齿状**图形。这是因为在高并发下，内存使用量快速上升，直到触发垃圾回收（GC），内存瞬间下降，然后再次快速上升，如此往复。​
    * ​CPU 使用率：CPU 将会稳定在一个较高的水平，真实地反映了系统在处理 50 并发用户请求时的计算压力。​
    * ​Tomcat 线程数：活跃线程数会迅速上升到 50 左右，并保持稳定，直观地体现了并发用户的数量。​
* ​停止压测：观察足够后，点击 JMeter 工具栏的停止（红色的方块）或平滑关闭按钮来结束测试。你会看到 Grafana 上的所有指标都随之回落。​

---

现在，回到 Grafana 仪表盘 (刷新一下)，会看到图表开始跳动，QPS、响应时间、JVM 内存、CPU 使用率……所有信息都一目了然。

## 为什么仪表盘上没有数据？

这是所有初学者在搭建监控系统时必然会遇到的经典问题。

别担心，这通常不是什么大问题，而是数据流在某个环节被卡住了。通常有如下几个排查思路：

* Spring Boot 应用 - 负责 产生 指标数据。
* Prometheus - 负责 抓取并存储 这些数据。
* Grafana - 负责 查询并展示 这些数据。

只要其中一级工作不正常，最终的结果就是没有数据。现在，我们来一步步地排查问题。

首先检查Spring Boot 应用是否在正常生产数据？

在浏览器或使用 curl 访问 Actuator 暴露的 Prometheus 端点：

```shell
curl http://localhost:8080/actuator/prometheus
```

正常情况 ✅：你应该能看到满屏的、以 # 和文本开头的指标数据，例如 jvm_memory_used_bytes...、http_server_requests_seconds_count... 等等。

异常情况 ❌：连接被拒绝 (Connection Refused)：说明 Spring Boot 应用没启动。
404 Not Found：说明 application.yml 配置有误，没有正确暴露 prometheus 端点。

---

第 2 步：检查 - Prometheus 是否成功抓取到数据？

这是最常见的故障点。Prometheus 是数据中转站，它必须能成功连接到你的应用。

* 打开 Prometheus UI：在浏览器访问 `http://localhost:9090`。
* 检查 Targets 页面：点击顶部菜单的 "Status" -> "Targets"。
* 分析 Target 状态：在 Targets 页面，找到 job_name 为 spring-boot-app 的那一行，看它的 State：
    * State 是 UP (绿色) ✅：这说明 Prometheus 已经成功连接并抓取到了应用的数据。问题几乎可以确定是在 Grafana 那边。
    * State 是 DOWN (红色)❌ ：问题就在这里。 这说明 Prometheus 无法连接到 Spring Boot 应用。
        * 网络问题 (90% 的可能性)：Prometheus 是在 Docker 容器里运行的，在容器内部，localhost 指的不是你电脑的 localhost，而是它自己。它需要一个特殊的方式来访问宿主机（你的电脑）。
* 防火墙问题：你电脑的防火墙可能阻止了来自 Docker 容器的访问。可以暂时关闭防火墙测试一下。
* 配置错误：检查 prometheus.yml 里的端口号（8080）或 metrics_path（/actuator/prometheus）是否写错了。

第 3 步：检查 - Grafana 是否配置正确？

如果你能确认 Prometheus 的 Target 是 UP 状态，那么问题就一定出在 Grafana 的配置上。

* ​检查数据源连接：

    * 登录 Grafana (**http://localhost:3000**)。
    * 进入左侧菜单的齿轮图标 (Configuration) -> "Data Sources"。
    * 点击 Prometheus 数据源。
    * ​关键检查点：Prometheus server URL配置是否正确？

        * 错误配置 ❌: http://localhost:9090。在 Grafana 容器内部，localhost指的是它自己，而不是 Prometheus 容器。
        * 正确配置 ✅: http://prometheus:9090。因为 Grafana 和 Prometheus 运行在同一个 docker-compose网络中，它们可以直接通过服务名（prometheus）进行通信。​ ​
    * 点击页面底部的 "Save & test" 按钮。你**必须**看到一个绿色的 "Data source is working" 提示。如果报错，说明 URL 肯定写错了。
* ​检查仪表盘和查询语句：
  ​* ​确认查询目标：打开你的仪表盘，随便点开一个没有数据的面板，点击 "Edit"。查看下方的查询语句，例如 sum(rate(http\_server\_requests\_seconds\_count[1m]))。

    * ​​**去 Prometheus 验证查询**：复制这个查询语句，**回到 Prometheus 的 UI 界面 (**http://localhost:9090**)**，将它粘贴到查询框中，点击 "Execute"。

      ​​* ​正常情况 ✅：Prometheus 中应该能查询出数据图表。如果这里有数据，而 Grafana 没有，说明问题出在 Grafana 的数据源连接或时间范围上。​

        * ​**异常情况 ❌**：如果在 Prometheus 里也查不到数据（返回 "Empty query result"），但你的 Target 又是 UP 的，说明这个指标可能还没产生。**你是否对你的 Spring Boot 接口发起了请求？** **像** **http\_server\_requests\_seconds\_count** **这样的指标，只有在接口被调用后才会产生。**
          ​
* ​**检查时间范围**：这是个非常容易忽略的坑。在 Grafana 仪表盘的右上角，有一个时间范围选择器。

    * 确认你查看的时间范围是正确的：比如，应用刚启动 5 分钟，但选择的是 "Last 6 hours"，那么图表上自然是空的。
    * ​​解决方案：将时间范围调整为 "Last 5 minutes"，并设置一个自动刷新（比如每 5 秒）。
      ​​

请按照以上1 -> 2 -> 3的顺序进行排查，不要跳步。99% 的无数据问题都能通过这个流程定位到。

* 先curl你的 Spring Boot 应用。
* 再去看 Prometheus 的Targets页面。
* 最后才去检查 Grafana 的Data Source和Dashboard。

## 总结

到这里我们已经成功地搭建了一套现代化的应用监控系统。回顾一下，我们完成了：

* 用 Spring Boot Actuator 和 Micrometer 暴露了应用的核心指标。
* 用 Prometheus 作为时间序列数据库来收集和存储这些指标。
* 用 Grafana 进行了可视化展示。

这套技术栈是当前**云原生领域监控**的基石。从这里开始，我们之后可以继续探索更高级的 PromQL 查询、自定义 Grafana 图表以及告警设置，成为一名全栈监控高手。

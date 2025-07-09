---
title: "Arthas（一):安装与使用"  
category: "DevOps"  
publishedAt: "2025-05-21"  
summary: "DevOps"  
tags:  
  - DevOps
banner: /images/banner/posts/dev-ops/dev-ops-arthas-01.png
alt: "图片替代文本"  
mathjax: false
---


# Arthas

## 下载 Arthas

Arthas 只需要一个 `arthas-boot.jar` 文件。下载和卸载都很简单。

```
curl -O <https://arthas.aliyun.com/arthas-boot.jar>
```

下载完成后，进入 `arthas-boot.jar` 所在的目录，执行：

```
java -jar arthas-boot.jar
```

之后Arthas 会自动检测当前机器上运行的 Java 进程，并列出它们的 PID（进程ID）。

这时我们只需输入 Spring Boot 应用对应的数字（比如：3），然后回车。

成功连接后，会看到 Arthas 的 Logo 和 arthas> 提示符，这表示我们已经进入 Arthas 控制台了！🥳

---

## 初步探索

Arthas 是一个用于线上 Java 应用监控和问题排查的工具。
它能让我们实时看到应用的负载、内存、垃圾回收、线程等运行状态，还能在不修改代码的前提下，查看方法调用的参数、返回值、执行时间等问题信息，帮助我们快速定位线上问题。

当我们使用`watch`命令监控某个方法时，Arthas 的工作流程如下：

* Arthas 找到这个方法在内存中的位置。
* 在这个方法的开头和结尾偷偷加上记录参数和返回值的代码。
* 方法被调用时，这些额外代码就会把信息传回给你看。
* 等你不需要监控了，Arthas 就把这些额外代码去掉。

### 初探 JVM 状态：`dashboard`

这是我们进入 Arthas 后可以敲的第一个命令。它会显示当前 JVM 的概览信息，包括线程、内存、GC、CPU 等实时数据。

```bash
dashboard
```

dashboard 会每隔 5 秒刷新一次。可以看到 CPU 使用率、内存使用情况、线程数量等等。这是一个非常好的“健康检查”命令。按 Ctrl+C 或 q 退出 dashboard。

### 查看线程信息：thread

如果发现，dashboard 里 CPU 飙高，或者线程数异常，thread 命令就能帮我们深入排查。🕵️

```bash
thread
```

它会列出所有线程以及它们的状态。如果你想看哪个线程在消耗 CPU，可以使用`thread -n 3`(列出 CPU 占用最高的 3 个线程)。 如果怀疑有死锁，可以直接敲 thread -b (查找死锁)。

这个命令对于发现线程阻塞、死锁、CPU 占用过高的问题非常有用。

### 查找类：sc (Search Class)

现在，我们想看 `UserService` 里的变量。首先，我们要找到这个类。

```bash
sc com.example.service.UserService
```

也可以使用通配符：`sc *UserService*` 如果想看类的详细信息（比如类加载器、源文件路径等），可以加上 -d 参数。

### 查找方法：sm(Search Method)

查找方法：sm (Search Method)

```bash
sm com.example.arthasdemo.service.UserService
```

同样，加 -d 可以看方法签名、所在行号等详细信息。

### 查看运行时变量：ognl / getstatic

这是Arthas的精髓之一，它让我们能够像写代码一样，在运行时获取并操作对象。

加入现在我们知道 UserService 里有一个静态变量 totalUserCount，它记录了用户总量。在日志里可能没打出来，但现在你想知道它的实时值。难道要加个日志然后重启吗？注意现在我们是线上环境。

```bash
ognl '@com.example.arthasdemo.service.UserService@totalUserCount'
or
getstatic com.example.arthasdemo.service.UserService totalUserCount
```

意不意外？🤯 我们不需要重启服务，不需要加一行日志，就能直接看到这个静态变量的实时值。

甚至可以直接在 Arthas 里调用方法来修改变量的值（但要慎用，线上环境可能造成严重后果，要对线上环境保持敬畏）⚠️

### 退出 Arthas：quit 或 exit。

当我们完成排查后，输入 quit 或 exit 即可退出 Arthas 控制台，但不会停止 Java 应用。

> Arthas 的学习需要多练多用。继续实践，保持项目驱动，努力让线上排查能力达到一个新高度。

熟练使用：ognl / getstatic ，这很关键。能让我们在运行时实时查看和修改任何对象的字段、调用任何方法，彻底摆脱了打日志-重启-部署的噩梦。




### Case1:死锁排查

既然 Arthas 可以用来排查线上问题，自然，我们也可以利用它来排查死锁。

首先，启动并附加到目标Java线程：
```shell
java -jar arthas-boot.jar
```
然后选择要诊断的Java进程前面的数字。观察得到的PID。

接下来我们就可以使用thread命令查看线程状态：
```shell
thread #查看所有线程状态
thread --state BLOCKED #查看特定状态的线程
```

之后，我们就可以来检测死锁具体出现在哪个位置,主要分为两步，先拿到线程ID：
```shell
thread -b
# 或者
thread --block
```
这个命令会直接显示当前JVM中存在的死锁线程信息。

接着，我们可以拿着死锁线程的ID来分析死锁线程堆栈：
```shell
thread <thread-id>
# 例如：thread 12
```
就可以定位到具体的行数，之后进行排查。
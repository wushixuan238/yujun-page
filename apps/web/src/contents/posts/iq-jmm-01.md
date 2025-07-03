---
title: "Java内存模型"  
category: "Interview"  
publishedAt: "2025-05-26"  
summary: "面试题整理"  
tags:  
  - 面试题整理
banner: /images/banner/posts/jvm/jvm-g1.png
alt: "图片替代文本"  
mathjax: false
---


# Java内存模型

# JMM

> 在理解技术的时候，尽量先将每项技术解决的问题以及产生的问题理解了，也希望我们能够在这方面多思考、多总结。

对于Java开发者来说，并发编程是一个既迷人又充满挑战的领域。我们经常会遇到一些灵异事件：明明在一个线程里修改了某个变量的值，为什么在另一个线程里看到的还是旧值？或者，为什么代码的执行顺序和我写的完全不一样？

这些问题的答案，都隐藏在一个核心概念背后——Java内存模型（Java Memory Model, JMM）。

要真正理解JMM，我们不能直接一头扎进它抽象的规则里。相反，我们应该先了解两个导致并发问题的幕后黑手：指令重排序 和 缓存可见性。

问题一：追求极致性能的乱序执行

我们通常想当然地认为，代码会严格按照我们书写的顺序一行一行地执行。

```java
a = 3;
b = 2;
a = a + 1;
```

在我们的认知里，计算机会先给 a 赋值为3，再给 b 赋值为2，最后计算 a+1 并更新 a 的值。其底层的指令序列可能如下：

然而，为了压榨出硬件的每一分性能，编译器和CPU可能会“自作主张”，在不改变单线程最终结果的前提下，调整指令的执行顺序。它们可能会认为，a = a + 1 这个操作与 b = 2 之间没有任何依赖关系，调换一下顺序也无妨。

```java
a = 3;
a = a + 1; // 提前执行
b = 2;
```

其对应的指令序列也发生了变化。

在单线程环境下，这两种执行顺序的最终结果完全一致（a 等于4，b 等于2），所以这种优化是安全且有效的。

**但多线程环境打破了这一切**。如果另一个线程依赖于 a 和 b 的状态，它可能会在 a 已经被更新为4，但 b 还没被赋值为2的“中间时刻”读取数据，从而得到一个不一致、不合逻辑的视图。

这就是并发编程的第一个挑战：有序性（Ordering） 问题。

问题二：CPU缓存导致的“可见性”难题

另一个更隐蔽的问题源于现代计算机的硬件架构。为了弥补CPU超高速度与主内存（RAM）相对较慢速度之间的巨大鸿沟，计算机科学家设计了多级缓存（Cache）。

这张图告诉我们几个关键信息：
离CPU核心越近，速度越快，但容量越小（寄存器 > L1缓存 > L2缓存 > L3缓存 > 内存）。
每个核心（Core）都有自己独享的寄存器和L1缓存。
L2缓存可能被几个核心共享，L3缓存和主内存（RAM）通常是所有核心共享的。

当一个核心需要操作数据时，它会优先将数据从主内存复制一份到自己的高速缓存中。后续的读写操作都直接在这个“本地副本”上进行，因为这样快得多。只有在必要的时候，才会将修改后的数据同步回主内存。

现在，让我们用一个具体的Java例子来看看问题是如何产生的：

我们有两个线程：writer-thread 和 reader-thread，它们共享一个变量 x，初始值为0。假设它们分别运行在两个不同的CPU核心上（Core 1 和 Core 2）。

* ​Writer-Thread执行：writer-thread 在**Core 1** 上运行。它执行`x = 1;`。为了效率，CPU并不会直接去修改主内存中的 **x**。而是：

  * ​将主内存中的 **x**（值为0）加载到 **Core 1的本地缓存**。​
  * 在Core 1的本地缓存中将x的值修改为1。
* ​Reader-Thread执行：几乎在同一时间，reader-thread在Core 2上运行。它执行int r2 = x;。它会：

  * 去Core 2的本地缓存中找x，没找到。
  * 去共享缓存或主内存中找x。此时，Core 1可能还没来得及将它缓存中的新值 1写回主内存。
  * ​因此，Core 2 从主内存中读到了x的旧值 0。

    ​
    最终，r2 的值是0，而不是我们期望的1。writer-thread 的修改，对于 reader-thread 来说是“不可见”的。这就是并发编程的第二个挑战：可见性（Visibility） 问题。

现在我们明白了，由于硬件层面的指令重排序和多级缓存，并发编程充满了“陷阱”。如果我们直接在这样的硬件上编程，那将是一场噩梦。

Java内存模型（JMM） 正是为此而生。

JMM不是一个物理存在，而是一套规范和规则。 它定义了Java程序中各个变量（实例字段、静态字段等）的访问规则，以及在多线程环境下，如何确保操作的原子性、可见性和有序性。

JMM屏蔽了底层不同硬件和操作系统的内存访问差异，为所有Java开发者提供了一个一致的、可预测的内存视图。它向我们承诺：**只要你遵守我的规则，我就能保证你的多线程程序在任何平台上都能表现出你想要的行为。**

JMM通过引入一系列机制（如 volatile, synchronized, final 关键字和 Happens-Before 原则）来解决上述问题：

* volatile：当一个变量被声明为 volatile 时，JMM会确保：
  * 保证可见性：对这个变量的修改会立刻被刷新到主内存，其他线程读取前会先使自己的本地缓存失效，强制从主内存读取最新值。
  * 禁止指令重排序：在一定程度上阻止了编译器和CPU对 volatile 变量相关代码的乱序优化，保证了有序性。
* synchronized：它提供的不仅仅是互斥锁，还包含了强大的内存可见性保证。
  * 当一个线程退出 synchronized 块时，它在块内做的所有修改都必须刷新到主内存。当另一个线程进入同一个锁保护的 synchronized 块时，它会清空本地缓存，从主内存加载所需变量。

所以，让我们回顾一下整个逻辑链条，

* 为了追求极致性能，CPU和编译器会进行指令重排序，并在多级缓存上操作数据副本。
* 这在多线程环境下导致了有序性和可见性问题，使得程序行为不可预测。
* Java内存模型（JMM） 作为一套规则，定义了线程如何与主内存交互，解决了这些底层硬件带来的复杂性。
* JMM为我们提供了 volatile、synchronized 等工具，让我们能够编写出正确、可靠的并发程序。

> 理解JMM的“为什么”——即它所要解决的硬件层面的问题，远比死记硬背它的规则要重要得多。当我们下一次遇到并发bug时，或许就能从指令重排序和缓存可见性的角度，找到问题的根源。

### Happens-Before 原则：JMM的基石

为什么需要Happens-Before原则？

我们已经知道，为了性能，编译器和CPU会进行指令重排序，并且CPU有多级缓存，这会导致可见性和有序性问题。

如果让程序员直接去面对这些底层的复杂性，去思考“这里有没有缓存？”、“那里的指令会不会被重排？”，那并发编程将寸步难行。

因此，JMM提供了一套更高层次、更易于理解的规则，来帮助我们判断在多线程环境下，一个操作的结果是否对另一个操作可见。这套规则，就是Happens-Before原则。

**核心思想是：如果两个操作之间存在Happens-Before关系，那么前一个操作的结果就一定对后一个操作可见，并且前一个操作的执行顺序排在后一个操作之前。**

可以把它理解为内存可见性的因果律，如果事件A是因，事件B是果，那么必须保证“因”发生在了“果”的前面，并且“因”造成的影响能被“果”观察到。

**Happens-Before的8条黄金法则**：JMM定义了以下8条天然的Happens-Before规则。这些规则是Java语言内建的，你不需要做任何事，它们就自动生效。

2. 监视器锁规则 (Monitor Lock Rule)

规则： 对一个锁的`unlock`操作 happens-before 于后续对同一个锁的`lock`操作。

这也是 synchronized 关键字能保证可见性的根本原因。

```java
// 线程A
synchronized(lock) {
    x = 10; // unlock操作发生在此代码块结束时
}

// 线程B
synchronized(lock) { // lock操作发生在此代码块开始时
    System.out.println(x); // 保证能看到 x = 10
}
```

3. volatile变量规则

规则： 对一个volatile变量的写操作 happens-before 于后续对同一个volatile变量的读操作。

这是volatile关键字能保证可见性的根本原因。

```java
// 线程A
volatile boolean flag = true; // 写操作

// 线程B
while(flag) { // 读操作
    // ...
}
```

线程A对flag的写入，happens-before 线程B对flag的读取。因此，一旦线程A将flag设为true，线程B一定能立刻看到。

4. 线程启动规则

规则： Thread对象的start()方法 happens-before 于此线程中的任何一个操作。

在父线程中调用子线程的start()方法后，父线程在调用start()之前对共享变量的修改，对子线程都是可见的。

```java
int sharedVar = 42;
Thread t = new Thread(() -> {
    // 子线程开始执行时，一定能看到 sharedVar = 42
    System.out.println(sharedVar);
});
t.start();
```

5. 线程终止规则

规则： 线程中的所有操作都 happens-before 于对此线程的join()方法的返回。

当父线程调用子线程的join()并成功返回后，子线程在执行期间对共享变量的所有修改，对父线程都是可见的。

```java
int sharedVar = 0;
Thread t = new Thread(() -> {
    sharedVar = 100;
});
t.start();
t.join(); // 等待t线程结束
// join()返回后，一定能看到 sharedVar = 100
System.out.println(sharedVar);
```

6. 线程中断规则

规则： 对线程interrupt()方法的调用 happens-before 于被中断线程的代码检测到中断事件的发生。

7. 对象终结规则

规则： 一个对象的初始化完成（构造函数执行结束） happens-before 于它的finalize()方法的开始。

8. 传递性

如果操作A happens-before 操作B，且操作B happens-before 操作C，那么操作A happens-before 操作C。

> 这是最强大的一条规则，它能将前面几条规则串联起来，形成更长的因果链。

传递性的威力：一个经典的例子:我们希望通过flag变量来控制value的可见性。

```java
class VisibilityExample {
    int value = 0;
    volatile boolean flag = false;

    // 线程A执行
    public void writer() {
        value = 42;       // 1. 普通写
        flag = true;        // 2. volatile写
    }

    // 线程B执行
    public void reader() {
        if (flag) {       // 3. volatile读
            int localValue = value; // 4. 普通读
            // 此时localValue一定是42吗？
            System.out.println(localValue);
        }
    }
}
```

### 思考

如果对于一个共享变量，我不加 volatile 关键字（或其他同步措施），乱序执行和可见性问题依然会存在。

JMM分为单线程状态核多线程情况，

JMM和 Happens-Before规则和volatile、synchronized和final关键字之间的关系：

JMM是一套规范，其核心逻辑由Happens-Before原则定义。为了让程序员能够遵守这套规范，Java提供了像volatile、synchronized和final这样的具体语言特性。
---
title: "Java中断机制"  
category: "Interview"  
publishedAt: "2025-05-26"  
summary: "面试题整理"  
tags:  
  - 面试题整理
banner: /images/banner/posts/jvm/jvm-g1.png
alt: "图片替代文本"  
mathjax: false
---


# Java中断机制

首先，为了一个程序的健壮性，而是应该由线程自行停止，自己来决定自己的命运。
所以，Thread.stop suspend方法都被弃用了。
首先，要有一个核心认知：**Java 的中断机制不是强制停止线程，而是一种协作式的“通知”机制**。

## 中断的相关API之三大方法

从面试题说起：Thread类中`interrupt()`、`interrupted()` 和  `isInterrupted()` 三个方法的区别说一下。

首先，先看下相关源码方法定义：

```java
// 实例方法
public void interrupt(){}

// 静态方法
public static boolean interrupted(){}

// 实例方法
public boolean isInterrupted(){}
```

我们可以从作用对象，是否影响状态，方法类型，作用这几个方面来理解这三个方法。从而理解它们分别的**优缺点** （因为实现线程中断机制不只有这么一种，还有其他方法，理解优缺点才能提高我们的实际开发能力），用在哪，怎么用。

### 深入静态方法Thread.interrupted()

这个方法非常特殊，也是实际使用和面试过程中的一个易错点。

虽然前两种方式

源码分析：

```java
public void interrupt() {
        if (this != Thread.currentThread())
            checkAccess();

        synchronized (blockerLock) {
            Interruptible b = blocker;
            if (b != null) {
                interrupt0();           // Just to set the interrupt flag
                b.interrupt(this);
                return;
            }
        }
        interrupt0();
    }
```

可以看到，interrupt方法就是一个普通的实例方法，没有返回值。 “Just to set the interrupt flag” 仅仅是设置一个中断标志位。把当前线程的中断标志位从 False 设置为 True。

当我们调用 `interrupt()` 方法的时候，本质而言，是调用底层的 `interrupt0()` 方法。

但是有些细节需要注意：如果该线程阻塞的调用 `wait() `， `wait(long)` ，或`wait(long, int)`的方法Object类，或者在`join() `， `join(long)` ， `join(long, int) `， `sleep(long) `，或 `sleep(long, int) `，这个类的方法，那么它的中断状态将被清除，并且将收到一个`InterruptedException`。

这段Java官方描述主要描述了，Java协作式中断机制中，针对**阻塞状态线程**的核心处理逻辑。它包含了两个非常重要的、同时发生的后果。

我们来从描述中的两个关键结果来理解。

* 结果一：将收到一个`InterruptedException`
* 结果二：它的中断状态将被清除
  * 这是更底层、也更容易被忽略的一个细节，但它同样至关重要。
  * 我们知道，调用`thread.interrupt()`的本质是将被中断线程的内部“中断标志位”从`false`设置为`true`。
  * 但是，当一个阻塞的线程因为中断而被唤醒，并准备抛出`InterruptedException`时，JVM在抛出这个异常​**之前**​，会​顺手把那个刚刚被设为`true`的中断标志位，重新恢复成`false`。
  * 这可以理解为一种“事件被消费”的设计哲学。

最后，我们再来总结这段话：
当一个线程因为调用`wait()`, `sleep()`, `join()`等方法而阻塞时，如果它被中断，会发生两件事：

1. 它会**立即被唤醒**并强制性地​**抛出`InterruptedException`**​，让你必须在`catch`块里处理这个紧急通知。
2. 作为“通知已送达”的标志，它内部的中断状态（那个`boolean`标志位）会​**被自动重置为`false`**​，把如何处理后续中断状态的决定权完全交给你。

## 当前线程中中断标志位被设置为True，是不是线程就立刻停止？

通过前面的学习，我们已经知道这个答案是不会的，中断标志位被设置为`true`，仅仅是改变了线程内部的一个`boolean`状态。它本身并不会对线程的执行流程产生任何直接的、强制性的影响。

线程会不会停止，完全取决于它自己的代码逻辑是否去“理会”这个标志位。

# LockSupport

是什么？

是位于 java.util.concurrent.locks 包下的一个类。官方对它的描述是：用于创建锁和其他同步类的基本线程阻塞原语。

同样，我们先来有个感性的认识，一提到`LockSupport`，我们首先应该想到其中最重要的方法，核心中的核心：`LockSupport.park()` 和 ​`LockSupport.unpark(Thread thread)`。所有其他方法，都可以看作是这两个核心功能的变种或辅助。
其次要注意`LockSupport`没有构造方法，这也是很多工具类的特点，我们基本使用的是它定义的公共静态方法。

第二点就是“基本线程阻塞原语”，这一点理解很简单，基本上JUC初学者都会对它感到陌生，因此可以看出它是一个比较底层的线程阻塞和唤醒工具类。可以看做JUC中各种高级锁或者同步器的背后的原子级的零件。

第三点就是要感性的知道它是如何工作的，即知道它的“许可证（Permit）”模型。使用Permit的概念来实现阻塞和唤醒线程的功能，每个线程都有一个许可（Permit）。但与 Semaphore 不同的是，许可的累加上限是1。

Park 有停车的意思，我们就以专属停车位的比喻来理解它的两个方法的工作过程。

`LockSupport`的出现，很大程度上是为了替代传统的`wait/notify`机制，因为它更强大、更灵活，也更容易使用。

怎么用？

Permit许可证默认没有不能放行，所以一开始调用 park()方法当前线程就会阻塞，直到别的线程给当前的线程发放Permit，park方法才会被唤醒。

总结：`LockSupport`是一个线程阻塞工具类，所有的方法都是静态方法，可以让线程在任意位置阻塞，阻塞之后也有对应的唤醒方法。归根结底，LockSupport调用的是Unsafe中的native代码。

思考：

* 为什么可以突破 wait/notify的原由调用顺序？
* 为什么唤醒两次后阻塞两次，但最终结果还会阻塞线程？

## 其他方式

在Java中，实现线程的挂起（等待）和唤醒（通知），历史和现在主要包括三种方式。

首先来看第一种，这是Java语言诞生之初就提供的最基础的线程协作机制。它与`synchronized`关键字紧密绑定。

核心思想是：任何一个Java对象都有一个与之关联的“监视器（Monitor）”。线程通过获取这个对象的锁，来进入其监视器，然后在特定条件下调用`wait()`方法放弃锁并进入等待队列，由其他线程调用`notify()`或`notifyAll()`来唤醒。

所以工作的流程大概可以分为四步：

* ​**获取锁**​：线程A和线程B都必须先进入同一个对象的`synchronized`代码块，以获取该对象的锁。
* ​**挂起（`wait()`）**​：线程A在`synchronized`块中，发现条件不满足，调用`lockObject.wait()`。此时，线程A会​**释放`lockObject`的锁**​，并进入该对象的“等待集合（Wait Set）”中，进入阻塞状态。
* ​**唤醒（`notify()`）**​：线程B在完成某些操作后，在**同一个`synchronized`块**中，调用`lockObject.notify()`。这会从“等待集合”中唤醒**任意一个**正在等待的线程（比如线程A）。
* ​**重新竞争锁**​：被唤醒的线程A并不会立刻执行，而是会尝试**重新获取**`lockObject`的锁。只有当它成功获取到锁之后，才能从`wait()`方法处返回，继续执行。

那么这种方法有什么缺点呢？为什么框架的基石用LockSupport 不用它呢？

* ​**必须配合`synchronized`**​：使用繁琐，将线程通信和互斥锁死死地绑在一起。

### wait & notify 为什么必须配合 synchronized 使用？

首先，我们要明确 `wait()`和`notify()`方法是为了解决什么问题？为什么会出现这两个方法？

它们的出现是为了解决多线程编程下一个非常低效，浪费资源的问题---**忙等待问题**（Busy-Waiting），实现高效的线程间协作。

那么什么是忙等待？

想象一下现在我们有一个场景：

* ​消费者线程​：需要从一个共享队列里取商品，但现在队列是空的。
* ​生产者线程：负责向这个队列里生产商品。

如果​没有`wait`/`notify`机制​，消费者线程为了能第一时间拿到商品，只能不断的重复检查：

```java
// 这是“忙等待”的、错误且低效的写法
while (queue.isEmpty()) {
    // 消费者线程在这里空转，不断地问队列空不空？
    // 它没有休息，一直在占用CPU时间片，但没做任何有效工作。
}
// 直到队列不为空，才跳出循环去取商品
Product p = queue.take();
```

这种不停的空转，反复检查条件的行为，就是忙等待。极度浪费CPU资源，就像一个焦急的顾客每隔一秒就问一次服务员：“我的咖啡做好了吗”，让整个餐厅的效率都变低了。

`wait`和`notify`机制的诞生，就是为了消灭这种低效的忙等待。它提供了一套**休息-唤醒**的协作模式。

首先来看`wait()`的作用：

> 当一个线程发现它需要的条件不满足时，就可以调用 `wait()` 方法，让自己进入高效的休眠（等待）状态。

那么如何进入到这种状态呢？要做哪些事情呢？其实主要做了两件重要的事：

* 释放锁：它会立即释放当前持有的`synchronized`锁，这样其他线程（比如生产者）才能有机会进入`synchronized`代码块去改变条件。
* 挂起自身线程：它将自己放入这个锁对象的“等待集合（Wait Set）”中，不再参与CPU的调度，​不消耗任何CPU资源。

那么`notify()` 方法的作用呢？

当其他线程改变了某个条件后（比如，生产者向队列里放入了商品），它需要**通知**那些因为这个条件而进入等待状态的线程：你们等待的条件可能已经满足了，可以醒来了。

具体来说：​`notify()`：从等待集合中随机叫醒**一个**正在等待的线程。​`notifyAll()`​：叫醒等待集合中的**所有**线程。

#### 思考：为什么进入Wait Set（调用`wait()`方法）后就不消耗CPU资源了？

> 因为它从根本上改变了线程在操作系统（OS）层面上的**状态**​。

调用`wait()`会使线程从可运行（Runnable）状态，切换到等待（Waiting）状态，从而被移出操作系统的​可运行队列。

而之前讨论的Busy-Waiting 方式，即用`while`循环去不断检查条件的方式。它的线程的OS状态始终是可运行。操作系统调度器（Scheduler）看到这个线程是可运行的，就会认为它有工作要做，于是会不断地给它分配CPU时间片。

而当线程调用`wait()`时，它会向JVM和操作系统发出一个请求，使其状态从可运行（Runnable）切换为等待（Waiting）或阻塞（Blocked）。

操作系统调度器看到这个线程的状态变成了等待，就会​将它从“可运行队列”中移除​，并放入一个专门的等待集合（Wait Set）中。
被移出可运行队列后，这个线程就​失去了参与CPU时间片竞争的资格。调度器在挑选下一个要执行的线程时，根本不会考虑它，完全不占用任何CPU资源。

#### wait & notify 的异常情况 await & signal 方法的异常情况

* 将notify方法放在 wait方法的前面：程序无法执行，无法唤醒。
* wait和notify方法，必须要放在同步代码块里面，并且成对出现使用。
* await & signal 同样也要再lock/unlock里面。
* 先 signal 后 await同样也无法唤醒。

总结一下，就是这两种方法都是一种类似三角形的使用方法，LockSupport使用起来更简单一些。而且先唤醒后等待，LockSupport依旧支持。



#### sleep(long n) 和 wait(long n)的区别 【高频面试题】

首先对这两个方法有个感性的认识，它们都能让线程暂停一段时间，但设计方式有着很大的区别。

可以把​`Thread.sleep(n)`理解为让当前线程​抱着锁睡觉​。它只是单纯地让出CPU，但​不会释放任何它已经持有的锁​。​
而`Object.wait(n)`是让当前线程​放下锁去睡觉​。它不仅让出CPU，​还会释放它持有的`synchronized`监视器锁，以便其他线程可以进入。

之后，一些简单的区别，

* `sleep` 是 `Thread`类的静态方法，而`wait`是所有对象都有的方法，即 `Object` 类的方法。
* `sleep` 不需要强制和对象锁一起配合使用，但`wait`需要和 `synchronized` 一起配合使用。
* `sleep` 在睡眠的同时，不会释放对象锁，但`wait`在等待的时候会释放对象锁。（这里可自行做实验去验证）

上面谈到的都是我们可以看到的区别，再深入研究一下。它们的本质区别是什么？

* ​`sleep`的本质：是一个​**无条件的、纯粹基于时间的**线程调度请求​。它告诉OS：到时间再叫我。
* ​`wait`的本质​：是一个​**有条件的、基于对象监视器状态的**线程调度请求。它告诉OS：现在把我挂起，但别用时间当闹钟。你要听另一个`notify`系统调用的指挥，那个调用来了再叫我。

综上，`sleep()`的本质是**直接由**OS任务调度器管理的、基于时间的线程状态切换；

而`wait()`的本质，是**先由**JVM中锁对象的监视器（Monitor）逻辑进行管理（放入Wait Set、释放锁），**再由**OS任务调度器将其挂起，其唤醒​不依赖于时间，而依赖于`notify` 信号​。

> `sleep`：操作系统的​任务调度器（Scheduler）会接收到这个请求，它会找到这个线程对应的线程控制块（TCB, Thread Control Block），将其状态从可运行（Runnable）改为定时等待（Timed Waiting），并设置一个定时器。然后，调度器会将这个线程从可运行队列中移除。

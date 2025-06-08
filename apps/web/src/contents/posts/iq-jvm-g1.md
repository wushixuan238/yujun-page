---
title: "G1 GC的一些关键技术"  
category: "Interview"  
publishedAt: "2025-05-26"  
summary: "面试题整理"  
tags:  
  - 面试题整理
banner: /images/banner/posts/jvm/jvm-g1.png
alt: "图片替代文本"  
mathjax: false
---


# G1 GC的一些关键技术

G1（Garbage-First）垃圾收集器自JDK 7正式发布以来，已成为服务端Java应用的主流选择，并在JDK 9中成为默认的垃圾收集器。

相较于简单的了解其特性，更重要的是构建一个关于G1内部机制的逻辑自洽的认知体系。

---

### 一、核心设计目标&基本架构选择

在G1之前，服务端Java应用的垃圾收集主要由`Parallel Scavenge/Parallel Old`和`CMS`主导。前者追求高吞吐量，但其全停顿（Stop-The-World, STW）的回收模式在大内存环境下会导致不可接受的长时间暂停。后者通过并发标记极大地缩短了停顿时间，但其基于“标记-清除”的算法带来了两个很严重的问题：内存碎片和与之相关的、可能由并发模式失败（**Concurrent Mode Failure**）触发的、灾难性的Full GC。

G1的设计旨在融合二者的优点并**规避其缺点**，它被设计为一款面向大内存（数十乃至数百GB）服务器的垃圾收集器，其核心设计目标可概括为：

在多核、大内存的服务器环境中，提供一种能够满足可预测（允许用户通过 `-XX:MaxGCPauseMillis `参数设定）、短暂停顿时间（STW）的垃圾回收方案，避免内存碎片，同时维持较高的吞吐量。

这三大目标，尤其是第一个，成为了驱动G1所有架构设计和技术选择的“第一性原理”。

为实现“可预测停顿”，G1必须打破传统GC中回收范围与整个堆或分代大小强绑定的桎梏。G1的革命性一步：**放弃物理连续的分代，引入Region化堆布局**。

整个Java堆被划分为一组数量固定（通常是2048个）、大小相等（1MB到32MB之间）的独立区域，即**Region**。

与物理上连续的新生代和老年代不同，G1的分代是逻辑上的。每个Region在任意时刻都只属于一个分代角色：Eden、Survivor或Old。

此外，还有一类特殊的Humongous Region，用于存储大小超过Region容量一半的巨型对象。

这种设计将大规模、不可控的全堆回收问题，转化为了小规模、可控的部分区域回收问题。

GC的基本单位从整个分代缩小为单个或多个Region。这使得G1可以根据需要，自由选择一部分Region构成一个回收集合（**Collection Set, CSet**）进行回收。

通过控制CSet的大小和其中Region的复杂性，G1能够将单次GC的工作量化，从而向着用户设定的停顿时间目标靠拢。

同时，G1的回收算法基于“复制”算法。在回收CSet时，G1会将其中所有存活的对象拷贝到其他空闲的Region中，然后将CSet中的所有Region整体清空。这个过程被称为**Evacuation**（转移）。Evacuation天然地完成了内存的紧凑化整理，从而彻底避免了内存碎片的产生。

### 二、关键技术一：跨Region引用的高效追踪 - Remembered Set

Region化的架构虽然解决了回收范围的问题，但也带来了新的挑战：当回收一个Region集合（Collection Set, CSet）时，如何高效地找到所有从CSet外部指向CSet内部的引用？如果为此扫描整个堆，则Region化的优势将不复存在。

G1的解决方案是引入一种空间换时间的数据结构——Remembered Set (RSet)。

每个Region都关联一个RSet，用于记录其他Region中的对象引用本Region中对象的关系。更精确地说，RSet记录的不是对象的精确地址，而是引用来源所在的卡片（Card）的索引。

在GC时，特别是Young GC或Mixed GC，当确定了CSet后，GC线程不再需要扫描整个老年代或所有非CSet的Region。对于CSet中的每一个Region，GC线程只需遍历其RSet。RSet就像一张精确的“引路图”，告诉GC线程：“去检查Region X的第a、b、c号卡片，以及Region Y的第d、e号卡片，那里有指向我的引用。”这些被RSet指向的Card，连同线程栈、JNI引用等，共同构成了GC的根集合（Root Set）。

因此，G1 GC回收搜索复杂度就由之前的与堆相关，变成与CSet实现的复杂度相关。那么CSet实现是不是也很复杂呢？

RSet的实现相当精巧，它依赖于底层的Card Table和一套高效的异步更新机制。

**Card Table**是RSet的底层支撑。它是一个存在于本地内存（Native Memory）中的字节数组，将堆内存划分为固定大小（如512字节）的Card。当一个写操作导致了跨Region引用时，一个被称为写后屏障（Post-Write Barrier）的机制会被触发。该屏障会定位到发起引用的对象所在的Card，并将其在Card Table中标记为“脏”（Dirty）。

脏卡的后续处理是异步的。G1的并发优化线程（Concurrent Refinement Threads）会持续扫描Card Table，找到脏卡。然后，这些线程会扫描脏卡覆盖的内存区域，解析出具体的引用关系，并用这些信息去更新被引用Region的RSet。

通过RSet，G1在GC时无需扫描全堆。对于CSet中的每个Region，只需遍历其RSet，就能找到所有外部引用源。这样，扫描范围被大幅缩小，停顿时间得以有效控制。**需要注意的是**，G1的任何一次Evacuation Pause（无论是Young GC还是Mixed GC）都会全量扫描整个新生代，因此所有从新生代发出的引用都会被直接发现。故此，RSet中**无需记录任何从年轻代发出的引用**，这是一个重要的性能优化。

### 三、关键技术二：并发标记的正确性保障 - SATB


G1的混合回收（Mixed GC）模式需要一个并发标记阶段来识别老年代中的存活对象。在标记线程与应用线程并发执行时，必须解决经典的三色标记漏标问题。这一过程与CMS类似，但其正确性保障机制却截然不同。

G1采用Snapshot-At-The-Beginning (SATB)算法来保证正确性。SATB的核心思想是，在并发标记开始时，逻辑上对存活对象生成一个快照，并保证在本轮GC中，快照里的所有对象都会被认为是存活的。

为实现此目的，G1使用了写前屏障（Pre-Write Barrier）。当应用线程试图覆盖一个对象的字段引用时（`obj.field = new_ref`），写前屏障会先将该字段的**旧引用值**记录到一个线程本地的SATB标记队列中。

通过这种方式，即使后续该对象的引用路径被全部切断，由于其引用已经被SATB“备份”，在最终标记（Remark）阶段，GC线程会处理SATB队列，确保该对象不被错误回收。

SATB的代价是可能产生更多的浮动垃圾（Floating Garbage）——即在快照生成后，到GC结束前这段时间才变成垃圾的对象。这些对象会被SATB机制“豁免”，存活到下一次GC。这是G1为了换取更短、更可预测的Remark停顿而做出的权衡。


### 四、G1的回收周期与策略

G1的运作主要围绕两种GC模式：Young GC和Mixed GC。

#### 1. Young GC

当为新对象分配内存导致Eden空间不足时，Young GC被触发。这是一次完全的STW过程，其CSet包含所有Eden和Survivor Region。GC线程扫描GC Roots和所有Young Region的RSet（查找来自老年代的引用），并通过Evacuation将存活对象拷贝到新的Survivor或Old Region。

#### 2. Mixed GC周期

这是G1的核心。它并非单一事件，而是一个包含并发阶段和多次STW回收的完整周期。

* **并发标记阶段**：当堆整体使用率达到`InitiatingHeapOccupancyPercent`（IHOP）阈值时，G1启动此阶段。它由初始标记、并发标记、最终标记和清理四个步骤组成。其主要目的是识别所有Old Region的存活对象，并计算每个Region的可回收空间（即回收价值）。在清理步骤中，G1会生成一个按回收价值从高到低排序的Old Region列表。
* **混合回收阶段**：并发标记完成后，G1便掌握了老年代的“垃圾地图”。在后续的若干次GC中（通常是Young GC触发时），G1会执行Mixed GC。Mixed GC的CSet不仅包含所有Young Region，还会包含一部分Old Region。
  G1选择哪些Old Region加入CSet的过程，体现了其“Garbage-First”的精髓。在STW的初始阶段，G1会：
    1. 启用**停顿预测模型**，该模型基于历史数据预测回收不同Region的耗时。
    2. 从并发标记阶段生成的**高价值Old Region列表**顶端开始，采用贪心策略。
    3. 逐个尝试将高价值的Old Region加入CSet，并实时累加预测的停顿时间。
    4. 一旦预测的总停顿时间接近用户设定的`-XX:MaxGCPauseMillis`目标，或者触及了其他如`G1OldCSetRegionThresholdPercent`等限制，选择过程即停止。

最终，G1对这个智能选择出的CSet 执行与Young GC相同的复制/转移回收。

### 结论

G1垃圾收集器的设计是一个层层递进、逻辑严密的系统工程。它以“可预测的短暂停顿”为最高目标，通过**Region化堆布局**将问题分解；通过**RSet和Card Table**解决了部分回收带来的引用查找难题；通过**SATB**确保了并发标记的正确性；最终，通过**并发标记周期和停顿预测模型**，实现了其“Garbage-First”的核心策略——在有限的时间预算内，优先回收价值最高的区域。



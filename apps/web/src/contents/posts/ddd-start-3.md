---
title: "DDD(三)：DDD 的分层架构"  
category: "DDD"  
publishedAt: "2025-05-01"  
summary: "DDD系列"  
tags:  
  - DDD
banner: /images/banner/posts/0001-two-sum.webp 
alt: "图片替代文本"  
mathjax: false
---

# DDD入门(五)：DDD 的分层架构

近期在准备各种实习面试，因为简历上有一个使用DDD架构的项目，面试官看到使用DDD之后，几乎首先都会抛出这样一个问题：
> DDD的分层架构是怎么样的？

分层架构，也就是一种组织代码的方式嘛。由于自己手敲了这个项目，熟悉代码的一个组织方式，所以能说出四层架构：***用户接口层，应用层，领域层，基础设施层。***

但是对它为什么这样设计？还是没有一个深刻的理解。在这里先**浅显**的记录下目前自己的理解。



> 在《实现领域驱动设计》一书中，DDD 分层架构有一个重要的原则：**每层只能与位于其下方的层发生耦合。**
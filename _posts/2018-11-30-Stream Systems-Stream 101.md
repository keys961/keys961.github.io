---
layout: post
title: "Stream Systems-Stream 101"
author: "keys961"
comments: true
catalog: true
tags:
  - Stream Processing
typora-root-url: ./
---

# 1. 什么是流

## 1.1. 术语

- Stream system: 处理无界数据集的引擎
- Bounded/Unbounded data: 数据集大小是有限/无限的
- Table: 特定时间点的数据集的**整体**视图
- Stream: 随时间变化的数据集**演变的逐元素**视图 

## 1.2. Stream Processing: Beyond Batch

> Lambda Architecture: A stream system (speed layer) alongside a batch system (batch layer), with a server layer to merge the result. (流处理快速给一个估计的不准确的数据，批处理给出准确数据，合并后返回一个结果——如speed去合并batch用于实时引用，batch去合并speed提供高近似性)
>
> 难以维护

- 正确性：说到底，即每次处理都需要保证一致的存储
- 推理时间的工具：当不同事件时间偏差的数据是无限且乱序时，要能推断其时间（尤其是event time）

## 1.3. Time Domain

- Event time: 事件发生的时间
- Processing time: 事件被系统观察到的时间

会存在：

1. Processing-time lag: 处理延迟

2. Event-time skew: 距离理想Event-time的偏移（落后距离）

两个数值是相同的，本质一样，即通过2个方向看同一个事物

> 由于偏移的存在，数据处理需要依照上下文，所以有了**时间窗口**
>
> 而乱序的存在使得时间窗口内的信息**不完整**（现有系统是自己定义“完整”的概念的，会导致偏差）

# 2. Data Processing Patterns

## 2.1. 有限数据集

把混乱的数据，通过数据处理引擎（通常是传统的批处理，如MapReduce），转化成一个新的结构化的数据集

## 2.2. 无限数据集：Batch

思想：将无限数据集分成一片一片有限的数据集

### a) Fixed Windows

不断设定固定长度大小的窗口，数据进入特定的窗口，然后统一处理窗口的数据。

> 窗口内数据的完整性难以解决

### b) Sessions

设定固定长度大小的窗口，数据进入特定的窗口，然后窗口内根据session细分，然后根据session进行批处理

同一个session会分布在多个窗口内，产生split，处理时会产生高延迟

## 2.3. 无限数据集: Streaming

> 无序，且时间偏移未知

### a) 时间无关处理

所有相关的逻辑都是数据驱动的，时间是无关紧要的，如有下面的操作：

- Filtering
- Inner Join (只要观测到2个流有数据到来时就可以Join)

> Outer Join有数据完整性问题

### b) 近似算法

如近似Top-N，k-means等，不过这些大部分也是时间无关处理的例子

### c) 窗口

三种窗口分法：

- **Fixed**: 将时间窗口分成固定size，窗口首尾对齐（period = size）
- **Sliding**: 窗口的size和period是固定的，若size > period则会overlap，若size < period则只能取到数据子集
- **Session**: 根据会话分，通常用超时机制来确定会话是否结束。它size和period未知，是不对其的

**通过Processing time分割窗口**

系统只要缓存一定时间段的数据，等待窗口结束，交给下游统一处理即可

> Tuple-based windowing通过计数来分割窗口，通常也是Processing time windowing的一种方式

特点有：

- 实现简单
- 窗口完整性的判断比较直接，因为使用Processing Time，不需要考虑延迟的数据
- 若从源**观测到**的信息来推测一些信息，这是很符合条件的
- 不过数据和Event time有关系时，数据必须要保证Processing time顺序和Event time相同，才能正确处理，但这很难达到

**通过Event time分割窗口**

分割窗口，数据的时间反映了其实际发生的时间

特点有：

- 若数据和Event time有关，则通过这种方式能保证正确性（而Processing time windowing不能）
- 利于动态大小窗口的实现，如Session
- 由于Window的生命周期会变长，需要过多的数据缓冲（不过可通过持久存储介质减少缓冲大小）
- 窗口数据的完整性几乎不能判断，系统只能推测窗口是否完整（如通过Watermarks），或者在对正确性很高的领域，提供一种方法，告诉系统什么时候窗口需要被物化，以及如何随时间推移来更新这些结果
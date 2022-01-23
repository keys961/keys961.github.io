---
layout: post
title: "Stream Systems-Streams and Tables"
author: "keys961"
comments: true
catalog: true
tags:
  - Stream Processing
typora-root-url: ./
---

# 1. Stream-and-Table Basics

**Stream** $\rightarrow$ **Tables**: 更新流聚合在一起，生成表 

**Tables** $\rightarrow$ **Steam**: 观察表的变化，生成流

> 可通过数据库系统的table和append-only change-log类比

另外还有些特点：

- Tables are data **at rest**：给定某个时间点，一张表的快照给的是已有数据集的整体
- Streams are data **in motion**：随时间推进，流捕获的是数据的演变

> 以数学观点看：流是表的导数，表是流的积分

# 2. Batch Processing vs. Streams & Tables

以下面几个步骤为准：

- `MapRead`: 读数据并预处理到K-V形式

- `Map`: 重复（且/或并行）地消费K-V形式预处理过的数据， 输出0个或多个K-V形式的数据

- `MapWrite`: 将多个`Map`输出的数据合并起来（确保唯一key）并写入到临时的持久化存储中（因此是一个group-by-key-and-checkpoint操作，包含了一部分`shuffle`）

  > 即MR中`MapShuffle`：对`Map`的结果进行**分区、排序、分割**，然后将属于同一划分（分区）的输出合并在一起并写在磁盘上，最终得到一个**分区有序**（输出的键值对按分区进行排列，相同分区键值对存储在一起，每个分区里面的键值对又按键值进行有序排列）的文件

- `ReduceRead`: 消费已经保存的`shuffle`过的数据，把它预处理成标准K-V数据给`Reduce`阶段（也包含了一部分`shuffle`）

  > 即MR中`ReduceShuffle`: 主要分为复制（拉取）`Map`输出结果，排序合并以及预处理数据，生成标准的K-V数据

- `Reduce`: 重复（且/或并行）消费一个key以及其相关的value列表（因为有不同分区的合并），输出0个或多个结果值（可以和key无关）

- `ReduceWrite`: 将`Reduce`产生的值写入到存储中

> 上述的`shuffle`和MR的`Map/ReduceShuffle`不一样，这里的`shuffle`只是单纯的分区（`partition`），后面也会提到，这个不是一个Grouping操作。

## 2.1. Map as Stream/Tables

在`Map`的3个阶段，根据第1节的思想，可以认为：

- `MapRead`将Table转化成了Stream
- `Map`将Stream转化成另一个Stream
- `MapWrite`: 将Stream转化成一个新的Table

> **Grouping操作**：将流中的数据根据某个条件（如key）进行分组，不管其写入到哪里，最终一个一个数据都被留到了(rest in)一个地方，并可根据到来的数据进行累计。这符合*“更新流聚合在一起，生成表”*的概念，同样暂留的数据也有*at rest*的性质。因此，**Grouping操作将Stream转化成Table**。

## 2.2. Reduce as Streams/Tables

和2.1.一样，可以认为：

- `ReduceRead`将Table转化成了Stream
- `Reduce`将Stream转化成另一个Stream
- `ReduceWrite`: 将Stream转化成一个新的Table

## 2.3. 总结

- 关于批处理的Table和Stream转化
  - Tables被读取，可转化成Streams
  - Streams通过一些操作可转化成新的Streams，如Non-grouping操作
  - Grouping操作将Stream可转化成Tables
- Stream是in-motion形式的数据，因此它和有限/无限无关

# 3. What, Where, When and How in a Streams and Tables World

## 3.1. What: Transformation

Transformation分为两类：

- **Non-grouping**: 只是简单地接收流中的一个记录，然后产生一个对该记录转换后的一个流。例子有：filter, exploder（将大对象分解成一系列小对象）, mutators（转换，如每个除以100）

- **Grouping**: 接收流中的数据，然后将其一起进行分组（会有暂存，即*rest*），可将流转化成表。例子有：join, aggregations, list/set accumulation, change-log application, histogram creation, ML model training等

  > 假如分组的结果不是最终的结果，且该结果能被直接读到，尽量避免将其再物化到其它地方。

> 将Table转化成Stream，可称为**Ungrouping**操作，再后文描述

## 3.2. Where: Windowing

在之前，Window是Grouping操作发生的地方，即“流转化成表”发生的地方。

而Window可以看成Table的一个单元。

### a) Window Assignment

当一个记录被放到一个窗口中，在Grouping时，依照的依据可以看成是以下2个key组合而成的：

- 用户自定义的key
- 窗口的隐式的key

它不是一个Grouping操作，因为只是单纯为数据附上一个窗口值。

### b) Window Merging

作为一种生成动态的、数据驱动的窗口构建的逻辑。合并窗口是一个Grouping操作。

合并的时候，系统Grouping操作的依据不像a)一样简单组合，而是分层形式的：

- 用户自定义的key作为root
- 窗口的隐式的key作为child

当Grouping发生的时候：

- 首先根据root（即用户自定义的key）进行Grouping

- 然后根据child结点（即窗口），在之前的基础上再Grouping

  > Dataflow Model（[论文](http://www.vldb.org/pvldb/vol8/p1792-Akidau.pdf)）是这样的：
  >
  > - Assign windows，生成一个元组$(k, v, t, W)$，其中$(k, W)$作为整个元组的key
  > - 删除时间戳，转成元组$(k, v, W)$
  > - 首先根据key进行Grouping，转成$(k, [(v_1, W_1), (v_2, W_2), ...])$
  > - 接着在各自key上进行窗口合并，转成$(k, [(v_1, W), (v_2, W), ...])$，这里$W_1, W_2$可被合并为$W$
  > - 然后根据窗口再次Grouping，转成$(k, [([v_1, v_2], W),...])$
  > - 最后，展开恢复成以$(k, W)$作为整个key的元组，用于下一波处理，$(k, [v_1, v_2], t_{W_{max}}, W)$

系统需要知道所有已存在的窗口，然后要判断哪些窗口能够合并，然后**原子性**地删除就窗口并添加新的合并的窗口。

## 3.3. When: Triggers

Trigger是用于决定：什么时候数据可以送到下游。也就是说：**Trigger决定Grouping什么时候完成**。同样也即：**Trigger驱动了表向流的转换，即Ungrouping操作**。

> 流处理而言，有Early/On-time(Watermark)/Late Triggers，很熟悉
>
> 而对于批处理而言，通常只用一种Trigger: Input-complete triggers。即等到输入完成后才会触发，将数据推到下游。

> 自定义Trigger的意义：
>
> - 提供的内置Trigger的保证性不足（如`Afterwatermark`只保证在Watermark过后触发，并没有定义其延时；如`AfterCount(N)`只保证最少$N$个数据后被触发，可能输入数据很大后才被触发）
> - 批与流可以混合，其主要区别就是Trigger触发表流转换的能力

## 3.4. How: Accumulation

三种模式有各自的特点：

- Discarding mode (Delta mode): 需要扔掉窗口之前的值，或者保存之前的值并计算之后的$\Delta$值
- Accumulating mode (Value mode): 不需要其它工作，窗口当前值就是要发给下游的值
- Accumulating & retract mode: 需要保存所有之前被触发的值，并要计算retract值

这些都是在Grouping时对表进行的操作模式。

# 4. 总结: Stream和Table的关系

- 一个数据处理的Pipeline由这些东西组成：streams, tables, operations (on streams & tables)

- Tables are data **at rest**，即一个用于观察和累计数据的容器

- Streams are data **in motion**,  是表随时间变化的一个视图

- Operations有以下分类：

  - stream $\rightarrow$ stream: **Non-grouping** (element-wise) operations
  - stream $\rightarrow$ table: **Grouping** operations
  - table $\rightarrow$ stream: **Ungrouping** (triggering) operations

  - table $\rightarrow$ table: None


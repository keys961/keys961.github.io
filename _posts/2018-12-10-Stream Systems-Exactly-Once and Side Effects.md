---
layout: post
title: "Stream Systems-Exactly-Once and Side Effects"
author: "keys961"
comments: true
catalog: true
tags:
  - Stream Processing
typora-root-url: ./
---

# 1. Why Exactly-Once

**Why must at-least-once**：Pipeline中数据丢失是不可接受的，会导致计算错误，因此必须保证Pipeline中的数据一定被处理了

**Why at-least-once not enough**：At-least-once不能保证去重，而重复的数据会对结果造成不可知的影响，造成结果不准确，所以要Exactly-once（实际上最终效果可看成***幂等***）

> 因此会有Lambda Architecture出现——Stream & Batch混合
>
> 但是其正确性只能适用于可重放的数据流，而现实中不太常见
>
> 此外，Lambda Architecture还有一些问题：
>
> - 不准确：数据有较大比例数据丢失或重复
> - 不一致：流处理和批处理的数据的语义往往不同，不易区分
> - 太复杂：该架构要维护两套系统（批和流）
> - 不可预测：往往流处理得到的结果和批处理的结果不同，且流处理的结果有很强的随机性，导致其不可信
> - 延迟高：不适用于一些需要低延迟且高正确性的应用

# 2. 明确问题

## 2.1. Accuracy vs. Completeness

导致系统计算不准确的因素有很多，不过**由于延迟数据**导致的计算不准确并不在范围内，它是**完整性**问题，而**非准确性**问题。

## 2.2. 问题特征描述

当用户将自己的代码注入到Pipeline中时，往往只能保证这段代码对于某个消息而言At-least-once执行，即当错误发生时，可能被重复执行，即不能保证操作的*幂等性*。

> Pipeline中对外发送结果（非幂等），能够添加额外的操作首先将其变成幂等的

## 2.3. 问题定义

以一个例子说明：

```java
Pipeline p = Pipeline.create(props);
PCollecion perUserCounts = p.apply(Source.read())
    .apply(new KeyByUser())
    .apply(Window.into(...))
    // 1. Shuffle (before aggregation)
    .apply(Count.perKey()); // 2. Aggregation: Count per key
perUserCounts.apply(new PerUserCountSink()); // 3. Sink: Per user count    
perUserCounts.apply(Values.create())
    .apply(Count.globally()) // 4. Aggregation: Count total
    .apply(new GlobalUserCountSink()); // 5. Sink: Total count
p.run();
```

这个Pipeline有

- Shuffle (每个Stage之间都有)
- 2个Windowed aggregation（即2个Stage）
- 2个Sink用于输出结果

因此要保证Exactly-once，则有下面3个问题：

- 如何保证Shuffle阶段每个Record处理有且仅有1次
- 如何保证数据处理阶段（如做Aggregation）每个Record处理有且仅有1次
- 如何保证每次Sink都会输出准确的结果（并且处理有且仅有1次）

# 3. Ensuring Exactly-Once in Shuffle

## 3.1. RPC Exactly-Once

Shuffle即把某个范围的数据传到特定的Worker上（往往是不同的机器），因此需要使用RPC。所以问题变成了RPC exactly-once。

实现的方式如下（以Google Dataflow为例）：

- 上游实现Upstream backup，若没受到回应消息，数据会被保留并重试（但只能保证at-least-once）
- 消息回应要捎带状态信息（即成功与否，多数RPC框架都已经实现）
- 每个消息都要携带一个**全局唯一的ID**，接收端要记录哪些ID已经被处理，当消息到来时，会检查是否已经处理，以保证这个RPC调用不会重复

## 3.2. Dealing with Determinism

在Beam Model下，用户注入的代码可能会有非确定的输出（即输入相同，输出可能不同，重试的时候会出现），因而保证不了幂等性。

但是保证用户注入代码输出的确定性也是不可控的。

因此，为了保证exactly once，有下面的策略：

- Google Dataflow对Shuffle传播操作进行checkpoint记录和检查，并捎带一个唯一的ID（即3.1.所述的），在进入下一个阶段之前（被checkpoint前），这个ID要保证存储到一致性存储中，这保证每一个小步骤的确定性。

  > **重试过程中，checkpoint后的数据才会被重放**，因此用户的不确定性输出的代码不会再次执行。
  >
  > 这类似于数据库系统的事务（日志）。

- Google Dataflow使用一致性存储，防止ID被重复写到稳定存储中

## 3.3. Performance

如前2节所述，保证Shuffle传播需要:

- 发送端Upstream backup，接收端存储ID并对每个请求进行的检查是否重复
- ID生成和输出需要被checkpoint并存储到稳定存储中，以保证每个ID都是稳定的

但是这样的策略往往带来巨大性能损失，通常是损失在I/O端，因为上面的操作会带来额外的读写。

因此Google Dataflow带来几种不同的优化方法：Graph Optimization, Bloom Filter, Garbage Collection。

### a) Graph Optimization

一条Pipeline可通过流图表示。当Pipeline执行之前，这个图是可以优化/简化，减少I/O对整个Pipeline性能的损失影响。

- **Fusion**: 合并操作，将多个逻辑步骤进行合并成一个Stage，减少Stage个数，从而减少Shuffle传播次数，进而减少I/O次数
- **Partial Combining**: 对于可结合和可交换的`Combine`操作（如`count()`和`sum()`），在Shuffle之前（即传入Group By Key操作前），*预先地部分进行*这个操作，可显著减少传输的消息数量，从而减少I/O压力

### b) Bloom Filters

**Bloom Filter**: 实际上为一个很长的**二进制向量$V$**，和一系列**随机映射函数$F$**，用于检索一个元素是否在一个集合中。

**原理**：当一个元素加入集合中时，通过$K$个散列函数将元素映射到二进制向量的$V$中的$K$个点，将它们全部置为1。查询时，先通过$K$次散列得到$K$个点的位置：

- 若这些位置上的点在二进制向量$V$上全为1，则元素**很可能**存在
- 若存在一个位置上的点为0，则元素**必定**不存在

> 优点：时空效率很高；缺点：删除困难，有误识别率

在Google Dataflow中，每个Worker都有自己Bloom filter来监控ID，查询时：

- 若返回`false`，则说明没重复，不需要去查询下一级的存储
- 若返回`true`，则说明可能重复，查询下一级存储是否重复

此外，由于数据量上升带来的误报率问题，也可以：

- 对每个请求捎带时间戳，并对Bloom filter进行窗口化处理（实质上是Processing-time window，如每隔十分钟创建一个新的Bloom filter，实现常使用Ingress timestamp），查询和插入时对某个窗口的Bloom filter进行操作，减少单个Bloom filter的数据量
- 窗口化的Bloom filter可被系统垃圾回收，使系统资源的占用可控

### c) Garbage Collection

ID的存储不能无限存，因此要有垃圾回收。

可有下面几个策略：

- 发送者除了要发送一个自身的ID之外，还需要捎带一个“最小的没被确认“的ID，这些ID都必须是单调递增的。这样，接收方可以回收哪些小于”最小没被确认“的ID。
- 窗口化Bloom filter，根据请求捎带的时间戳计算Watermark（**并且这是一个Processing time watermark**），小于这个Watermark值的数据是可以回收的，因为这些ID已经被处理完（并且其提供的信息可以监测Pipeline的处理速度）

> **意外情形**：
>
> 假如由于网络缘故，如Network remnants，老的时间戳的请求在网络中卡住很长时间然后突然出现，请求中的ID在系统中已经被垃圾回收了
>
> **处理**：
>
> 在系统中，Watermark**直到请求成功应答后才能前进**，因此上述请求只要忽略即可，因为根据Watermark，这个ID已经被处理过了。

# 4. Exactly-Once in Sources

Pipeline会将源数据读入，并且通过重试机制，保证每个record被处理exactly-once。

而源数据有确定性和非确定性之分：

- 确定性：数据的顺序、位置不会变，不管读多少次。比如文件、Apache Kafka Topic等。这类数据源，系统可以自动为每个Record生成唯一ID，以保证Exactly-once。
- 非确定性：数据的顺序、位置不可预计。比如Google Pub/Sub。因此，需要我们**显式声明ID**，以保证Exactly-once，否则去重很难实现。

> 联系第3节，有了唯一ID后，就能保证Shuffle以及后续的操作是Exactly-once，因为其它的对数据本身的操作可以基于Shuffle来时间Exactly-once

# 5. Exactly-Once in Sinks

Google Dataflow的对外输出不能保证Exactly-once。因此有其它的解决方式：

- **Build-in sinks in Beam SDK**: 一个Build-in的Sinks，保证输出一定是Exactly-once的。

- **Reshuffle with side effect operations**: 通过Reshuffle和一个side effect操作保证输出是Exactly-once的，前提是side effect是幂等/确定的。(即输出操作出现了不幂等的情况，那么会触发Reshuffle，保证输入是稳定的，并执行side effect操作)

  > 输入稳定：对于某次操作，多次重试的输入是一样的

  > 不过这个操作已经不推荐了，可在side effect操作中添加`@RequiresStableInput`来保证输入的稳定性

# 6. Other Systems

## 6.1. Apache Spark

Spark的数据抽象的RDD，作为micro-batch的一个最小单位，并依靠批处理的exactly-once来保证正确性。

Spark假定所有的操作都是幂等的，并且可以沿着图中的某点重放操作链。

它提供Checkpoint原语，不过导致了RDD被物化，保证该RDD之前的不会被重放。

## 6.2. Apache Flink

Flink也保证Pipeline processing的exactly-once。

但是它周期性去计算分布式的一致性快照（对于整个Pipeline），并且是传递式的（即先从上游计算快照，然后传递到下游，最后得到整个快照，这样延迟更小）。这个快照是Lamport分布式快照的变体。

Flink使用这个快照来保证exactly-once，若任意的一个操作有错误，就会回滚到上一个快照，然后重放。

> 快照也可以作为一个类似的Checkpoint，任何不在快照内的都表示”没有完成“

局限性有：

- 假定错误是很少的
- 快照计算比较快
- Worker的分配是静态的
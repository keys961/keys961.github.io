---
layout: post
title: "Stream Systems-Watermarks"
author: "keys961"
comments: true
catalog: true
tags:
  - Stream Processing
typora-root-url: ./
---

# 1. Definition of Watermarks

## 1.1. Assumption

每条消息都捎带了一个逻辑的事件时间戳（logical event time-stamp）

> 消息进入管道，会有2种状态：
>
> - In flight: 消息没处理完毕
> - Completed: 消息处理完毕，未来的处理不需要这条消息
>
> 带上事件时间戳后，管道的消息时间戳以及对应状态的分布就可以被检测到

## 1.2. Definition

**Watermark**：它是一个单调递增的时间戳，这个时间戳表示**最老的**（即时间戳最小的）且**状态不是Completed**的消息的**逻辑事件时间戳**。

> 常常它的值可通过Processing time算出来，因此也可以看成一个函数$F(P) \rightarrow E$，这个函数是单调递增的

其拥有的特性：

- Completeness: 若Watermark已经超过某个值$T$时，其单调性可以保证$T$之前的消息都不需要处理了（因此可以推测什么时候可以关闭窗口）
- Visibility: 若消息接收且由于一些原因阻塞在管道中，不能继续处理，那么Watermark也不会增长（因此可以推测系统哪里出现了阻塞问题）

# 2. Source Watermark Creation

分为两类：Perfect（必须收集所有的数据）和Heuristic（允许遗漏延迟数据）

> 而创建的是哪一类，很大程度取决于数据源的特性

## 2.1. Perfect Watermark

**严格保证**了小于$T$的Event time消息不会被收到，不可能有延迟数据漏掉。

由于其特性，创建需要对输入有充分的了解（因此在现实分布式中，不现实）。

> 这些实例下可以创建Perfect watermark:
>
> - 入口时间戳应用：只需要监控Processing time就行了，而它很容易被监控
> - 有时序的静态大小的日志集：只要监控最小的没处理的日志的Event time，基于多个静态已知的输入分区，而这些输入分区产生的数据的Event time也是单调递增的

## 2.2. Heuristic Watermark

只是**推断**了小于$T$的Event time消息不会被收到，因此可能有延迟数据漏掉。

若对输入有更多的了解，那么启发的效果会更好，更少的延迟数据被遗漏。

> 对于Watermark的传播，若上游的是Perfect，则传播后也是Perfect；而上游的是Heuristic，则传播后也是Heuristic的。这就可以减少跟踪整个系统的输入完整性的复杂度，将问题*归结于源Watermark的创建*。

# 3. Watermark Propagation

## 3.1. Pipeline Stages

流处理中，一个输入后，会有多步的数据处理，因此一个管道会有多个Stage，管道的Watermark也会根据Stage传播。而Watermark在输入源进行创建。

对于有多个Stage的管道，每个Stage有自己的Watermark，它的值就是一个函数（输入是所有的输入和之前的Stage）。

Stage的粒度是可变的，但是不管怎样一个Stage也是有边界的，因此有：

- **Input watermark**: 输入Watermark，捕捉了所有该Stage上游的处理进度。（对于源，Input watermark是一个根据输入数据，由源指定的创建Watermark的函数）

- **Output watermark**: 输出Watermark，捕捉了当前Stage的进度，常被定义为该Stage的最小Input watermark，以及该Stage中所有*非延迟*的*活跃*消息的Event time集合。

  > ***活跃*数据可能包括缓存的但没有物化的数据、准备输出到下游的数据等等，Output watermark记录了这些数据的Event time**，这个时间戳是可以设定的，可参考3.3. *Output timestamps*。
  >
  > 此外，*延迟*数据不被考虑在内，因为Watermark是不能move backward的，且必须单调递增。

有了这2个概念，就可以计算每个Stage带来的延迟，只需将Output watermark和Input watermark相减即可。

此外每个Stage可分割成不同的Component，每个Component都影响该Stage的Output watermark。

> - 每个Component可以有一个缓冲区，缓冲活跃数据，直到某些操作完成
> - 每个Component也可以缓存自己的Watermark，来影响整个Stage的Output watermark
> - 整个Stage的Watermark是所有与**该Stage相关的缓存的**Watermark的**最小值**，如取下列值的最小值：
>   - Per-source watermark（每个源的Watermark）
>   - Per-external input watermark（每个管道外部输入的Watermark）
>   - Per-state component watermark（给每个要更新State的组件的Watermark）
>   - Per-output buffer watermark（给每个下游Stage的该Stage缓存的Watermark）

## 3.2. Watermark Propagation

对于不同的Stage而言：

- 对于某个Stage，Output watermark肯定比Input watermark大

- 对于上游的Stage和下游的Stage而言，下游的Input watermark是上游的Output watermark以及其它要输入到该Stage的Watermark的**最小值**

> **上游Output watermark是要输入到下游的，影响下游的Input watermark**

## 3.3. Output Timestamps

上游Stage的数据会在触发器触发的时候物化（比如在Watermark达到窗口的上限时），这些数据会给下游Stage处理，并**附上了一个Event time时间戳**

> 如上文所述，这个时间戳会被Output watermark记录下来，传入下游以决定Input watermark，保证上游的数据不被丢失

这个时间戳是可以指定的，可以是以下几种（都是Event time时间戳）：

- **End of the window**: 传入下游的数据的时间戳被标记为*上游窗口的上限*（当要传入下游的数据有*代表窗口边界意义*时，这是仅有的安全的方法，此外可以让下游的Input watermark更加平滑）
- **First nonlate element**: 传入下游的数据的时间戳被标记为*上游窗口第一个数据*的时间戳（可让下游的Input watermark更加保守）
- **Specific element**: 传入下游的数据的时间戳被标记为上游窗口*某个特定数据*的时间戳

> 一些需要注意的地方：
>
> - Watermark delay: 延迟受到上游Output watermark的影响，只有窗口有数据被物化了（一般而言常取`AtWatermark()`的时候），Output watermark才允许继续前进（进而影响下游的Input watermark）
>
> - Semantic differences: 不同的Output timestamp设定，下游得到的结果很可能会不同，需要按需求使用

## 3.4. Tricky Cases of Overlapping Windows

当窗口有重叠时（比如Sliding windowing），依照传统的做法，当Output timestamp取某些值的时候，会造成额外的延迟，以下就是一个例子：

> 如有2个Stage: $S_1, S_2$，3个Sliding windows: $W_1, W_2, W_3$，三个窗口全部重叠，有数据分布在这些窗口的重叠区域中，当使用*First nonlate element*时：
>
> - $S_1$的$W_1$已经完成，准备推到$S_2$的$W_1$
> - 但是$S_2$的$W_1$不能完成，因为在$S_1$下，$W_1$与$W_2, W_3$有重叠，而此时$W_2, W_3$仍在处理数据，**Output watermark并不能继续前进（即不能前进到$W_2$以后的区域，因此更不能前进到$W_1$结束）**，因此$S_2$下的Input watermark也不能继续前进
> - 因此到了最后$S_1$的$W_3$完成后，才能得到对应的Output watermark，$S_2$的$W_1, W_2, W_3$才能够完成，最后只能一起推到下游，造成延迟

所以，Apache Beam有特殊的逻辑处理这个问题，保证窗口$W_{N+1}$的Output timestamp永远大于$W_{N}$的上界

# 4. Percentile Watermarks

这类Watermark保证：当该Watermark值为$T$时，保证了Event time为$T$之前比例为$p$的数据已经处理完毕了（因此叫*Percentile*），而传统的Watermark中，$p = 100\%$.

该类Watermark的优点有：

- 适当降低比例，可以让Watermark增长更加快且更加平滑，有效降低了延迟，尤其是当窗口内数据分布出现了异常值（Outlier，离整体离得比较远）的时候
- 减少了处理数据的量，降低了物化结果的延迟

总之它是对结果物化的*延迟*和*精确性*进行协调。

# 5. Processing-Time Watermarks

只有之前的定义的Watermark，不能对以下延迟区分：

- 系统处理1小时前的数据，且没有延迟
- 系统处理实时的数据，但是卡机1小时

> 即不能区分Data delay还是System processing delay

因此引入Processing-time watermark。

**定义**：类似Event-time watermark，Processing-time watermark的值代表一个逻辑Processing-time时间戳，这个时间戳是**最老的未完成操作**的Processing-time时间戳。即保证，小于该Processing time的所有操作都已经完成了。

> 因此它可以计算消息处理延迟，通过类似前文的Input/Output watermark方式
>
> System processing带来的延迟必定带来Data delay

它是一个区分System latency和Data latency的有用的工具，并且可以在系统实现级别的任务上实现（如临时状态的GC）

# 6. Examples

## 6.1. Google Cloud Dataflow

- 对于某个Step（Stage），Dataflow（即一个Pipeline）将输入的数据进行分区（将数据shuffle到对应的`key`上，然后将`key`分成不同的区间），然后分配到不同的Worker上。一个Worker被分配到的区间在不同Stage上可能不同。
- 在Watermark传播的阶段，某个Step中，每个区间就是一个Component，Dataflow会跟踪每个区间的Watermark，然后取这些Watermark的最小值
  - 每个区间要报告自己的Watermark，否则这一个Step的Watermark不能继续
  - Watermark肯定是单调递增的，不能由于延迟数据到来回去更新Watermark

- Dataflow执行aggregation操作是通过中心化的Agent执行的，因此对于Watermark而言，系统的Watermark aggregation agent是唯一正确可信的
- 当Worker被赋上任务时，它会在这个区间维护一个持久化的租约，保证每个`key`只有一个Worker来修改它的持久状态。因此，为了保证Watermark的正确性，必须确保当该Worker仍拥有租约时才能传到Watermark aggregation agent中（因此Watermark更新需要验证租约合法性）

## 6.2. Apache Flink

Flink的Pipeline不需要像6.1.一样需要一个中心化的代理，而是通过in-band的形式来跟踪和聚合Watermark，这里用Checkpoint实现：

- 对于Source而言，会输出一个递增Checkpoint $T_{source}$，表明不会有小于该值的非延迟的数据提供出来
- 对于每个Stage的不同Component而言，会各自有一个输入的Checkpoint和一个输出的Checkpoint，代表了Input watermark和Output watermark。当上游传来的Checkpoint被消费，对于下游而言，Watermark就会被更新，给下游的Watermark checkpoint也会更新

In-band的优点：

- Watermark传播延迟降低，因为不需要中心化处理
- 中心化下，若Watermark aggregation agent挂掉则影响整个Pipeline，而In-band下，部分不可用不会造成整个Pipeline的Watermark的延迟
- 扩展性更好，因为没有中心化的限制

> Out-of-band/Centrialized的优点：
>
> - 提供单点的唯一的正确可信的数据，提高了正确性
> - 当输入需要全局信息时，中心化更加容易创建Source watermark
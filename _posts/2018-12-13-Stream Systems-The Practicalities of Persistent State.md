---
layout: post
title: "Stream Systems-The Practicalities of Persistent State"
author: "keys961"
comments: true
catalog: true
tags:
  - Stream Processing
typora-root-url: ./
---

# 1. Motivation

一个Pipeline中，Grouping操作会生成Table，而实际当中，会有需求且也有必要将这些**表**（尤其是中间状态）**保存到持久化存储**中。这是有原因的。

## 1.1. 事故（Failure）的必然性

Pipeline要永远运行下去是不现实的，肯定会因为机器、环境、代码等原因出现事故。事故出现后，需要Pipeline在合适的状态和位置下恢复，这就要在Pipeline中断前的位置保存一些持久化的数据。

一些还需要注意的：

- 对于有限数据集（如批处理），输入的数据是可以被完整重放的，那么事故发生后，可以重新处理这些输入
- 对于无限数据集（如流处理），不能重新处理输入，因此需要做persistent checkpoint，保存必要的检查点数据，以便于恢复（对于at-least-once或者exactly-once而言）
- 系统一般假定事故发生几率很低，因此会尽量少写数据到持久化存储中，并接收恢复时额外的计算时间开销
- 对于一些开销很大的Pipeline，persistent checkpoint会更多，让恢复更加有效率

总体而言无限数据和有限数据集处理在这方面的差异不大。

## 1.2. 保证正确性和效率

- 在Pipeline运行过程中持久化一些必要的中间数据（常见的是通过checkpoint的做法，持久化某个阶段的进度，用于恢复），是一个Pipeline从事故中恢复的一个保证正确性的基础
- 通过类似checkpoint的动作，持久化一些数据（记录了某个阶段的进度)，可以减少恢复时的一些动作（只需要从最近的checkpoint开始恢复即可），提高效率
- 通过类似checkpoint的动作，再特定场景下，持久化的数据可以更加少（比如进行GC）

# 2. Implicit State

> 后文讲“存什么样的表”，能让系统效率更高，
>
> 即从“持久化一切”，到“不妥协一致性下，权衡实现，并更加有效率”
>
> - Implicit State讲在高层调用隐式决定存什么，两种最常用的即Raw grouping到Incremental combining
> - Generalized State讲在底层完全自定义决定存什么，以自定义`DoFn`为例

## 2.1. Raw Grouping

最直接的Grouping操作：对数据进行原始分组——类似列表追加，每当一个新元素到来时，将其添加到对应组的列尾。

> 在Beam中，`GroupByKey`就是这种方式，输入`<K, V>`，输出`<K, Iterable<V>>`

首先，使用这个方式进行Grouping，生成的表会包含更多的信息（保留更多的原始数据）；

其次，假如用这个方式，并添加了较多的Triggers，之前Triggers的运算全部都是没用的（重复的）；

最后，由于包含更多的数据，持久化的数据会更多，并且恢复的时候，一切都要重新计算（也是之前触发的运算都是重复的）。

> 一个例子：
>
> ```java
> PCollection<KV<Team, Integer>> totals = 
>     input.apply(Window.into(...).triggering(...))
>     	.apply(
>     		MapElements
>     		.via(kv -> StreamSupport.intStream(kv.getValue().spliterator(), false)) //首先GroupByKey，生成<Team, Iterable<Integer>>表
>     		.sum() //然后求和，即进行转化，将列表转化成数字，是一个Non-grouping操作
> 	);
> ```
>
> 这里先进行Raw Grouping，生成`<Team, Iterable<Integer>>`表，这个数据量比较大，没额外的运算结果。
>
> 而上面会定义多个Trigger，每次触发都会对整个列表进行扫描，得到结果，开销大（即，之前的触发运算全是重复的）。
>
> 恢复的时候，也要对整个列表进行恢复和重新运算，之前的Trigger触发的运算而言也全是重复的。

## 2.2. Incremental Combining

Beam API中使用`CombineFn`类，包含4类操作：

- `AccumT createAccumulator()`: 创建一个累计器，代表初始值（空值）
- `AccumT addInput(AccumT, InputT)`: 给定一个输入和对应的累计器，然后将其累计起来，返回一个新的累计器
- `AccumT mergeAccumulators(Iterable<AccumT>)`: 将一系列累计器合并起来
- `OutputT extractOutput(AccumT)`: 将累计器的状态作为输出结果抽取出来

当使用Incremental combining时，往往有以下特点：

- 增量聚合操作在运行时会有*中间形式*，且捕获到的*中间进度*相比于之前使用Raw Grouping的而言更加紧凑，开销更小

- 增量聚合操作对顺序不关心，即满足交换律和结合律：

  - `combine(a, b) == combine(b, a)`
  - `combine(combine(a, b), c) == combine(a, combine(b, c))`

  因此在此基础上， 优化可以从2个方面：

  - 增量优化。缓存输入的时候不需要保持原始的时间顺序，只要数据到来，就执行合并。
  - 并行优化。可将输入任意地进一步分组，然后并行地运算，最后再将分组合并。

- 使用Incremental combining，窗口合并是很方便，只需要合并聚合值（常数时间），而Raw grouping要线性时间

- 使用Incremental combining进行Grouping操作时，操作是相对有限制的

> 一个例子：
>
> ```java
> PCollection<KV<Team, Integer>> totals = 
>     input.apply(Window.into(...).triggers(...))
>     	.apply(Sum.integersPerKey()); //这里对SUM这个Grouping操作使用Incremental combination
> ```

# 3. Generalized State

相比于第2节，我们需要更加*通用*（Generalized）的方式去持久化状态。

> 第二节是在high level进行的，本节要深入low level

而通用的方式往往会带来灵活性，包括：

- 数据结构的灵活性，可自定义要持久化的数据结构
- 读写粒度的灵活性，可调整读写的数据量和类型
- 调度数据处理的灵活性，可将特定的处理发生时间绑定到任何一个时域（Processing/Event time），在Beam中是使用timers进行调度

在Apache Beam中，可以通过自定义`DoFn`实现（它被传入`apply()`中）：

- 自定义数据结构POJO，供`DoFn`使用
- 自定义`DoFn<KV<KeyT, InputT>>`，继承它
  - 记录输入后的值状态：定义`StateSpec<State<T>>`（有`MapState`, `SetState`, `ValueState`）；记录时间状态：定义`TimerSpec`。状态用`@StateId`, `@TimerId`修饰，声明ID
  - 实现以`@ProcessElement`注解修饰的方法，参数为`ProcessContext`，用于处理每个到来的数据
  - 实现以`@OnTimer(timerId)`的方法，根据指定的timer来决定/调度什么时候处理特定的事件

> 自定义`DoFn`必然提供了上述3方面的灵活性
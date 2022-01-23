---
layout: post
title: "Stream Systems-Stream SQL"
author: "keys961"
comments: true
catalog: true
tags:
  - Stream Processing
typora-root-url: ./
---

# 1. 关于Stream SQL

## 1.1. Relational Algebra

对于关系型数据库而言，关系代数的一大特点是：闭包性（即关系是一等公民，任何通过关系代数操作的关系得到的结果也是一个关系）

而对于流处理而言，关系代数依旧有，但是关系代数闭包性难以满足，且有些语义不能满足（如支持out-of-order, strong temporal join）。

因此需要让流也成为一等公民（和表一起），对关系代数进行扩展。

所以有下面Time-varying relations的定义。

## 1.2. Time-Varying Relations

Stream SQL操作的对象不是传统的*特定时间的数据*，而是*随时间变化的数据*，即Time-varying。

**Time-Varying Relation**: 随时间变化的（传统意义上的）关系，即观察整个关系*随时间的演变*

> Classic Relation: 可将数据列（即类型）作为x轴，数据行作为y轴，是二维的
>
> Time-Varying Relation: 在传统基础上，再*添加一个维度——时间*（可以是一个范围，这个范围取决于输入的event time和Triggers），作为z轴，捕获随时间推移，不同时间上的数据快照

根据上面的描述，可以看出，当要应用关系代数到Time-varying relation的时候，只要将操作应用到其中包含的一系列的根据时间分隔的Classic relation上，最后输出的也是一系列的与时间相关的Classic relation，即最终也是Time-varying relation。因此：

- 所有的传统的关系代数，再Time-varying relation上依旧有效
- 在Time-varying relation基础上，关系代数依旧保持闭包性

## 1.3. Streams and Tables

**Tables**: 捕获了Time-varying relation随时间变化而生成的*快照*（快照是一张表）

**Streams**: 捕获了Time-varying relation上的*一连串的变化*（变化是一行一行数据），类似于数据库日志

根据Streams捕获的内容，可以很容易地构建一张Time-varying relation，**因此它也是Time-varying relation的另一种表示**（即**Stream version**）。（而1.2.定义的是**Table version**下的Time-varying relation，两者是**等价**的）

> Stream version下的Time-varying relation显得更加简洁

但是根据Time-varying relation的定义，在实际应用中，可以预见数据量会非常大，不论是Stream version还是Table version下。因此，数据会刻意地丢失：

- Table version下，通常只会取最近一个或几个版本的表，其它老版本的会被垃圾回收或者被压缩存储
- Stream version下，通常只会取一段时间内的变化，其它老版本的会被垃圾回收或者被压缩存储

总之，Streams和Tables是同一事物的两面。

# 2. Stream and Table Biases

## 2.1. The Beam Model: A Stream-Biased Approach

在Beam中，Transformation是`PTransforms`, 作用于`PCollections`并生成新的`PCollections`。

**在Beam中，`PCollections`永远是Streams**（即除了两端外，**任何操作，用户观察到的都是流**），因此它是stream-biased。

> 在整个Pipeline中，流可能被隐藏，也可能被暴露，但是表一定会被隐藏

流是一等公民，而表会被特殊对待（要么是在Pipeline两端，要么被隐藏在Grouping和Triggering操作下）：

- Sources: 通常是写死的方式来将源表触发成流，而这个Trigger往往不能自定义

- Sinks: 也常常是写死的方式来进行分组从而生成表，不过会给用户一些自定义空间（如根据某个自定义的key分组），通常这个Grouping操作是隐式定义的。

- 其它的Grouping/Ungrouping操作: 和Source & Sinks相反，提供了完整的灵活性。对于Grouping而言，可以自定义如何分组的算法；对于Ungrouping而言，会有一些限制，由于Beam是stream-biased，表不会被暴露出来给Trigger直接使用，只能在以下2个地方使用：

  - Pre-declaration: 在Pipeline生成表之前声明Trigger，它会向前（forward）传播
  - Post-declaration: 在Pipeline生成表之后声明Trigger，它会向后（backward）传播

  > Beam通常是使用Pre-declaration

总之，在Beam中，若要消费表数据，**一定需要被Trigger触发成流**才能被观察到。

## 2.2. The SQL Model: A Table-Biased Approach

和Beam Model相比，**任何的操作，用户观察到的都是表**。

> 在整个流程中，表可以被隐藏（比如临时表，缓存表），也可以被暴露，但是流一定被隐藏。

- Input tables: 输入永远是隐式被触发成流，这个流是一个有限大小的流，这和批处理处理输入是一样的（如MapReduce）

- Output tables: 要么被最后的Grouping操作，要么被隐式Grouping操作（如通过每行的ID），将流输出成表
- 其它Grouping/Ungrouping操作: 只提供Grouping的灵活性，这在`GROUP BY`, `JOIN`等操作中体现，可以自定义Grouping的算法，但是中间表转化成流是无法自定义的，是由系统隐式帮我们做的

#### **Materialized Views**

视图是一张抽象的虚拟表，可看成一个包装好的SQL查询语句。

物化视图在视图基础上，这张表是保存在存储介质上，*并会根据原表更新*。

由于这些特性，在整个流程中，当表（不论是否被隐藏）被触发成流时，会有不同：

- 传统的表触发成流，定义为`SCAN`，只是扫描表，并将数据发射出去，生成一个流，并最后给流发射一个终止的信号
- 物化视图触发成流，定义为`SCAN-AND-STREAM`，不同于`SCAN`的是，它不会声明流终止，而是触发一个对输入表的所有的后续修改的流，这个流是无限流，捕获了输入表随时间的变化。

> 因此，处理物化视图会产生特别类型的流式处理

总之，经典的SQL模型是一个table-biased模型，不管把它用于批处理还是流处理。

# 3. Looking Forward: Toward Robust Stream SQL

由于Time-varying relation的定义，直接操作Time-varying relation不太现实，因此，最终操作的实体还是2个：流和表。并且还需要工具来推理时间（特别是event time）。

不过不需要完全替换原有SQL的体系（根据Time-varying relation的特性），只需要对一些方面进行扩展：

- Stream/Table Selection
- Temporal Operator

## 3.1. Stream & Table Selection

这里

- Table: 即Time-varying relation的最新的一张表
- Stream: 即一段时间内Time-vary relation的变化记录

> 即根据1.3.，我们需要一定的数据丢失

并且`SELECT`操作的一个很好的规约是：

- 所有输入中存在流，输出就是流

  > 这里第一个指：广泛意义上Ungrouping/Triggering操作后得到的流
  >
  > 第二个流指：Time-varying relation上变化的记录

- 所有输入中全是表，输出才是表

  > 这里第一个指：广泛意义上Grouping操作后得到的表
  >
  > 第二个表指：类似于SQL查询后得到的表

## 3.2. Temporal Operator

在Time-varying relation中，event time就是数据的一列，已经被记录进去（同样可以将processing time记录进去，额外添加一列）。

- 在Table version下，TVR的会很大，但更直观
- 在Stream version下，数据量通常会更小，但是这个数据类似raw data，没进行什么转换

### a) Where: Windowing

前文知，窗口化是一个Group-by-key操作的变种（即让窗口称为数据的辅助的key，一般是层次化的）。

> 实际上也就是说，**窗口只是一条数据附带的属性**，可辅助Grouping操作

因此，在Stream SQL中，窗口化操作可通过：

- `GROUP BY`操作
- 内置显式的窗口化操作
  - 不需要手动进行窗口计算，只要提供参数即可
  - 支持更加复杂的窗口，如Sessions

### b) When: Triggers

不论是什么Trigger，只要它被触发一次，对应的TVR就会生成一个快照/变化行。

> 上面说明TVR的快照/变化行什么时候生成

#### **Per-record Triggers**

在Classic SQL中一个默认的类型，即每条数据到来后，物化一次结果。Beam API中即`Repeatedly(AfterCount(1))`。

到Stream SQL，其输出的结果：

- Stream version下，就是一个物化结果的变化列表（即`<res, window, proc_time>`元组列表，记录了每次物化结果）
- Table version下，就是生成另一个快照

#### **Watermark Triggers**

在流式处理系统中常用的，Beam API中即`AfterWatermark().withLateFirings(...)`

**在Stream SQL中，需要加入支持：`EMIT <when>`**

- 通过Watermark给出一个初始值：`EMIT WHEN WATERMARK PAST <column>`，这里`<column>`为某个窗口的结束时间戳的值
- 通过Late triggers来处理延迟的数据：再加上`AND THEN AFTER <duration>`，`<duration>`期间内，进行*Per-record Triggers*触发
- Early triggers也可以设定

因此额外的2列是要添加的的：

- **`emit_timing`**：`on-time`还是`late`, 还是其它

- **`emit_index`**：该窗口第几次发出数据

> 即`<res, window, emit_time, emit_timing, emit_index>`元组列表，记录了给定时间范围内每次物化的结果

#### **Repeated Delay Triggers**

每次准备发出数据时，延迟给定时间，然后再触发，Beam API中即`Repeatedly(UnalignedDelay(...))`

> 通过Stream SQL得到的数据也是即`<res, window, emit_time, emit_timing, emit_index>`元组列表，不过`emit_timing`没有值

#### **Data-driven Triggers**

可以通过窗口数据达到某些值时触发，在`EMIT <when>`中加入数据值相关的条件。

不过需要和`HAVING <cond>`语句权衡，有时候`EMIT <cond>`会带来一些副作用。

> 如计算窗口的和，若`EMIT score > 10`，那么窗口数据超过10后，每进来一条数据，Trigger就会物化一次发出新数据，造成不必要的性能损失和数据冗余。这时候`HAVING score > 10`比较好。

### c) How: Accumulation

默认情况下，使用的是accumulating mode。

而在其它模式下，如accumulating & retracting mode下，需要额外的一列：**`undo`**，用于记录这个变化是否是一个“撤回”。

#### **Accumulating & Retracting Mode**

当在accumulating & retracting mode下，每次触发会生成一个$<X_{acc}, Y_{diff}>$值，这在Stream SQL查询得到的是2行：

- 第一行是包含$Y_{diff}$值的一行，其中需要将`undo`列标为`true`

- 之后是包含$X_{acc}$值的一行，`undo`列不需要标记

若在某些条件下（如窗口合并），产生了多个撤回值，那么一般来说，*撤回值的行在前，累计值的行在后*。（这样从Stream SQL输出构建窗口时，老窗口会被`undo`标记删除，且不影响新窗口的创建）

#### **Discarding Mode**

因为用到的很少，且容易引起混淆和错误，它不值得直接引入Stream SQL中，系统可以在外部提供选项支持这个模式。

### d) 总结：TVR在Stream SQL查询引入的列

- `proc_time`: 该行最后被修改的时间
- `emit_timing`: 该行被输出的*时机*，相对于Watermark而言（`early`, `on-time`, `late`）
- `emit_index`: 该行第几次发出数据（一般从0计数）
- `undo`: 在accumulating & retracting mode下，标记该行是否为一个撤销变化（通常是stream-version下）

> 这里的"行"，并不是指stream-versioned TVR的一行，而是流处理系统将“流转化为表”中那个“表”的一行。在窗口下，**“行“代表某个窗口的最新的被物化的窗格值**。


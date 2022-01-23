---
layout: post
title: "Stream Systems-The What, Where, When, and How of Data Processing"
author: "keys961"
comments: true
catalog: true
tags:
  - Stream Processing
typora-root-url: ./
---

# 1. Roadmap

除了第一章的一些概念，还有其它的概念：

- **Trigger**: 触发器，一种机制，根据外部信号，声明了一个窗口的输出什么时候被物化（即提供了输出何时被发出的灵活选择方式）。此外也可以多次观测某个窗口的输出，提供条件修正计算结果（由于延迟等原因）

> 可认为是一种流控制机制，决定结果什么时候（即被触发）被物化
>
> **物化**：将数据缓存，并可对外提供

- **Watermark**: 水印，一种基于事件时间的输入完整性的标记

> 时间$X$的Watermark有：所有的Event time小于$X$的输入都被观测到了

- **Accumulation**: 累积模式，指定了同一个窗口中观察到的多个结果（可能不相关，也可能有重叠）之间的关系。

# 2. Batch Foundation

> 这些也可以应用于Stream Processing

## 2.1. 计算的结果是什么：Transformations (转换)

转换通常有3类，即：

- **Element-wise**: 一个元素转换成另一个元素
- **Grouping**: 一组类似的元素聚合成一个元素
- **Composite**:  多个元素组合成一个元素

## 2.2. 在哪里计算基于事件时间的结果：Windowing (时间窗口)

窗口可基于：Fixed, Sliding以及Session.

由于Batch input，数据有限，输入完毕，基于Event time的窗口的结果也构建完毕，从而得到每个窗口的结果。

# 3. Streaming

## 3.1. 在哪个Processing time下物化计算结果

### a) Trigger

**Trigger声明**：在哪个Processing time下，时间窗口的输出要发生，每个输出作为窗口的*窗格*（pane，不一定被物化）。其做出的决定来源于外部信号，如Watermarks progressing in the event-time domain。

**2类最常用的Trigger**：

- Repeated update: 周期触发以更新窗口的窗格数据，并物化对外提供结果，周期可以是每一个新的Record输入，也可以是一段时间
  - 以输入计，可以重复几次输入后物化一次，如`triggering(Repeatedly(AfterCount(1)))`, 即输入1个Record物化结果1次
  - 以时间计，可以是aligned也可以是unaligned
    - Aligned: 固定周期物化1次结果，如`triggering(Repeatedly(AlignedDelay(TWO_MIN)))`, 即每隔2分钟物化结果1次
    - Unaligned: 周期随收到的数据影响，以平衡负载，如`triggering(Repeatedly(UnalignedDelay(TWO_MIN)))`,即周期可能不同，*平均*周期为2分钟物化结果1次
- Completeness: 当窗口认为在某个限制条件下输入已经完整，触发器就会物化窗口的窗格，作为可提供的计算结果。（完整性依赖于窗口，而非Batch processing的输入）

### b) Watermarks

**Watermarks**: 临时的关于基于Event-time的输入完整性的标记，可用于推测该窗口基于Event-time的输入是否完整（因此可以给Completeness trigger以触发物化，如使用`triggering(AfterWatermark())`）

> Watermarks 可以看成一个函数：$F(P) \rightarrow E$
>
> - 输入：$P$ Processing time
> - 输出：$E$ Event time，认为Event time小于$E$的数据已经全部收到
> - 当$E$达到时间窗口的上限时（即达到`AfterWatermark()`条件，窗口的窗格被物化

- Perfect watermarks: 即Watermarks推测的结果表明不存在遗漏延来数据的问题，这是很难做到的，只能作为基准

- Heuristic watermarks: 启发式Watermarks，根据可用的输入来推断输入的进度（如通过速率、顺序等等），但它不完美，可能出错（如遗漏延迟数据）
  - 增长太慢：Watermark被推迟，导致系统输出和物化结果的延迟变大
  - 增长太快：增加了延迟数据被遗漏的概率，增加了计算的错误几率

### c) Early/On-Time/Late Triggers

组合使用Watermarks (Completeness triggers) 和Repeated triggers，窗口的窗格数据可以依照Watermark，分为3类:

- Early pane: 在Watermark达到时间窗口上限前的由Repeated triggers触发的窗格数据，可能有0到多个（可改善*“增长太慢”*的问题）
- On-time pane: 在Watermark达到窗口上限时有Completeness triggers触发的窗格数据，只有1个
- Late pane: 在Watermark达到时间窗口上限后的由Repeated triggers触发的窗格数据，可能有0到多个（可改善*“增长太快”*的问题，用于修正数据）

因此可以分别定义Early/On-Time/Late triggers.

### d) Allowed Lateness (何时回收关闭Window)

**Allowed lateness**: 即制定一个延迟时间$T_{diff}$，用于关闭窗口，不再更新窗口窗格物化的数据。

> 这个延迟时间一定是在Event time domain中计算的（若用Processing time，当系统延迟崩溃时，Processing time会早早过去，窗口过早关闭）

记当前Processing time为$P_{current}$，由Watermark计算出的Event time为$E_{current}$，某个窗口Event time上限为$E_{max}$，则当$E_{max} + T_{diff} \le E_{current}$时，窗口关闭。

> 1. 对于Perfect watermarks，不需要Allowed lateness
> 2. 某些特定的任务也可以不配Allowed lateness

关于c)和d)以及后面的3.2，示例如：

```java
Window.into(size)
    // 使用Watermark作为Completeness trigger
    .triggering(AfterWatermark()
                // Watermark到达前每1分钟触发一次
                .withEarlyFirings(AlignedDelay(ONE_MIN))
                // Watermark到达后每1个Record触发一次
                .withLateFirings(AfterCount(1)))
    // 指定在Event time domain中，1分钟后关闭窗口
    .withAllowedLateness(ONE_MIN)
    // .discardingFiredPanes() 使用Discarding
    // .accumulatingFiredPanes() 默认，使用Accumulating
    // .accumulatingAndRetractingFiredPanes() 使用A&R
```

## 3.2. 后续数据处理的结果如何影响前面的结果：Accumulation

触发器触发的结果在某个窗口上可能有多个，后续的结果可能影响前面的结果，这种处理叫：**Accumulation**。处理的模式有3大类：

- Discarding: 直接丢弃以前的状态（后续的窗格和之前的无关）
- Accumulating: 过去的状态被完全保留，和当前的输出一起累加形成一个新的状态（之前书中的例子就是这样处理）作为窗格
- Accumulating & Retracting: 在Accumulating基础上，单独提供一个被更正的值，即产生一个值对$<X_{acc}, Y_{diff}>$作为窗格。后面的值在一下情形下有用：
  - 下游消费者需要把不同维度的数据重新分组时
  - 使用动态窗口，进行窗口合并时

> Accumulating & Retracting中：$X_{acc} + Y_{diff}$即Discarding模式下产生的窗格值 

一个例子：

|                       | Discarding | Accumulating | Accumulating & Retracting |
| --------------------- | ---------- | ------------ | ------------------------- |
| Pane 1: input: [3]    | 3          | 3            | 3                         |
| Pane 2: input: [8, 1] | 9          | 12           | <12, -3>                  |
| Final Value           | 9          | 12           | 12                        |

# 4. Summary

上面的内容回答了下面的问题：

- *What* results are calculated - **Transformations**

- *Where* in event time are results calculated - **Windowing**
- *When* in processing time are results materialized - **Triggers & Watermarks**
- *How* do refinements of results relate - **Accumulation**


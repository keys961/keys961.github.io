---
layout: post
title: "Stream Systems-Advanced Windowing"
author: "keys961"
comments: true
catalog: true
tags:
  - Stream Processing
typora-root-url: ./
---

# 1. Processing-Time Windows

对于某些特定的用例，如监控输入的数据流（如QPS等），可以使用，但是若应用于与事件发生时间相关的例子（如用户行为等等）时，不能使用。

实现方式大致2种：

- **Trigger**: 忽略Event time，然后通过Trigger来提供Processing time上窗口的快照

  > 例子：每隔1分钟，对Processing time进行窗口切割（实际上把整个Event time域当成一个大窗口）
  >
  > ```java
  > Window.triggering(Repeatedly(AlignedDelay(ONE_MIN)))
  > ```
  >
  > 而基于Event time的切割
  >
  > ```java
  > Window.into(FixedWindows.of(ONE_MIN))
  >     .triggering(...) // Repeatedly/Watermark...
  > ```

- **Ingress time**: 将Event time赋值为数据输入时的时间，然后通过Event time windowing的方式处理

  > 例子：需要在输入源进行一步预处理，给数据的Event time赋值为Ingress time
  >
  > ```java
  > PCollection rawData = IO.read().apply(Pardo.of(() -> context.outputWithTimestamp(new Instant())));
  > ```

不过会略有不同，比如多个Stage下，每个Stage会有各自的窗口，两种实现下，值会有不同。

- Trigger：实际上把整个Event time域当成了一个大窗口，等效对Processing time做切割
- Ingress time：实际上会生成Watermark，由于使用Ingress time，这个Watermark往往很接近于Ideal watermark（当然它也是一个Perfect watermark）

不过它们都有一个问题：输入的顺序一旦变化，窗口的内容也会发生变化（而Event time windows是不会发生这个问题的，即*顺序无关*，只要不遗漏数据）

# 2. Session Windows

**Session**: 特殊的变长窗口，根据给定的不活跃的时间长度来决定这个窗口时间上界。它是*数据驱动*的，且并*不是对齐*的。

- 可以通过捎带Session ID实现

- 大多通过由一定数量的交叠的小窗口合并而成，这些小窗口只包含1个消息，长度为定义的不活跃的时间长度

  > 代码：`Window.into(Sessions.withGapDuration(TIME))`
  >
  > 当Watermark向前进行的时候，窗口初始都是小窗口。Watermark不断前进，Trigger不断物化窗口的值时（不论是Early/On-time/Late），会不断进行合并（可见[Figure 4-7](http://streamingbook.net/fig/4-7)）
  >
  > 上图中，也可以看出，Early/Late Triggers是很重要的

# 3. Custom Windowing

*以Apache Beam为例*，自定义一个窗口主要有2个方面，包括：

- **Window assignment**: 可将每个元素放入一个初始的窗口（极限下，每个元素可独享一个窗口）
- **Window merging** (Optional): 允许窗口在分组时合并，使得窗口随着时间推移而变化

## 3.1. Variation on Fixed Windows

**Assignment**: 根据元素的时间戳，窗口的大小和偏移来决定放入哪个窗口

**Merging**: 无

> 注：
>
> 下面实例中（即书上）的3个类是作为“基准”的窗口，它们是Aligned Fixed，因为使用了`Window.into(XXFixedWindows.of(TIME))`。
>
> 而实际的窗口是通过这3个类的`assignWindow()`方法，根据输入的元素来给该元素赋上窗口，这个窗口是实际处理时的窗口。

自定义Fixed Windows，通常对Assignment进行自定义

### a) Aligned Fixed Windows

作为基准，符合之前的Fixed Windows的定义。

实例代码：

```java
public class FixedWindows ... {
    private final long size;
    private final long offset;
    // 自定义Assignment
    public Collection<IntervalWindow> assignWindow(AssignContext c) {
        long start = c.timestamp() - c.timestamp().plus(size).minus(offset).mod(size);
        return Array.asList(IntervalWindow.of(new Instant(start), size));
    }
}
```

这里`start`永远会是某个`FixedWindows`的起始时间，**且作用于数据集里所有的数据**。

### b) Unaligned Fixed Windows

可以通过自定义实现非对其的Window

一种实例代码：

```java
public class UnalignedFixedWindows ... {
    private final long size;
    private final long offset;
    // 自定义Assignment
    public Collection<IntervalWindow> assignWindow(AssignContext c) {
        long shift = hash(c.element().key()) % size; //对于不同的key，可能变更了起始点，从而不对齐
        long start = shift + c.timestamp() - c.timestamp().plus(size).minus(offset).mod(size);
        return Array.asList(IntervalWindow.of(new Instant(start), size));
    }
}
```

上述实例变更了起始点，从而对于不同的`key`，窗口的位置可能不一样（但对于相同的`key`，就是Aligned），总体看来，窗口变得不对称。

### c) Per-element/key Fixed Windows

可以当每个element/key定制自己的Fixed Windows，拥有自己的长度和起始位置。可以在每个element中捎带一个自己的`windowSize`和`keyShift`，如下例子所示：

```java
//... codes omitted with size & offset
public Collection<IntervalWindow> assignWindow(AssignContext c) {
    long perKeyShift = hash(c.element().key()) % size;
    long perElementSize = c.element().windowSize();
    long start = perKeyShift + perElementSize +
        c.timestamp() - c.timestamp().plus(size).minus(offset).mod(size);
    return Array.asList(IntervalWindow.of(new Instant(start), size));
}

```

上述例子可以看成b)的拓展版，因为它可以*根据输入捎带的信息*来确定窗口的大小和位置。

> 注:
>
> **之前定义的Fixed Window**：大小固定，首尾对齐。
>
> **本小节自定义的Fixed Window**：对于某类数据而言，窗口大小固定，首尾对齐，但对于整个数据集整体，不能保证。

## 3.2. Variations on Session Windows

**Assignment:** 每个元素最初会放在一个初始的Session Window中（从元素的time-stamp开始，延伸到定义的gap duration结束）

**Merging**: 分组时，所有有效（没关闭）的窗口进行排序，之后将任何重叠的窗口合并在一起

自定义Session Windows，通常对Merging进行自定义。

### Bounded Sessions

这类Session Windows表示在之前的基础上，该窗口的还要满足一些条件（比如Event time长度，窗口内部元素个数等），让这个窗口的长度有界，否则就要割开来变成一个新Session。

通常这类会设置一个上限条件，然后再自定义Merging的时候判断条件，书中是重写了`mergeWindows()`方法（代码略）。

> 通常Session Windows的定义是无界的，若要设限，下游需要自己做分割，比较讨厌。而通过自定义Merging可以很好实现这个功能。
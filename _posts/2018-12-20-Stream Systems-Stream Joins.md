---
layout: post
title: "Stream Systems-Stream Joins"
author: "keys961"
comments: true
catalog: true
tags:
  - Stream Processing
typora-root-url: ./
---

# 1. 流支持所有的Join操作

Join操作实质上是一个Grouping操作，即将之前无关的数据聚合到一起，使其有关。而之前也知，Grouping操作是将流转化为表的操作。因此：**所有的Join操作都是流式Join**。

> 流式系统的窗口这个概念，在Stream joins中也不是必要的

> 上一章Stream SQL指出，默认情况下使用Per-record trigger，这里也一样

# 2. Unwindowed Joins

易知，其它`OUTER JOIN`基本都是`FULL OUTER JOIN`的子集，因此先看`FULL OUTER JOIN`

## 2.1. `FULL OUTER`

> `FULL OUTER JOIN`：返回左表和右表所有的行，若左表的行在右表中不匹配，或者右表的行在左表中不匹配，也会列出这些行，不匹配的缺失以`null`代替

`FULL OUTER JOIN`在TVR中的行为和Classic relation类似：

- Table version: 对每个时间切片上的快照对应的左表和右表进行`FULL OUTER JOIN`，生成一个新TVR。
- Stream version: 输出的是`JOIN`后的TVR随时间的变化（可根据Table version TVR的一系列快照得出）。注意，由于时间变化，一般都会产生一个`undo`列来反映变化的撤回。此外还需要一个`time`列，表示这一行数据什么时候被物化的。

## 2.2. `LEFT OUTER`

> `LEFT OUTER JOIN`：在`FULL OUTER JOIN`基础上，不会输出右表的行与左表不匹配的行

其操作逻辑，和`FULL OUTER JOIN`几乎一样。

## 2.3. `RIGHT OUTER`

> `LEFT OUTER JOIN`：在`FULL OUTER JOIN`基础上，不会输出左表的行与右表不匹配的行

同样，其操作逻辑，和`FULL OUTER JOIN`几乎一样。

## 2.4. `INNER`

> `INNER JOIN`: 只会输出与`JOIN`谓词匹配的行，即在`FULL OUTER JOIN`基础上，不会输出左表的行与右表不匹配的行，并且也不会输出右表的行与左表不匹配的行

同样，其操作逻辑，和`FULL OUTER JOIN`几乎一样。

## 2.5. `ANTI`

> `ANTI JOIN`: 和`INNER JOIN`行为完全相反，只会输出左表的行与右表不匹配的，以及右表的行与左表不匹配的行

同样，其操作逻辑，和`FULL OUTER JOIN`几乎一样。

## 2.6. `SEMI`

`SEMI JOIN`的动作逻辑可用以下伪码表示（实现肯定不是）：

```java
Table newTable = Tables.init(props);
for(Record outerRecord : outerTable.records()) {
    for(Record innerRecord : innerTable.records()) {
        // 只要匹配1次，就输出到新表，后面匹配的全部忽略
        if(matches(outerRecourd, innerRecord)) {
            newTable.add(join(outerRecord, innerRecord));
            // 比INNER JOIN多出来这一步
            break;
        }
    }
}
```

> 在Classic SQL中，`SEMI JOIN`会隐式应用到`EXISTS`关键字中，用于外表和内表的连接，判断是否存在

而在TVR中，通常左表即上述的外表，右表即上述的内表。其它的逻辑，和`FULL OUTER JOIN`几乎一样。

# 3. Windowed Joins

使用Windowed joins，主要受下面的好处的影响：

- 根据时间对join操作进行分区，满足一些需求
- 将join操作得到的结果和watermark的进度联系到一起

## 3.1. Fixed Windows

Windowed joins操作将“时间维度”加入到`JOIN`的谓词中。因此，用于连接的行仅限于对应窗口中的行。

> 即在`JOIN`中的谓词中，加入`AND left.window = right.window`

## 3.2. Temporal Validity

### a) Temporal Validity Windows

关系中的行有效地将时间切割成给定值有效的区域，这些区域就是temporal validity windows，即**“时间有效窗口”**。

**一堆记录到来后的行为**：

- 初始状态下，记录$r_1$携带一个初始时间有效窗口，这个初始窗口往往是$[t_{1}, min(+\infty, t_{1} + t_{validLength})]$（意义即为：这段时间内，该条数据的值有效），$t_1$可基于event time，也可基于processing time，取决于应用场景

- 下一个记录$r_2$到来，携带一个初始时间有效窗口$[t_{2}, min(+\infty, t_{2} + t_{validLength})]$，假定$t_2 > t_1$

  - 若$t_2 \le min(+\infty, t_1 + t_{validLength})$，那么会分割成2个时间有效窗口$[t_1, t_2]$, $[t_2, min(+\infty, t_2 + t_{validLength})]$。前者$r_1$有效，后者$r_2$有效
  - 若$t_2 \gt min(+\infty, t_1 + t_{validLength})$，那么依旧保持2个初始的时间有效窗口，前者$r_1$有效，后者$r_2$有效
  - 对于$t_2 < t_1$，操作原理一样

- 对于后面的$r_3, r_4, ...$而言，一样，需要根据到来的初始时间有效窗口和已知的时间有效窗口比较，进行分割

- 易知，时间有效窗口的一个非常重要的特点：**会随时间推移而收缩**

  > 因此在Stream version下的带时间有效窗口的TVR，通常由于收缩而产生`undo`行

在Stream SQL层面上，可假设使用`VALIDITY_WINDOW`来创建这个时间有效窗口，或者通过标准SQL进行3次self-join创建。

### b) Temporal Validity Joins

若要做在Temporal validity windowed join，由于窗口在变化，那么在`JOIN`谓词上，需要另外对一侧表的时间范围作限定，限定到指定的窗口上，如`JOIN ON <cond1> AND WINDOW_START(<cond2>.Window) <= r.event_time AND r.event_time < WINDOW_END(<cond2>.Window)`

此外，`JOIN`时的逻辑依旧没有变化，只是需要加上额外的限定。

#### Watermarks and Temporal Validity Joins

在Join的基础上，增加了watermarks的限定，即添加`EMIT WHEN WATERMARK PAST <column>`。

那么数据只会在watermark经过某个时间点的时候物化数据，进行`JOIN`时：

- 多个源的watermark只会取*最小值*（之前也提及到），以保证最后的结果正确性
- 生成的TVR的大小也会变小，不论是Stream version还是Table version，因为：
  - 相比于Per-record trigger，当多个数据源中只要产生一个新数据，就要物化一次，**即对于Table version TVR而言就要生成一个新快照，对于Stream version而言就有生成一行或多行（`undo`）变化记录**
  - 使用Watermark trigger，由于会取多个数据源的最小值，因此只会在过了某个时间点后才会物化，TVR需要添加的快照/变化记录就会变少
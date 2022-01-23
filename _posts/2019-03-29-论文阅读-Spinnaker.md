---
layout: post
title: "论文阅读-Spinnaker: 利用Paxos构建可扩展、一致且高可用的数据存储"
author: "keys961"
comments: true
catalog: true
tags:
  - Distributed System
  - Paper
typora-root-url: ./
---

# 0. Abstract

Spinnaker是一个为大集群（普通机器）设计的单数据中心。它通过键的范围分区，保存3个副本，读写API支持事务（强一致读，时间轴一致性）。

Spinnaker基于Paxos进行复制，读性能甚至更快，写性能只比最终一致低5%~10%。

# 1. Introduction

面对大数据量，通常方法是*分区/分片*：

- 分区管理比较麻烦（尽管有自动的解决方案）
- 为了保证线性扩展，事务不能跨节点
- ...

为了高可用，通常解决方案是*主从复制*（通常会有一个从节点是同步复制，保证高可用的同时，维持一定的一致性）。不过这有局限性，下面会细讲：

## 1.1. 主从复制的局限性以及Paxos的应用

**双节点的同步主从复制仍然会在单节点失效时不可用**（从宕机$\rightarrow$主写$\rightarrow$主复制时宕机，此时从恢复），保证正确性只能当一个节点失效时拒绝服务，但可用性太差。

**双节点的主从复制方案，两节点同时的磁盘失效也是有可能的**，在没有其它硬件的情况下，数据会丢失。

因此需要3个副本，若大多数副本可用，则服务可用，但**3副本的故障模型更加复杂**。

**Paxos族协议通常是复制3个以上副本的唯一被证明的方法**，它对$2F+1$个副本达成共识，并可接受$F$个副本失效，但实现复杂且运行低效。

## 1.2. 强一致与最终一致

**强一致性**：*所有*的副本对应用而言都相同（一致），CAP的C就是这个。

**最终一致性**：副本*最终*会一致，但中间，应用会看到不同的副本，系统需要检测并解决副本冲突。这种级别下ACID的功能基本不支持。即牺牲C保证AP。

通常情况下，P必然出现，但有的场景网络分区很少出现，因此可选择CA。

## 1.3. Spinnaker

一个实验性的数据存储，适用于单个数据中心，它是一个CA系统。

特性：

- 键值存储，键范围分区，3个副本复制
- 读写API支持事务，可选择强一致性或者时间轴一致性
- 复制采用基于Paxos的协议

> **时间轴一致性（timeline consistency）**：要求数据的所有副本以相同的顺序执行所有的更新操作，有时也叫单调写（monotonic write） 

# 2. 相关工作

## 2.1. 2PC

2PC的流程可见[这里](<https://keys961.github.io/2019/03/14/DDIA-%E4%B8%80%E8%87%B4%E6%80%A7%E4%B8%8E%E5%85%B1%E8%AF%86-%E5%88%86%E5%B8%83%E5%BC%8F%E4%BA%8B%E5%8A%A1%E4%B8%8E%E5%85%B1%E8%AF%86/>)。

缺陷很明显：

- 单点故障导致集群整个集群不可用
- 2PC的分布式事务性能太差
- 协调者失效时，集群停顿、阻塞（因此它是阻塞式协议）

## 2.2. 数据库复制

这里通常是对一个不分区的数据库复制。如Postgres-R使用GCS的可靠广播复制（可用Paxos构建），Tashkent使用协调者协调事务以提高性能（但协调者自身不能复制和容错）。

一些中间件也可以复制数据库，如Ganymed使用单主和FIFO队列来复制。但中间件不能处理一些复杂的故障场景。

## 2.3.  Dynamo, Bigtable以及PNUTS

**Dynamo**: 使用最终一致性提供可用性和分区容错，它使用向量时钟处理冲突，并使用后台的“反熵”机制（如读修复和merkle树）保证副本同步。Spinnaker不需要冲突处理，只需要Paxos保证副本同步。

**Bigtable: **提供强一致性，支持单个操作的事务。它依赖GFS保证数据和日志的一致性。尽管依赖GFS简化了设计但依旧有缺陷：

- 存储日志页到磁盘时，需要和GFS的Master进行通信，并该页的其它远程副本也必须强制写入和确认
- 没有热备份的概念，节点宕机只能重启并重放日志才能恢复

**PNUTS**：可扩展的存储，支持时间轴一致性，且支持单个操作的事务。它更关注于多数据中心的复制，复制依赖YMB（因此该组件对性能很关键），但YMB并不开源。

## 2.4. 其它系统

MS SQL Azure提供了云SQL的服务，Spinnaker的技术也可以应用到它上面。

FAWN是一个可扩展的键值存储，专注于性能低的服务器。

Spinnaker的条件PUT调用和Sinfonia的微事务很相似。

# 3. 数据模型和API

**数据模型**：

- 类似于Bigtable和PNUTS，数据被组织成**行式的**，维护到表中
- 每个表中的每一行都由一个键作为标识（类似RDBMS的主键）
- 每一行可拥有*任意数量*（不同于RDBMS的地方）的列，每一列都有对应的值和版本号

**API**：

- `get(key, colname, consistent)`，最后一个参数若为`true`则是强一致性，否则是时间轴一致性
- `put(key, colname, colval)`
- `delete(key, colname)`
- `conditionalPut(key, colname, value, v)`：当该列的版本号等于`v`时，执行`put`，否则返回错误
- `conditionalDelete(key, colname, v)`: 当该列的版本号等于`v`时，执行`delete`，否则返回错误

版本号是一个单调递增的整数，可通过`get`的结果得到。

注意，API的调用是一个单个操作的事务。

# 4. 架构

节点根据键的范围分区，并通常维护3个副本（可看出一个环，从副本在主节点后续2个节点上保存）。集群使用ZooKeeper管理。

## 4.1. 节点架构

包含这么几个模块，都是线程安全的：

- 日志和本地恢复：日志可由专用设备提供以提高性能，每个日志项都被赋予唯一的LSN，一个节点上每个群组（cohort，个人理解为一个range）独立使用自己的逻辑LSN。
- 提交队列：内存中存放和跟踪待写的记录，只有收到某个群组的大多数回应时，才能提交。
- Memtables和SSTables：写提交后，存在Memtables中，周期性刷入磁盘，存入SSTables中。而SSTables根据键和列名进行索引，加速查询。（SSTables基于Bigtable实现，会后台合并和GC的，详见LSM-Tree）
- 复制和远程恢复
- 故障检测、集群管理和Leader选举

## 4.2. ZooKeeper

它作为Spinnaker的可容错的分布式协调服务，作为一个中心角色存储元数据，并管理集群变动，用于简化Spinnaker的设计（因为可用它设计分布式锁，成员管理等）。

ZooKeeper不会在读写请求的关键路径上，只会和集群内节点进行心跳。

# 5. 复制协议

复制协议运行在每个群组（cohort）上，且类似于Paxos协议。

每个群组拥有1个Leader，2个Follower，协议分2个阶段：

- Leader选举阶段
- 投票阶段（选举好Leader后，Leader进行写入）

这里说明投票阶段，Leader选举第7节再讲。

## 5.1. 副本复制——投票

流程：

- 客户端发送请求$W$，请求路由到对应的Leader上
- Leader将请求$W$写入日志（并刷日志到磁盘，可优化为批量刷入），与此同时，将其放入提交队列中，并向Follower发送$W$的proposal请求
- Follower收到proposal请求后，将里面的$W$写入日志（并刷日志到磁盘），并将其放入提交队列，之后回应Leader
- Follower收到其中一个Follower的回应后，即可将$W$应用到memtable中，表示它已提交
- 最后Follower将结果返回给客户端

> 故障恢复在[第6节](#6. 恢复)会讲

此外，Leader后台会周期性异步给Follower发送commit message，里面会捎带一个LSN（这会被存储，以便于恢复），Follower收到后，将LSN之前的且在提交队列的请求写入memtable中。

## 5.2. 不同一致性读

**强一致性读**：永远路由到Leader

**时间一致性读**：可路由到相关的所有节点上（因此会有滞后）

## 5.3. Conditional Put

其它和put一样，只是会在操作之前，Leader会检查版本号，若不符合，直接返回错误。

# 6. 恢复

这里描述单个群组的恢复。而一个节点3个群组可并行恢复（通过分区扫描节点的日志）。

## 6.1. Follower恢复

分为2个阶段：本地恢复、追赶

### 6.1.1. 本地恢复

令`f.cmt`和`f.lst`为已提交日志LSN和最后一个日志LSN，通常`f.cmt <= f.lst`。节点可通过日志，从检查点开始，恢复到`f.cmt`。

### 6.1.2. 追赶

`f.cmt`到`f.lst`之间的不能立即恢复，因为不知道Leader是否已经提交这些记录。因此需要追赶Leader。

流程：

- Follower将`f.cmt`发给Leader
- Leader将`f.cmt`之后已提交的内容发给Follower，并拒绝外部的对该群组的写入
- 等到完全追赶后，服务才能可用

由于SSTable会压缩，Leader可能获取不到追赶的部分日志。因此每个SSTable会标记最小和最大LSN，若日志无法获取，则将对应的SSTable发给Follower。

### 6.1.3. Follower日志的逻辑截断

之前提到`f.cmt`之后的写会有二义性，不能恢复，**这可能因为Leader会宕机，新的Leader会被选举，新Leader可能会没有`f.cmt`后面的一些日志**，因此**这部分日志需要丢弃**。

然而这个基本不能实现，因为Follower会有多个群组（即Follower的日志包含不同群组），有些日志需要通过不同的Leader追赶。

解决方案是逻辑阶段，Follower存储一个skip-LSN列表，告诉节点哪些日志需要跳过（和Leader通信时就可以知道）。由于它一般很小，通常存在内存里。

## 6.2. Leader接管

新Leader选举时，**会确保它拥有旧Leader所有已提交的日志**，详细会在[第7节](#7. Leader选举)说明。

接管后，旧Leader需要恢复，执行Follower恢复流程。

此外，旧Leader已提交的日志可能在Follower中没有提交，这时候，追赶需要修改。整体算法如下：

```pseudocode
l.cmt = Leader最后已提交的LSN
l.lst = Leader最后的LSN
foreach Follower f {
    f.cmt = f最后的LSN
    send((f.cmt, l.cmt]之间的已提交写, f) // Follower会检查，并跳过已有的日志
    sendCommit(l.cmt, f)
}
等待直到至少1个Follower追赶上l.cmt
// 追赶，处理l.cmt~l.lst之间的日志
重新propose&commit (l.cmt, l.lst]的写到所有的Follower
重新开放当前群组的写
```

# 7. Leader选举

在Leader失效或Follower重启后的本地恢复时触发。选举的协议保证新Leader不会有已提交的写丢失。协议基于ZooKeeper实现。

## 7.1. ZooKeeper数据模型和API

ZooKeeper数据模型是**树形**模型（类似于文件系统），每个节点叫做`znode`，客户端可以创建和删除它。

`znode`分为*持久*和*临时*类型，后者会在创建它的客户端消失后自动删除。`znode`的标识符是随节点创建单调递增的。

此外客户端可监听某个`znode`，当节点或者节点的子节点变化时，客户端可收到通知。

## 7.2. Leader选举协议

另`r`为一个群组的key range，选举的信息会存储在`/r`下，则会有下面的算法：

```pseudocode
清除/r下的旧状态
n = 本节点
n.lst = 本结点最后的LSN
向Zookeeper添加顺序临时节点到/r/candidates下
/r/candidate/node.val = n.lst
监听/r/candidate，若大多数节点出现在/r/candidates下面后继续
选择/r/candidate下node.val最大的作为Leader
if n是Leader && /r/leader为空 {
	添加临时节点到/r/leader/下
	/r/leader/node.val = n.hostname
	执行Leader接管算法
} else {
    n读取/r/leader获取新Leader
}
```

该算法可以保证：

- 所有节点对Leader达成共识
- 新Leader拥有旧Leader已经提交的日志

第一条显然满足；

对于第二条：

- 成功提交的日志，需要强制写入日志到磁盘，大多数节点（也就是至少2个）需要做到这个
- 参与选举的节点数必须也达到大多数（也是至少2个)
- 上述2个集合必然有交集，因此选择最大的LSN节点，就能保证新Leader拥有旧Leader最后一个已提交的写入

> 群组中其它节点的未处理的写入，Leader接管会保证它们会被重新proposed

# 8. 讨论

## 8.1. 可用和持久性保证

复制因子为3时：

- 写入：需要保证2个节点存活
- 读取：
  - 强一致读：重定向到Leader，需要2个节点存活
  - 时间轴一致读：运行路由到所有节点，只需1个节点存活

通常情况下，大部分（非全部）的节点宕机，数据不会丢失；但存在一个时间窗口，Leader宕机，紧接着一个Follower宕机，数据可能丢失。

## 8.2. 多操作事务

未来可能会完成，思路是：让事务产生多个日志记录，然后提交时批量复制；恢复时，可通过Paxos维护一致性，然后本地执行undo和redo。

## 8.3. 设计取舍

优势：

- 强一致性和时间轴一致性对上层应用有用
- 基于Paxos的复制协议能让集群扩展且高度可用

缺点：

- 写入和强一致读都要经过Leader，该操作的性能、扩展性和可用性会降低（比使用最终一致性的差）

# APPENDIX

## A. Paxos协议

一个共识协议，让$2F+1$个节点达成共识，并能容忍$F$个节点的失效。对于数据$D$，达成共识时，大多数节点都有$D$存在。协议分为2个步骤：

- **1a. 提议**：若节点想让集群的$D=v$，则选择一个proposal序列号$n$，作为提议者，发送*prepare消息*到集群的所有节点上
- **1b. 承诺**：其它节点收到了prepare消息，则：
  - 若消息的proposal序列号$n$大于之前所有收到的proposal序列号，回复同意，即*promise消息*
  - 否则返回*nack消息*，表明不同意
- **2a. 接受**：提议者收到大多数promise消息，则给它们返回*accept消息*，并捎带之前的$v$和$n$。若收到的promise消息是之前的值，提议者会选择响应中最大的$n$
- **2b. 完成**：节点收到accept消息后，若节点已发送的accept消息，其对应proposal序列号大于$n$，则不响应，否则返回*ok消息*，表明该值被存储

Multi-Paxos是对Paxos的优化。

## B. Spinnaker和Multi-Paxos的不同之处

1. Spinnaker将复制、提交处理和恢复放入相同的协议框架。为了提高效率，预写日志可被这些功能共享使用；
2. Spinnaker追赶操作，它在恢复时运行，相反Multi-Paxos允许未能恢复的节点参加下一轮Paxos。后者是不允许的，因为日志丢失会导致数据不一致；
3. Spinnaker基于TCP，消息传输可靠，可用于简化复制协议，而Multi-Paxos允许在不可靠的传输协议上运行；
4. Spinnaker依赖于分布式协调服务ZooKeeper，实现修改版的Paxos协议，而ZooKeeper也构建与Paxos之上，这也被称为"Vertical Paxos"。
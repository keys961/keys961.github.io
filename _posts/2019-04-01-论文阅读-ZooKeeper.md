---
layout: post
title: "论文阅读-ZooKeeper"
author: "keys961"
comments: true
catalog: true
tags:
  - Distributed System
  - Paper
typora-root-url: ./
---

# 1. Introduction

分布式场景需要协调服务：如Leader选举、分布式锁等。而**ZooKeeper是一个*协调内核***，提供API为上层实现自己的协调原语。

ZooKeeper API是**无等待**的（非阻塞)，且与文件系统非常相似。

它提供顺序保证：

- 提供**线性化写**
  - 使用Leader**原子广播协议Zab**保证（保证多副本强一致，而多副本提供了高可用和读高性能）
  - 因此，它适用于写少读多的场景，专门对读进行优化（多副本下，读只在本地进行，不需广播）
- 保证**所有操作先进先出的客户端顺序**
  - 使用**单管道架构**实现ZooKeeper，让客户端可**异步提交**操作

它还提供：

- **watch机制**（监听）
  - 让客户端可监视到更新（从而简化客户端缓存实现）

本文主要涉及：

- **协调内核**：ZooKeeper本身实现，提供一个无等待松散一致性的协调服务
- **协调实例**：如何使用ZooKeeper构建高级协调原语
- **协调经验**：使用ZooKeeper的经验

# 2. ZooKeeper服务

**术语**：

- 客户端：使用ZooKeeper服务的客户端
- 服务端：ZooKeeper本身服务
- `znode`：ZooKeeper内存数据节点，它以层次形式组织，形成数据树
- 会话：客户端连接到ZooKeeper时，建立会话，并获取会话句柄

## 2.1. 服务总览

### 2.1.1. `znode`

ZooKeeper使用`znode`表示数据，且以树形形式表示（类似文件系统）。

`znode`分为2类：

- **普通**：客户端需要显式创建/删除这类节点
- **临时**：客户端创建这类节点后，当其会话结束后，节点自动删除

创建节点时，可指定`sequential`标志，可让节点创建的序列号单调递增，且序列号的值会添加到节点名称之后。

ZooKeeper实现watches，客户端可监听某个`znode`，然后通过回调进行通知。

### 2.1.2. 数据模型

ZooKeeper使用简化的API提供类似文件系统的数据模型，只能一次读取/写入**所有数据**或者**带有层次的键值表**（树形结构为键）。

`znode`不存储通用数据，而主要映射客户端应用的抽象（主要是协调用的元数据）

### 2.1.3. 会话

客户端连接到ZooKeeper时初始化一个会话。它有超时时间，到期后则认为客户端已关闭，会话终止。

会话中，客户端可持续观察服务端状态变化。

此外会话让客户端在ZooKeeper服务器集合中透明地从一个服务器移动到另一个服务器。

## 2.2. 客户端API

- `create(path, data, flags)`：创建`path`的`znode`节点，保存`data`，返回新的`znode`的名字。`flag`用于指明`znode`类型，也可指明是否使用顺序标志
- `delete(path, version)`：删除`path`的`znode`节点，并且版本号满足`version`
- `exists(path, watch)`：返回`path`的`znode`是否存在。`watch`可允许客户端在该节点上应用watch
- `getData(path, watch)`：获取`path`的`znode`的值，`watch`和`exists()`一样，除非`znode`不存在
- `setData(path, data, version)`：向`path`下的`znode`写入`data`，节点版本需要匹配`version`
- `getChildren(path, watch)`：返回`path`子节点的所有名字
- `sync(path)`：操作开始时，等待所有的更新都发送到客户端所连接的服务器，`path`当前是被忽略的

方法都有同步和异步的实现，对于异步，可保证回调的顺序和客户端调用的顺序一样。

## 2.3. ZooKeeper的保证

**顺序保证**：

- **线性化写**：更新操作都是线性化的，且遵守优先级
- **FIFO客户端顺序**：一个客户端的所有请求，都按照客户端发送顺序执行

这里的线性化是**异步线性化**，和传统的线性化不同，客户端可以有多个未完成的操作，因此需要保证**所有操作的执行是FIFO的顺序**，以保证更新的线性化。

由于ZooKeeper只对更新异步线性化，因此，ZooKeeper可以在每个副本上各自处理读请求，这种情况下，读不是线性化的，要保证线性化，需要调用`sync()`，以看到最新的数据。（写则必须通过Master，通过Zab协议广播）

**活性和持久化保证**：

- 大部分节点存活，则服务可用
- 若服务对于某个更新请求成功响应，只要服务（quorum数量的节点）能最终恢复，变更就能在任何数量的故障中持久化

## 2.4. 原语示例

### 2.4.1. 配置管理

将配置信息保存在`znode`中。进程读取`znode`的值，并设置`watch`为真。

当配置变化后，进程会被通知，重新读取后，再设置`watch`为真。

### 2.4.2. 信息汇合

有时候，分布式系统的最终配置不能提前知道。

因此启动时，主进程可创建一个`znode`，存储动态的配置信息（如动态调度的IP和端口），工作进程读取这个`znode`，并设置`watch`为真，若节点没值，则等待。`znode`可设置成临时节点，工作进程可通过监听来判断自己是否需要清理。

### 2.4.3. 群组关系

通过临时节点以及树形结构，可以动态管理群组成员的关系，比如服务发现。

### 2.4.4. 锁

ZooKeeper用于可实现分布式锁服务。

#### a) 简单互斥锁

一个简单的锁可通过创建`znode`节点完成：

- **上锁**：创建*临时*`znode`尝试获得锁，若创建成功则获取锁，否则监听已有的`znode`
- **解锁**：删除`znode`释放锁（此时通知等待的客户端，以获取锁）

上述锁会有2个缺点：

- 节点多时，造成羊群效应（过多客户端监听同一个`znode`，通知时造成流量尖峰，导致网络阻塞）
- 只实现了互斥锁

#### b) 无羊群效应的互斥锁

- 上锁：

  ```pseudocode
  n = create(path + “/lock-”, EPHEMERAL|SEQUENTIAL); //创建临时的顺序的znode
  2: C = getChildren(path, false); //获取path下所有节点，可看成一个锁队列
  if(n.seq == min_seq(C)) {
  	return; // n.seq是所有子节点最小的，则获取锁
  }
  p = znode in C ordered just before n; //获取C中小于n序列号的最大的节点，监听它
  if (exists(p, true)) {
     wait(event); //监听p节点移除，以再次获取锁
  }
  goto 2;
  ```

  上述监听，一个`znode`上监听的客户端数量大大减少，通知时造成的峰值可以避免。

- 解锁：

  只需删除创建的节点即可。

  ```pseudocode
  delete(node);
  ```

#### c) 读写锁

- 写锁

  ```pseudocode
  n = create(path + “/write-”, EPHEMERAL|SEQUENTIAL);
  2: C = getChildren(path, false);
  if(n.seq == min_seq(C)) {
  	return; //获得锁
  }
  p = znode in C ordered just before n;
  if(exists(p, true)) {
  	wait for event;
  }
  goto 2;
  ```

  和之前的互斥锁一样。

- 读锁

  ```pseudocode
  n = create(path + “/read-”, EPHEMERAL|SEQUENTIAL)
  C = getChildren(path, false)
  3: if (no write znodes lower than n in C) { 
  	//若C没有小于n的写锁write znode, 则能获取读锁
  	return;
  }
  p = write znode in C ordered just before n //小于n的最大写锁write znode
  if (exists(p, true)){ 
  	// 这部分可能出现羊群效应
      wait for event;
  }
  goto 3;
  ```

### 2.4.5. 双屏障

让客户端在计算的开始和结束同步，

**语义**：

- 当有足够多的进程进入屏障后，才开始执行任务；
- 当所有的进程都执行完各自的任务后，屏障才撤销。

**进入屏障**：

- 客户端监听`/barrier/ready`结点, 通过判断该结点是否存在来决定是否启动任务
- 每个任务进程进入屏障时创建一个临时节点`/barrier/process/${process_id}`，然后检查进入屏障的结点数是否达到指定的值
  - 如果达到了指定的值，就创建一个`/barrier/ready`结点
  - 否则等待客户端收到`/barrier/ready`创建的通知，以启动任务

**离开屏障**：

- 客户端监听`/barrier/process`节点，若子节点为空，离开屏障
- 任务进程完成后，删除`/barrier/process/${process_id}`节点

# 3. ZooKeeper应用

如爬虫服务FS，Katta（分布式索引），YMB（分布式发布-订阅系统）中都应用了ZooKeeper。

# 4. ZooKeeper实现

ZooKeeper的组件图如下：

![zk_comp](https://iswade.github.io/translate/image/fig04_zk_components.PNG)

副本数据库是内存数据库，为了恢复，会使用WAL，并周期性生成快照。

读取请求可落到所有的副本上，写入请求被路由到Leader上（然后通过Zab广播同步）。

## 4.1. 请求处理器

为了让事务幂等，Leader收到写请求，会计算得到写入后的状态，并将请求转化成一个包含这个新状态的事务条目。

如一个写请求`setData`，那么：

- 成功时，生成`setDataTXN`，包含新数据，新版本号以及更新时间戳
- 失败时，生成`errorTXN`

## 4.2. 原子广播

所有的写请求会路由到Leader，然后由Leader广播到Follower上（通过Zab协议）。

Zab默认使用多数服从原则，即对于$2f+1$个节点，可容忍$f$个故障。

为了高吞吐，ZooKeeper尽量保持请求处理管道是满的。

由于当前状态的改变依赖于之前的改变，Zab提供了比通常的原子广播更强的顺序保证，即：

- 保证Leader的变更广播按照发送顺序发送
- 之前的Leader的所有变更会在新Leader广播之前传到新Leader上

实现上：

- 使用TCP协议，保证了传输可靠（完整性、顺序等）以及高性能

- 使用Zab选出的Leader作为ZooKeeper的Leader

- 使用WAL来记录Zab的广播

- Zab广播消息实现exactly-once，由于事务是幂等的，且消息按顺序发送，则Zab重新广播（如恢复时）也是可以接受的

  > 实际上，ZooKeeper要求Zab重新发送从上一个快照开始时已经传送过的消息。

## 4.3. 副本数据库

ZooKeeper使用多副本提高可用性。当节点宕机，为加快恢复速度，使用快照以加速恢复，并只重新发送从该快照开始时的消息。

**Fuzzy Snapshot**：

ZooKeeper记录快照时，不锁状态，而**对树进行深搜**，扫描时将`znode`状态和元数据写入磁盘。尽管快照会包含状态变化的子集，但是由于*幂等事务*和*顺序写入*，变更可应用多次，满足exactly-once。

## 4.4. C/S交互

**写请求**：

- 将更新相关的通知发出去，并将对应的watch清空
- 写请求不会和任何请求并发进行（包括和读并发进行），严格按照顺序处理，这保证了通知的严格一致
- 通知是在各个副本的本地进行，而并非全在Leader

**读请求**：

- 请求在各个副本的本地执行（无读盘以及协商，性能很高）
- 每个读请求被赋上`zxid`，它等于最后一个服务端见到的事务

**`sync()`**：普通读请求会读到旧数据，通过`sync()`以读到最新的数据

- 异步执行，Leader挂起写入，将数据同步到Follower后，再继续下去
- 客户端只需读取后立即调用`sync()`，客户端FIFO特性以及`sync()`的全局特性，保证调用`sync()`之前的所有变更都会被读取看到

**其它**：

- 应答包含`zxid`，心跳包含最后一个`zxid`
- 客户端连接到新的服务节点，新服务节点通过检查客户端最后一个`zxid`和自己的`zxid`:
  - 若客户端的`zxid`大，不会建立会话，即客户端保证它找到的服务器包含更新的视图
- 故障探测使用超时机制
  - 若会话超时期间，没有其他服务器从客户端会话收到任何内容，则Leader确定Client存在故障，会话终止
  - 客户端会在请求中捎带心跳，并低频率发送心跳，若不能通信，则会重新连到其它服务器以重建会话
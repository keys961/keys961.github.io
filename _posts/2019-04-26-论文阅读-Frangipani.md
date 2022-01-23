---
layout: post
title: "论文阅读-Frangipani：可扩展的分布式文件系统"
author: "keys961"
comments: true
catalog: true
tags:
  - Distributed System
  - Paper
typora-root-url: ./
---

# 1. Introduction

Frangipani分布式文件系统拥有以下特性：

- 所有用户对于相同文件拥有一致的视图
- 节点可很容易地加入到系统中，不需要更改配置或中断操作
- 不需要关注下层存储，即可进行文件操作
- 不需关闭系统，就可以备份整个系统的数据，且保证一致性
- 无需操作，即可容忍并从错误（节点、网络、磁盘）中恢复

Frangipani分为2层：

- Petal存储系统：提供虚拟磁盘的抽象，并提供高可用、可容错、可扩展、易管理的特性
- Frangipani文件服务：提供文件系统服务，并使用分布式锁服务提供一致性

![layer](http://i66.tinypic.com/2lmte8j.png)

# 2. 系统结构

一种结构组织如下图：

![structure](http://i65.tinypic.com/2ptbifm.png)

## 2.1. 组件

**用户程序**通过系统调用访问该文件系统，并实现了类似页回写的功能（可通过`fsync`/`sync`刷回，但元数据不保证）。

**Frangipani服务模块**是加载到系统内核的，并通过**Petal设备驱动**访问虚拟磁盘，驱动隐藏了Petal的底层细节。文件操作会被记录到Petal服务器的日志中，以便于恢复。Frangipani服务间不需要通信，只和分布式锁服务和Petal服务通信。

**Petal服务器**组成一个集群，提供可扩展、可容错的虚拟磁盘服务。只要大部分节点没挂，且存在一个副本没有丢失，集群就可用。

**分布式锁服务**实现了分布式读写锁，它可容错，且可扩展。Frangipani使用它进行协调对虚拟磁盘的访问，并保证缓冲区缓存在多服务器上保持一致。

## 2.2. 安全性和客户端/服务端配置

上述架构图中，会有安全性问题，只能运行在可信的OS上。

而在下面架构图中，用户程序和Frangipani服务**分离**，可让系统在不可信机器上运行。只有可信的Frangipani服务才能和Petal和锁服务通信，而远程的非可信的客户端通过一个分离的网络和服务端通信，且无法直接访问Petal服务。

而两种架构中，对于Petal服务而言，其客户端（即Petal设备驱动）是不被暴露在外的。

![arch2](http://i64.tinypic.com/2cz62jm.png)

## 2.3. 存在的问题

首先日志复制可能会出现2次——一次Frangipani日志，另一次Petal日志；

其次，Frangipani无法使用磁盘位置放置数据；

最后，Frangipani会锁整个文件和目录，而不是块，锁粒度较大。

# 3. 磁盘布局

使用**大且稀疏的地址空间**（可使用$2^{64}$字节的空间）。

提供2个原语：

- `commit`：将物理空间提交给虚拟空间（仅在需要时）
- `decommit`：释放虚拟空间上的物理空间（即释放物理和虚拟空间的映射关系）

**Chunk大小为64KB**，用48位地址访问虚拟地址空间，chunk也是上面2个原语的基本单位。

**磁盘布局**如下：

- 配置参数：共1TB，实际上占用很少
- 日志：共1TB，被分割成256块，每个节点对应1块（即集群最多256个）
- allocation/free bitmap：共3TB，用于描述哪一个block是空闲的，锁服务通过锁bitmap的一个portion以独占使用，若portion空间不足，则会寻找未使用的portioin空间
- inodes：共1TB，保存了文件元数据，每个inode 512字节，总共可容纳$2^{31}$个inode
- small blocks：共128TB，每个block 4KB
- large blocks：剩下的部分，每个block 1TB

![disklayout](http://i65.tinypic.com/t5g7t0.png)

# 4. 日志与恢复

Frangipani使用**WAL记录元数据redo日志**，而用户数据不会被记录。

Petal存储了每个Frangipani server的日志。当Frangipani servre更新元数据：

- 先将日志存入内存，然后后台周期性传给Petal（保证顺序）
- 只当日志被写入Petal后，真正执行更新（更新到permanent location，会被Unix守护线程`update`周期更新）。

日志大小上限为128KB，采用循环缓冲管理，当空间满时，替换掉最老的25%日志空间（前提是日志项的更改被写入）。

当Frangipani server宕机，则通过日志恢复：

- 启动一个demon进行恢复

- 它会锁上对应日志并进行redo，完成后释放锁并清除日志

  > 其它server可以继续继续，宕机的server可以重新启动（启动时是空日志）
  >
  > 系统可容忍无限数量的Frangipani server的错误

为保证日志和恢复，在多个日志下，需要注意：

- 锁服务保证串行化，因此某一block未完成的日志项最多1个
- 只会在server获取锁并覆盖该数据区域，且它仍持有锁时，恢复才会应用，也即：不会对已经完成的日志项恢复（根据第一点）
- 保证恢复时，对应一个server的日志区域只有一个demon进行重放

# 5. 同步与缓存一致

Frangipani使用**读写锁**保证同步，若冲突，锁服务会要求持有者释放/降级。

> 读：读取数据并缓存；写：读/写数据并缓存，先写缓存，然后回写（因此释放/降级时，必须强制回写脏数据）

为了提高并发度，磁盘结构被分成多个段，每个段一个锁：

- 每个日志配有一个锁
- allocation bitmap分段，每个段配有一个锁（未分配的空间会被对应段的锁保护）
- 每个文件、目录、符号链接配有一个锁，保护inode和数据

若某些操作需要获取多个锁，则使用对锁获取操作的全局排序，以及2PL避免死锁。

对于缓存一致协议，和Echo, AFS, DCE/DFS和Sprite的客户端文件缓存使用的一致性协议类似。

> 简化版的缓存一致协议：
>
> ```
> lock server (LS) （每个文件/目录一个锁）
>   owner(lock) = WS, or nil
> workstation (WS) （Frangipani server的cache）:
>   cached files and directories: present, or not present
>   cached locks: 状态有locked-busy, locked-idle, unlocked
> workstation 规则:
>   获取锁，从Petal读/写数据，然后释放锁。
>   除非获取了锁，否则不要缓存。
> coherence protocol messages:
>   request  (WS -> LS)
>   grant (LS -> WS)
>   revoke (LS -> WS)
>   release (WS -> LS)
> ```
> 例子：
>
> ![cachecohence](http://i66.tinypic.com/20ur31c.png)

# 6. 锁服务

锁服务只需要一个很小的操作集，可有不同实现，但要保证不会造成瓶颈。

锁服务要提供**分布式的读写锁**。

> 锁获取后不需自己释放，冲突时可被自动释放

锁服务使用**租约**处理客户端错误：客户端获取锁时，获取租约，若租约过期没被续租，则认为客户端错误。

> 若因为网络错误导致租约未续租，Frangipani server会撤销所有缓存的锁和数据，若数据是脏的，则返回错误。

论文中有3个实现。

## 6.1. 实现一

实现的是**单一、中心化的锁服务**。锁状态存入易失内存中。

虽然锁服务崩溃时，Frangipani server以及其日志也包含足够的信息，但是对性能有大影响。

## 6.2. 实现二

将**锁状态写入Petal的虚拟磁盘中**，当状态改变写入Petal后才返回给客户端。

若主锁服务失效，可由备节点接管。恢复也会更透明，但是一般情况下甚至比中心化的实现更差。

## 6.3. 实现三

**分布式，可容错且可扩展的锁服务**。

它由多个锁服务节点组成，并包含一个clerk模块，和每个Frangipani server相连。

它使用**锁表**管理锁，当Frangipani FS被挂载，Frangipani server会告知clerk打开对应锁表，lock server会给clear一个“租约标识”，后续的通信都会稍带它。FS被卸载时，告知clerk关闭这个锁表。

**clerk和lock server通过异步消息通信**，包含下面种类，操作基本基于这些消息：

- `request`/`release`：从clerk发出，用于请求获取/释放锁
- `grant/revoke`：从lock server发出，用于授予/请求撤销锁

**错误检测与容错**：和Petal一样，基于节点间的心跳，并使用大部分投票决议达成共识以容忍网络分区。

**全局状态复制**：锁服务使用Paxos协议，复制全局状态信息用于容错、达成共识和恢复，信息包含：

- lock server列表
- 正在被持有的锁列表
- clerk列表，它所对应的锁表被创建但没有关闭

而锁也会被分区（分成lock group）以提高效率。

**锁的重分配**：在补偿宕掉的lock server或利用新恢复的lock server时，或者lock server加入或离开时触发，**每个锁只对应一个lock server**。分配分为2阶段：

- lock server从内部状态中移除锁
- 与相关clerk通信，重新获取锁。lock server从clerk恢复新锁的状态，并告知clerk将相关锁和相关lock server绑定

**Frangipani server崩溃时**：锁不能释放，直到恢复操作执行：

- 崩溃的Frangipani server未决定操作的日志要写入Petal
- 崩溃时，租约会到期，lock server请求clerk在另一个Frangipani server执行恢复，释放之前占用的锁（日志会被上锁，并包含了租约）

**网络分区**：

- Frangipani server之间分区：大部分节点存活即可
- Petal之间分区：大部分节点存活即可，但部分区域可能无法访问
- Lock server之间分区：大部分节点存活即可
- Frangipani server和Lock server分区：无法进行续租，触发恢复（从Petal存储的日志）
- Frangipani server和Petal分区：无法进行读写

> 最后2个分区，是不允许用户访问文件系统的，除非分区状况恢复，且文件系统重新挂载成功

> **Hazard：**
>
> 租约过期，但节点没挂（即可能由于网络问题），仍然尝试在过期后访问Petal，而Petal不检查请求是否过期和有效，从而导致：**请求会到Petal，但请求对应的节点不拥有锁（被其它节点获取）**

# 7. 服务节点的添加和移除

**Frangipani server**：

- **节点加入**：需要告诉哪个Petal虚拟磁盘可以使用，以及锁服务的位置。新节点会从锁服务获取租约（从中获取日志空间），之后即可正常运行。
- **节点移除**：直接关闭节点即可，不需回写脏数据/释放锁。若下一次需要其中一个锁时，恢复日志即可使共享磁盘进入一致状态。

而Petal的集群变动也可以透明进行，在[这里](http://citeseerx.ist.psu.edu/viewdoc/download?doi=10.1.1.591.1110&rep=rep1&type=pdf)描述。

锁服务的集群变动和Frangipani server类似。

# 8. 数据备份

Petal支持快照，以dump整个文件系统的数据，快照支持任何时候被创建。

快照**只读**，并通过**CoW**实现，并保证**crash-consistency**：快照反映了一个一致状态，当所有的Frangipani server宕机，Petal的虚拟磁盘可以被保留。

快照包含：

- 所有的日志
- 相关的数据

快照也可被挂载到系统，以在线进行快照备份，但挂载的卷必须只读。
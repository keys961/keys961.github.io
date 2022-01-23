---
layout: post
title: "BitTorrent: DHT Protocol"
author: "keys961"
comments: true
catalog: true
tags:
  - Distributed System
typora-root-url: ./
---

# 0. 前言

网址：www.bittorrent.org/beps/bep_0005.html

**BitTorrent使用DHT（分布式散列表）为torrent存储peer的关系**。这样，每个peer都成了tracker（即DHT代替了它）。协议基于Kademila网络并在UDP上实现。

> **peer**：监听一个TCP端口的客户端/服务器，实现BitTorrent协议
>
> **node**：监听一个UDP端口的客户端/服务器，实现DHT协议

DHT协议由node组成，node存储peer的位置。

BitTorrent客户端包含一个node，用于联系DHT中的其它node，从而得到peer的位置，进而通过BitTorrent协议下载。

# 1. 概述

**node特征**：

- 拥有一个随机的160位全局唯一标识符
- node距离通过唯一标识符决定，一般为`dist(A, B) = |A xor B|`
- node维护一个路由表，若其它节点距离越近，路由表越详细（知道近node信息，很少知道远node信息）

**node为torrent寻找peer**：

- 将路由表中的node标识符和torrent的infohash进行距离对比，选择最近的node 
- 询问它关于该torrent的peer信息
  - 若知道，则返回peer信息
  - 否则返回它路由表中离该torrent最近的node信息
- 最初的node一直询问，直到找不到比该torrent更近的node为止
- 客户端作为peer，插入到所有回复的node中离torrent最近的node中

**token**：查询peer的响应中会包含一个值，叫token

- 当一个node宣布它控制的peer正在下载torrent，则它必须返回token（它是对方向自己发送的最近的token）
- 被请求的node会核对token和发出请求的node地址，防止恶意的主机登记其它主机的种子
- token有时间期限，过期则失效
- 实现时，token为IP地址+secret（可视为随机数，每5分钟改变一次，因此token期限是10分钟）

# 2. 路由表

每个node维护路由表，保存**已知的好node**，表项通过向其它node通信，对方回复得到的。

> **好node**：满足下面2个条件之一的node
>
> - 曾对我们某个请求回复过（15分钟内）的
> - 曾回复过（不在15分钟内）但曾向我们发过请求(15分钟内）
>
> **可疑node**：原有的好node不满足上述条件时，变成可疑的
>
> **坏node**：系统会根据最久没联系的可疑node进行排序并发送心跳（由于使用UDP，所以心跳会重试几次），若没回复，则变成坏node

路由表保存160位空间的ID，且被划分为**桶**（包含一部分ID空间）

- 初始为1个，当桶满（如最多K=8个）则分裂成2个新桶

- 当桶内装满了好node，新node会被丢弃
- 当桶内某个node变坏，则用新node替换

每个桶会维护一个`lastchange`字段，维护新鲜度，若桶在15分钟内不变化，则会对其更新：

- 随机找一个表项ID
- 对该ID执行`find_nodes`的查找操作

启动时，node会一直尝试查询离自己更近的node（不断发送`find_node`），填充路由表，直到找不到更近的。路由表会被客户端保存到文件中。

# 3. BitTorrent协议扩展

BitTorrent协议支持peer间的UDP端口的交换，通过tracker实现。客户端通过下载torrent文件以扩展DHT路由表。

peers若支持DHT协议，则会在握手时的，置某一位为1。若peer知道对方支持DHT协议，就会发送`PORT`消息，交换UDP的端口号以及DHT本身。

# 4. Torrent文件扩展

torrent文件字典使用`nodes`关键字，值应设置成torrent创建者的路由表最近K个node地址,也可以是自己，如下所示：

```python
node = [["127.0.0.1", 6881], ["router.node", 4801], ...]
```

# 5. KRPC协议

由bencoded编码的简单RPC协议，基于UDP。

一个请求包发出去后，对应一个独立的响应包。

协议没有重发。

包含三类消息：请求、响应、错误。

> 具体可见协议[本身](http://www.bittorrent.org/beps/bep_0005.html)。

DHT协议包含4种请求：`ping`,`find_node`,`get_peers`和`announce_peer`

## 5.1. `ping`

请求包含一个参数`id`，即节点的ID。

响应包含一个参数`id`，即回复者的ID。

## 5.2. `find_node`

请求包含2个参数：

- `id`：同上
- `target`：需要查找的节点ID

响应包含2个关键字：

- `id`：同上
- `nodes`：最接近的K（如8）个node联系信息

## 5.3. `get_peers`

请求包含2个参数：

- `id`：同上
- `info_hash`：160位的torrent的infohash

响应包含3个参数：

- `id`：同上
- `values`/`nodes`：若请求的node由对应的`info_hash`的peers，则以`values`返回它们；否则包含离`info_hash`最近的K个nodes
- `token`：后面的`announce_peer`请求种需要携带

## 5.4. `announce_peers`

用于表明该节点正在某个端口下载torrent文件。

请求包含4个参数：

- `id`：同上
- `info_hash`：torrent文件的infohash
- `port`：端口号，表明peer在哪个端口下载
- `token`：5.3.中的响应值

响应只包含`id`字段。

接收者检查`token`和之前回复的是否一致，若一致，则接收者将发送者的IP地址和端口号保存在peer联系信息中。

可选参数`implied_port`，值为0或1：若非0，则`port`参数忽略，并使用发送UDP包的源端口。（在NAT下有用）
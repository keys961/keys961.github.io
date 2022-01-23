---
layout: post
title: "源码阅读-Redis Overview & 内存分配"
author: "keys961"
comments: true
catalog: true
tags:
  - Redis
typora-root-url: ./
---

这次再开一坑，看一下Redis的代码。

由于现在和组里一起做一个分布式缓存系统（虽然做出了一个1.0.0，性能也挺OK的，但是我认为离上生产还有很长的距离），所以学习一下Redis的实现也是很有必要的。

# 1. 开坑步骤

这次主要开坑的一些步骤，参考了网上一些意见，主要分为下面几个：

- 内存分配
- 数据结构：字符串、链表、字典、跳跃表、日志结构等等
- 编码结构：如整数集合、压缩列表等
- 数据类型：如对象、字符串、散列、列表、集合、有序集、日志等
- 数据库相关实现：如数据库实现、通知、RDB、AOF、发布订阅、事务等
- 客户端和服务端实现：如网络事件处理、网络连接、服务端、客户端等
- 集群实现：如复制、哨兵、集群管理等

内容很多，加上C好久没写了，所以能不能填完还是未知数。

源码版本基于5以上，目前是5.0.5。

# 2. 内存分配

内存分配的源代码分布在：`zmalloc.h`、`zmalloc.c`。

从头文件中可以看出，Redis内存分配支持多种`malloc`实现，包括`tcmalloc`,`jemalloc`, `ptmalloc`等等。

主要函数有：

- `void *zmalloc(size_t size)`
- `void *zcalloc(size_t size)`
- `void *zrealloc(void *ptr, size_t size)`
- `void zfree(void *ptr)`
- `char *zstrdup(const char *s)`

## 2.1. 内存申请

内存申请主要还是上面的前3个函数：`zmalloc/zcalloc/zrealloc`。这些函数的核心功能和标准C库的功能是一样的。

这里以`zmalloc`为例。

~~~C
void *zmalloc(size_t size) {
    void *ptr = malloc(size+PREFIX_SIZE);
    if (!ptr) zmalloc_oom_handler(size);
#ifdef HAVE_MALLOC_SIZE
    update_zmalloc_stat_alloc(zmalloc_size(ptr));
    return ptr;
#else
    *((size_t*)ptr) = size;
    update_zmalloc_stat_alloc(size+PREFIX_SIZE);
    return (char*)ptr+PREFIX_SIZE;
#endif
}
~~~

上面有2个宏：

- `PREFIX_SIZE`：若`HAVE_MALLOC_SIZE`被定义（通常情况，如使用`tcmalloc`,`jemalloc`,`ptmalloc`,`apple`），则为`0`；对某些架构是`sizeof(long long)`；其他情况下是`sizeof(size_t)`

- `HAVE_MALLOC_SIZE`：一般是有被定义的，值`1`。

所以一般而言，做下面2个事情：

- 调用`malloc`申请`size + sizeof(size_t)`大小的内存
  
  - 若申请不到，打错误日志，报OOM错误，并立刻终止进程
  
    > 具体的操作是`server.c`中的`void redisOutOfMemoryHandler(size_t allocation_size)`函数。
  
  - 这里`malloc`具体实现，取决于底层使用哪种`malloc`库，这在宏定义中有指定
- 调用`update_zmalloc_stat_alloc`宏更新统计信息

### a) `update_zmalloc_stat_alloc`宏

代码如下：

~~~C
#define update_zmalloc_stat_alloc(__n) do { \
    size_t _n = (__n); \
    if (_n&(sizeof(long)-1)) _n += sizeof(long)-(_n&(sizeof(long)-1)); \
    atomicIncr(used_memory,__n); \
} while(0)
~~~

这里看到，若申请内存不是`sizeof(long)`的整数倍，那么会强行将统计值增加到它的最小整数倍。

> 因为`malloc`能保证分配内存是**字对齐**的，其申请的实际内存大小也是**字的整数倍**（对于64位x86机器，则是8字节对齐）。
>
> 所以统计的时候，需要将数据修正到对应字长的整数倍。

然后就是原子增加统计量。这里调用`atomicIncr`宏（定义在`atomicvar.h`中），提供多种实现，Linux下使用`pthread`库的`pthread_mutex_t`进行加锁实现。

### b) `zmalloc_size`宏/函数

一般情况下（定义了`HAVE_MALLOC_SIZE`），`zmalloc_size`是一个宏，调用的是`malloc_usable_size`函数（这里以`ptmalloc`为例），返回指针对应申请的内存大小，值**整数倍于字长**（因此可能会比`malloc`参数中的大小要大）。

若没有宏定义`HAVE_MALLOC_SIZE`，那么Redis申请内存时，会额外开辟一个头，大小位`PREFIX_SIZE`，用于存放申请内存的大小：

~~~
// header(1个字长) + content(malloc的申请大小) + pad(0~7字节)
// *header = sizeof(content)
~~~

这种没定义`HAVE_MALLOC_SIZE`的情况下，返回的是整个内存的大小（`header + content + pad`）

> 同样还有一个`zmalloc_usable`宏/函数：
>
> - 一般情况下，它直接就是`zmalloc_size`，也就是库中的`malloc_usable_size`函数（`ptmalloc`）
> - 否则它返回除了`header`以外的长度（即`content + pad`）

## 2.2. 内存释放

这里是`zfree`函数。

~~~C
void zfree(void *ptr) {
#ifndef HAVE_MALLOC_SIZE
    void *realptr;
    size_t oldsize;
#endif

    if (ptr == NULL) return;
#ifdef HAVE_MALLOC_SIZE
    update_zmalloc_stat_free(zmalloc_size(ptr));
    free(ptr);
#else
    realptr = (char*)ptr-PREFIX_SIZE;
    oldsize = *((size_t*)realptr);
    update_zmalloc_stat_free(oldsize+PREFIX_SIZE);
    free(realptr);
#endif
}
~~~

很简单，就是：

- 调用`update_zmalloc_stat_free`宏，更新内存使用统计（这里是做减法）

  > 和`update_zmalloc_stat_alloc`宏操作差不多

- 调用`free`释放内存

不再详细阐述。

## 2.3. `zstrdup`

这里提供一个工具方法，用于拷贝生成一个新字符串。

~~~C
char *zstrdup(const char *s) {
    size_t l = strlen(s)+1;
    char *p = zmalloc(l);
    memcpy(p,s,l);
}
~~~

调用后，新字符串不要忘记释放。

个人不太认可这种方式（签名应该类似`strcpy_s`比较好），不过调用起来还是挺方便的。


---
layout: post
title: "论文阅读-Lock-Free Linked List Using Compare-and-Swap"
author: "keys961"
comments: true
catalog: true
tags:
  - Data Structure
  - Concurrency
  - Paper
typora-root-url: ./
---

# 1. 概述

本文讲的是无锁链表实现，基于CAS操作。CAS操作基本都知道这是什么回事，这里就不叙述了。

基于无锁CAS实现的链表要求达到：

- 操作无阻塞（non-blocking），但不需要无等待（wait-free）
- 操作线性化

# 2. 辅助节点与基本操作

## 2.1. 辅助节点与游标

辅助节点实际上就是dummy node，它只有一个`next`指针。**每个普通节点的前后都有一个辅助节点**。

当链表为空时，包含一个`first`和`last`节点，中间有一个辅助节点。图示如下：

![1.png](https://i.loli.net/2020/03/02/NYEe358mHLjJpob.png)

游标由3个指针构成：

- `target`：游标移动到的当前节点
- `pre_aux`：指向一个辅助节点
- `pre_cell`：指向一个普通节点，只用于`tryDelete`函数

当游标有`c.pre_aux.next == c.target`时，游标有效；否则无效（可能由于并发操作造成的），需要更新。

## 2.2. 遍历

遍历的时候，游标可能由于并发操作而无效，所以需要通过`update`操作来验证并使得游标有效化：

```rust
fn update(c: Cursor) {
    if c.pre_aux.next == c.target {
        return; // 有效,直接返回
    }
    let p = c.pre_aux;
    let n = safe_read(p.next); // 新的target
    release(c.target); // 删掉旧的target
    
    while n != Last && !is_normal_cell(n) {
        // 若读到的target是一个辅助节点
        // 则CAS设置这个新辅助节点
        // 并释放掉旧的辅助节点
        cas(c.pre_cell.next, p, n);
        release(p);
        p = n; // 新的辅助节点
        n = safe_read(p.next); // 重新读新的target
    }
    
    c.pre_aux = p;
    c.target = n;
}
```

而所有的遍历必须由`first`和`next`操作执行，它们都需要使用`update`操作：

```rust
fn first(c: Cursor) {
    c.pre_cell = safe_read(First);
    c.pre_aux = safe_read(First.next);
    c.target = NULL;
    update(c);
}

fn next(c: Cursor) -> bool {
    if c.target = Last {
        return false;
    }
    release(c.pre_cell);
    c.pre_cell = safe_read(c.target); // 设置pre_cell为当前节点
    release(c.pre_aux);
    c.pre_aux = safe_read(c.target.next); // 设置pre_aux为pre_cell后的辅助节点
    update(c); // 更新，以让target为下一个节点
    return true;
}
```

## 2.3. 插入

插入也是通过CAS完成的，它需要3个参数：

- `c`：插入位置游标，必须有效
- `q`：链表新项
- `a`：新的辅助节点

插入位置会在`cursor`前面。插入的最后，会将前面的辅助节点通过CAS连接到新节点上，而当插入失败时，说明当前位置出现并发写操作，`cursor`无效，所以返回失败。失败后，上层会重试这个操作，直到成功为止：

```rust
fn try_insert(c: Cursor, q: Cell, a: AuxCell) -> bool {
    write(q.next, a); // new_cell -> new_aux
    write(a.next, c.target); // new_aux -> c_cell
    return cas(c.pre_aux, c.target, q); // 原本c.pre_aux存储内容是c.target, 替换为q, 完成最后的连接
}
```

![1.png](https://i.loli.net/2020/03/02/V6lJZqcULd4KPmi.png)

## 2.4. 删除

删除操作就显得复杂了。

通常而言，只删除普通节点，会留下一个额外的辅助接点，这会导致链表变长。这可以通过`c.pre_cell`的指针来删除其前面的辅助节点。但是`c.pre_cell`可能也被删除了。所以解决方法就是**给每一个普通项加一个`back_link`字段**，当链表项被删除是，`c.pre_cell`会被拷贝到`back_link`字段，这样就可以反向找到没有被删除的前一项。

```rust
fn try_delete(c: Cursor) -> bool {
    let d = c.target; // 待删除普通项
    let n = c.target.next; // 待删除普通项后面的辅助节点
    let r = cas(c.pre_aux.next, d, n); // CAS设置前面的辅助节点连到下一个辅助节点
    if !r {
        return false;
    }
    
    write(d.back_link, c.pre_cell); // 复制back_link, 说明这一项要被删除了
    let p = c.pre_cell; // 查找有效的pre_cell
    while p.back_link != null {
        // pre_cell.back_link非空, 说明它也要被删除
        let q = safe_read(p.back_link); // 反向读取新的pre_cell
        release(p); 
        p = q;
    }
    let s = safe_read(p.next); // 读取pre_cell后面的辅助节点
    while !is_normal(n.next) {
        // n是辅助节点,若n.next不是正常节点,说明后面的节点被并发修改,需要往后找
        let q = safe_read(n.next); // 辅助节点往后移
        release(n); 
        n = q;
    }
    
    do {
        r = cas(p.next, s, n); // 利用CAS, 将pre_cell后的辅助节点跳过, 让pre_cell.next连到待删除项后面的辅助节点
        if !r {
            release(s);
            s = safe_read(p.next);
        }
    } while(!r && p.back_link == NULL && is_normal(n.next));
    release(p);
    release(s);
    release(n);
    return true;
}
```

# 3. 应用：字典

链表可用于构建很多数据结构，这里以字典为例，包含3个操作：`find`, `insert`和`delete`。

这个比较简单，首先定义从某个位置查找的函数`find`：

```rust
fn find_from(k: Key, c: Cursor) -> bool {
    while c.target != Last {
        if c.target.key == k {
            return true;
        } else if c.target.key > k {
            return false;
        }
        next(c);
    }
    return false;
}
```

基于查找，那么插入和删除就很简单了，和CAS写法差不多，需要循环直到成功才能退出：

```rust
fn insert(k: Key) {
    let c = Cursor::init();
    first(c);
    let (q, a) = (Cell::init(k), AuxCell::init());
    loop {
        let r = find_from(k, c);
        if r {
            return;
        }
        r = try_insert(c, q, a);
        if r {
            return;
        }
        update(c);
    }
}

fn delete(k: Key) {
    let c = Cursor::init();
    first(c);
    loop {
        let r = find_from(k, c);
        if !r {
            return;
        }
        r = try_delete(c);
        if r {
            return;
        }
        update(c);
    }
}
```

当然单个链表的集合是低效的，这里可以使用散列表/跳表的方式降低时间复杂度。

# 4. 内存管理

## 4.1. ABA问题

CAS是有ABA的问题：

- P1从共享内存读取A
- P1被抢占
- P2把A改成B，然后又改成A
- P1继续执行，CAS成功，但是会由于hidden modification造成结果错误

> 一个很生动的漫画说明的ABA问题：https://blog.csdn.net/bjweimengshu/article/details/79000506;
>
> Wiki上说的更清楚：https://en.wikipedia.org/wiki/ABA_problem

ABA问题有很多方法解决：

- 一种是2-word CAS，即给地址再赋上一个tag，每次指针改变时，tag递增，但是这个方法大多数架构不支持；
- 使用Load-Locked和Store-Conditional原语，但有一定的限制，如不能在这两条指令之间读取内存，限制算法的实现；
- Harzard Pointer/RCU

而上面说的利用辅助接点的CAS方法，指针不会变回之前的值，只可能在回收旧链表项时有可能出现ABA问题，所以禁止旧项回收，那么上述算法是解决ABA问题的。

不过回收旧链表项是一个好优化，这里使用引用计数+链表项回收法解决，即给每一个链表项增加2个字段：

- `refct`：引用计数
- `claim`：回收标记，若为1，说明该项已被回收，链表项会回收到一个free-list里

读取的时候，增加引用计数：

```rust
fn safe_read(p: Pointer) -> Pointer {
    loop {
        let q = read(p);
        if q == NULL {
            return NULL;
        }
        increment(q.refct);
        if (q = read(p)) != NULL {
            return q;
        } else {
            release(q);
        }
    }
}
```

释放时，减少引用计数：

```rust
fn release(p: Pointer) {
    let c = get_and_increment(p.refct, -1);
    if c > 1 {
        return;
    }
    c = test_and_set(p.claim); // 给p.claim写1,返回旧值
    if c == 1 {
    	return;
    }
    reclaim(p); // 旧值是0,需要回收这个项
}
```

## 4.2. 内存管理

上面已经提及了free-list，那么基于此，就有`alloc`和`reclaim`操作，如下所示：

```rust
fn alloc() -> Pointer {
    loop {
        let q = safe_read(free_list);
        if q == NULL {
            return NULL;
        }
        let r = cas(free_list, q, q.next); // 弹出free list头
        if !r {
            release(q);
        } else {
            break;
        }
    }
    write(q.claim, 0); // 置claim为0
    return q;
}

fn reclaim(p: Pointer) {
    loop {
        let q = free_list;
        write(p.next, q); // 添加到头上
        let r = cas(free_list, q, p);
        if r {
            return;
        }
    }
}
```

上面的内存管理也是无锁的，加上之前的算法也是无锁的，所以整个算法也是无锁。
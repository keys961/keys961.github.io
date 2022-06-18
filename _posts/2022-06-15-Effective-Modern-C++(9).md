---
layout: post
title: "Effective Modern C++(9): 并发"
author: "keys961"
comments: true
catalog: true
tags:
  - C++
---

# 1. 优先使用基于任务的编程而非基于线程的编程

这里的意思是，优先使用`std::async()`，而非使用`std::thread`，来创建异步的任务。

因为大部分情况下，我们只是简单的执行异步任务罢了。

`std::async()`的优点：

- 代码简单，能自然获取异步任务结果或者异常

- 异步任务的调度交给了标准库来调度，避免手动管理线程

只有在下面情况下，建议直接使用`std::thread`：

- 需要直接访问线程的API

- 需要且能够优化线程的使用

- 需要实现超越线程API的功能

# 2. 若有异步任务需要，必须指定`std::launch::async`

`std::async()`有2个选项：

- `std::launch::async`：任务必须在不同线程异步执行

- `std::launch::deferred`：任务延迟到`future`上调用`get/wait`时才执行

默认配置是它们的或值，即`std::launch::async | std::launch::deferred`，既不同线程，且延迟执行。

所以，默认情况下，轮询`future::wait_for()`可能返回`std::future_status::deferred`，且一直如此，所以需要对此进行判断。否则，若任务一定要马上异步执行，一定得显式指定`std::launch::async`。

# 3. 让`std::thread`到最后都unjoinable

Unjoinable的线程包括：

- 默认构造`std::thread`，没有任务执行

- 被移动走的`std::thread`

- 已经`join`的`std::thread`

- 已经`detach`的`std::thread`：父线程无法再控制子线程

`std::thread`销毁时不会隐式`join`或`detach`，因为可能导致表现异常（如不必要的等待，对于前者）或者未定义行为（悬挂数据等，对于后者）：

- 所以，销毁unjoinable的`std::thread`，会导致程序直接中止。

所以必须保证`std::thread`销毁前，必须unjoinable。

此外，尽量把`std::thread`放在成员变量的最后，保证之前的成员都已经初始化完成后，再初始化线程。

# 4. 关注不同线程句柄的析构行为

上节说，销毁joinable的`std::thread`直接导致程序中止。

而销毁joinable的`std::future`不会导致程序中止，因为它只销毁`std::future`本身：

- 调用的结果放置在一块共享区域内
  
  ![item38_fig2](https://github.com/CnTransGroup/EffectiveModernCppChinese/raw/master/7.TheConcurrencyAPI/media/item38_fig2.png)
  
  - 若存在调用方，`std::shared_future`难以实现
  
  - 若存在被调用方，由于结果是局部的，被调用方被销毁时，结果会被销毁
  
  - 所以放在共享区域内

- 若引用了共享状态，那么销毁时，会被阻塞住，等同于隐式`join`

# 5. 对于单次事件通信，使用`void`的future

A任务做完后，通知B任务继续做。

一种实现方式是`std::condition_variable`，但要注意：

- 需要获取一个锁，配套条件变量使用

- 注意虚假唤醒，即`wait()`需要传递一个Lambda函数，判断条件为真后，才能被唤醒，即如同下面的处理：
  
  ```cpp
  cond.wait([]() { return ready; });
  ```
  
  上面的代码等同于循环轮询，以避免虚假唤醒，如下所示：
  
  ```cpp
  while (!ready) {
    cond.wait();
  }
  ```

另一种实现方式是使用`std::future`和`std::promise`，B等待A完成的信号：

- A完成后，通过`std::promise`来设置一个信号，调用`set_value()`

- B等待，需要通过`std::promise`调用`get_future().wait()`等待信号

上述特点：

- 是1P1C的模型，仅适用于一次通信

- 使用了共享存储状态，它存储在堆中，有开销

- 由于是一次通信，`std::future`和`std::promise`的模板参数可以是`void`。

# 6. 并发使用`std::atomic`，特殊内存使用`volatile`

C++`std::atomic`等同于Java的`Atomic`类，数据操作是原子的。

- `std::atomic`不支持拷贝和移动，需要通过`load()`和`store()`传递值

C++`volatile`和Java`volatile`不同：

- C++：没有并发含义，只是告诉编译器它是特殊内存（例如外部设备等），不要优化它的读写，例如
  
  - 冗余多次读取同一个变量，不要优化为读1次
  
  - 冗余多次写如同一个变量，不要优化为写1次
  
  > `auto y = x`的`auto`会把`volatile`拿掉（同样`const`也会拿掉，若`x`是非引用非指针）

- Java：保证数据各线程立即可见，采用内存屏障实现，避免了指令重排
  
  - C++的`std::atomic`也能做到这点

总之：

- `std::atomic`对并发有用，对特殊内存没用

- `volatile`对特殊内存有用，对并发没用
---
layout: post
title: "Effective Modern C++(5): 智能指针"
author: "keys961"
comments: true
catalog: true
tags:
  - C++
---

# 1. `std::unique_ptr`：独占资源

类似Rust的默认行为，独占一个资源，资源只有一个所属者。

- 它出了作用域后，会自动释放指向的资源
  
  - 通过内部调用`delete`
  
  - 可自行设置删除回调：模版第二个参数，为一个函数，传入`T`指针为参数

- 它一般为指针的大小，非常快，但只支持`move`
  
  - 若删除器是有状态的，则会增加`std::unique_ptr`的大小

- 容易将`std::unique_ptr`转换成`std::shared_ptr`：通过`move`即可

# 2. `std::shared_ptr`：共享资源

类似Rust的`Rc<T>`，共享一个资源，通过引用计数管理资源。

- 引用计数控制资源

- 对比`std::unique_ptr`，大小通常大2倍，因为包含一个指针和一个控制块（动态分配的）指针
  
  ![item19_fig1](https://github.com/CnTransGroup/EffectiveModernCppChinese/raw/master/4.SmartPointers/media/item19_fig1.png)
  
  - 上图构造可见其性能不如`std::unique_ptr`
  
  - 由于上图的构造，避免传入相同指针到不同的`std::shared_ptr`中，避免重复析构
  
  - 引用计数修改通过原子操作，所以有额外开销

- 支持拷贝赋值，效果是引用计数+1

- 避免循环引用，打破的一种方式是`std::weak_ptr`

# 3. `std::weak_ptr`：`std::shared_ptr`悬空时使用

`std::weak_ptr`从`std::shared_ptr`上创建，`weak_cnt`会增加1，但引用计数不增加，很像Java的虚引用。

其指向的资源可能会被`std::shared_ptr`释放（即悬空），此时需要检查，原子性检查可通过`lock()`函数，它：

- 若没释放，返回一个`std::shared_ptr`，并且指向的引用计数+1

- 若释放，则返回空指针

`std::weak_ptr`的结构和`std::shared_ptr`类似，前者指向后者相同的控制块，对于`weak_cnt`的操作也是原子的。

潜在使用场景：缓存、观察者列表、打破`std::shared_ptr`循环引用

# 4. 优先使用`std::make_unique/std::make_shared`

使用`make_xxx`的好处：

- 代码简短，提高异常安全性

- 数据和控制块是连续的，在一块内存里，更紧凑，一般而言更小更快

但也有限制：

- 不支持自定义删除回调

- 花括号初始化受限（C++20部分编译器已经支持）

- 自定义`new`和`delete`的内存管理，不适合交给`make_shared`管理
  
  - 因为`make_shared`将控制块和数据放在一块，可能和自定义内存管理冲突

- 大对象不适合`make_shared`，原因同上

- `std::weak_ptr`比对应`std::shared_ptr`活的更久，也不适合`make_shared`
  
  - 原因同上：只有当`std::weak_ptr`死光后才能删除控制块，而控制块和数据放在一起，数据最后才能释放，即使引用计数为0

# 5. 当使用Pimpl惯用法，在实现文件中定义特殊成员函数

这里只讨论`std::unique_ptr`的情况。

一个样例就是：

```cpp
// In header
class T {
public: 
// ...
private:
  struct Data;
  std::unique_ptr<Data> ptr; 
}
```

```cpp
// In cpp
#include "t.h"
struct T::Data {
  // ...
}
// ...
```

即用一个指针指向一个数据`struct`，这样就可以：

- 方便访问数据成员

- 依赖更少的头文件，减少编译时间

> 这里`Data`是未完成类型。

而这里，特殊的成员函数，如移动、析构、构造函数等，需要先在头文件声明，然后再到实现文件中定义。（否则很可能过不了编译检查，因为检查前`Data`是未完成类型）
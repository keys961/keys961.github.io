---
layout: post
title: "Effective Modern C++(10): 微调"
author: "keys961"
comments: true
catalog: true
tags:
  - C++
---

# 1. 对于移动成本低且总是被拷贝的可拷贝形参，考虑按值传递

若按值传递，且参数能：

1. 能被拷贝构造（即可拷贝）

2. 能被移动构造（即可移动），且移动构造成本低

那么参数可以设置按值传递。

此时传入：

- 左值：拷贝构造

- 右值：移动构造

这样，不需要维护左值+右值共2个重载，也不需要写模板实现通用引用，提高可维护性。

- 当然，左值/右值引用，可以避免传参数的拷贝/移动构造

一些注意的点：

1. 若对象不可拷贝，只可移动，那么只需要实现右值引用即可
   
   - 相比值传递，右值引用版本能节省1次移动构造
     
     ```cpp
     void f1(std::unique_ptr<T>&& var);
     void f2(std::unique_ptr<T> var);
     // f1比f2节省一次移动构造操作
     f1(std::make_unique<T>());
     f2(std::make_unique<T>()); 
     ```

2. 若按值传递，仅考虑移动构造开销小的参数
   
   - 若移动构造开销大，额外的移动构造操作就不能被忽略

3. 只考虑对“总是被拷贝/移动构造”的参数按值传递
   
   - 若函数中某些分支逻辑中，可以避免使用这样的构造，那还是用引用比较好

4. 若需要性能尽可能好，需要考虑按值传递带来的额外构造开销，最好使用引用

5. 考虑继承的事情（C++98），传值子类到基类参数，会有切片问题

# 2. 优先使用`emplace`而非普通的插入

STL容器中，类似于`push_back()`需要接受一个`T`类型的左值或者右值：

- 传入左值：调用一次拷贝构造到容器

- 传入右值：
  
  - 若匹配，调用一次移动构造到容器
  
  - 若不匹配，可能首先调用构造函数创建临时变量，然后再调用一次临时构造到容器

对于最后一个情况，临时变量可以通过`emplace_xxx()`函数消除，因为它用了完美转发，直接在容器中构造。

一般来说`emplace`要更快一些，但也不一定，所以最终还是profile后才能知道。通常是3种情况：

- 值被构造到容器中，而不是直接赋值

- 传入的类型与容器的元素类型不一致（就是上面提及的情况）

- 容器不拒绝已经存在的重复值（如`set`, `map`等容器）

此外`emplace_xxx`可提供构造函数的参数进去，调用构造函数进行构造，更加灵活方便。

> 此外，不论是怎么插入，应该避免在参数列表中调用`new`，以免异常导致的内存泄漏。
---
layout: post
title: "Effective Modern C++(2): auto"
author: "keys961"
comments: true
catalog: true
tags:
  - C++
---

# 1. 优先使用`auto`而非显式声明

- 摆脱冗长的类型声明，编写效率高

- 摆脱未初始化行为，否则编译不过

- 调用更快，例如
  
  - 闭包：`auto`比`std::function`，后者可能存储不了闭包，从而在堆上申请内存，从而更耗空间且更慢

- 不需要判断平台等方面的类型（例如`size_t`）

- 避免难以意识到的类型不匹配的错误

但是也有可能出现一些陷阱。

# 2. `auto`推导若非己愿，进行显式类型初始化

`auto`可能会推导错误，如：

- 若`T`类型的左值不是简单变量，那么会推导为`T&`

- 不可见的代理类，如
  
  - `std::vector<bool>[]`返回的不是`bool&`，而是内部的一个`std::vector<bool>::reference`类型

因此可以用显式类型进行初始化：

- `T v = func()`

- `auto v = static_cast<T>(func())`
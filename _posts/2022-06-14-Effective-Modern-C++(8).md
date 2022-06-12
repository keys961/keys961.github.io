---
layout: post
title: "Effective Modern C++(8): Lambda表达式"
author: "keys961"
comments: true
catalog: true
tags:
  - C++
---

**Lambda表达式**（编译期）就是一个表达式。

```cpp
[ captures ] ( params ) { body } 
```

它创建的运行时对象是**闭包**（运行时），其依赖于捕获。

> Lambda表达式运行时创建的时候（即生成**闭包**），`captures`就会被立刻执行

每个Lambda，编译器都会生成唯一的**闭包类**（编译期），表达式中的语句成为闭包类成员函数的执行指令。

# 1. 避免使用默认的捕获

C++11有2种默认捕获模式：

- 引用：`[&]`，可能引起悬空引用

- 值拷贝：`[=]`，并没有解决悬空引用，且让人误以为闭包是独立的

对于引用捕获：

- 若捕获的引用先死亡，那么该引用就会悬空，产生UB

对于值拷贝捕获：

- Lambda只能捕获non-`static`局部变量，若捕获了成员变量，则会捕获成员的`this`指针，从而可能导致悬空，并且闭包不是独立的
  
  ```cpp
  // 这里member是成员变量
  [=] () { return member; }
  // 实际上是捕获了this指针
  [this] () { return this->member; }
  ```

- 静态存储的变量，不会被捕获进去，可直接使用。默认的值拷贝捕获可能会产生误导。

# 2. 移动对象到闭包：使用初始化捕获

C++14支持Lambda表达式的初始化捕获，如下：

```cpp
auto lambda = [var = init()] () { var.blabla(); }
```

所以可以通过该机制，通过移动来捕获对象（例如捕获`std::unique_ptr`）

> Note：`captures`捕获会在Lambda表达式变量创建时立刻执行。

例如通过下面的移动捕获（在初始化捕获执行`std::move`）：

```cpp
auto lambda = [var = std::move(var_outer)] () { var.blabla(); }
```

在C++11中不支持上述特性，可以通过`std::bind`模拟实现。

# 3. Lambda中，`auto&&`参数需要`decltype`来`std::foward`它们

C++14的Lambda支持`auto`参数。

因此，Lambda表达式中可能出现完美转发的需求。

这里需要做的是：

- 参数声明为`auto&&`，即通用引用

- 调用`std::forward`完美转发

- 此时，`std::forward`的模板参数应该填入`decltype(param)`

该特性也支持变长`auto&&`参数（即`auto&&... params`）。

为什么可以：

- `decltype`：传入左值引用则返回左值引用类型，传入右值引用则返回右值引用类型
  
  - 即是什么，返回什么

- 回顾`std::forward`实现
  
  ```cpp
  template<typename T>                        
  T&& forward(remove_reference_t<T>& param) {
      return static_cast<T&&>(param);
  }
  ```

- 若为左值：
  
  - 此时`std::forward`的模板参数就是`T = type&`
  
  - 引用折叠`& && -> &`，返回左值引用，OK

- 若为右值：
  
  - 此时`std::forward`的模板参数就是`T = type&&`
    
    - 注意：不同于直接右值传入通用引用的参数，`T = type`
  
  - 但通过引用折叠，`&& && -> &&`，还是返回右值引用，OK

# 4. 优先使用Lambda表达式，而非`std::bind`

## a. `std::bind`

通用的函数适配器，生成一个新的可调用对象以适应原参数列表。

它可以：

- 绑定普通函数：`std::bind(&func, args...)`
  
  - 这里可以放置`std::placehoders::_x`，代表新的调用对象对应的第几个参数
  
  - `args`参数顺序要和`func`参数列表一致

- 绑定成员函数：`std::bind(&Foo::func, &foo, args...)`
  
  - 这里`bind`必须指明对象的指针，才能找到成员函数

- 绑定引用参数：参数列表中的参数需要包一层`std::ref`

## b. 更应使用Lambda而非`std::bind`

1. Lambda更短，更易读，且更易维护

2. 效率可能低，因为`std::bind`总是按值捕获
   
   - 但是生成的调用对象，参数传递是引用传递

基本上Lambda可以替换`std::bind`的使用。

除非在C++11下：

- 移动捕获：只能用`std::bind`模拟
  
  - C++14中，Lambda支持移动捕获

- 模板函数：参数带模板，可以用`std::bind`模拟，因为`bind`对象上的函数调用使用完美转发，支持接受任意类型的参数
  
  - C++14中，支持`auto`参数以实现该功能
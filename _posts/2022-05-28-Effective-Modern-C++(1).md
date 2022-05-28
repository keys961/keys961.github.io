---
layout: post
title: "Effective Modern C++(1): 类型推导"
author: "keys961"
comments: true
catalog: true
tags:
  - C++
---

# 1. 模板类型推导

考虑下面的模板：

```cpp
template <typename T>
void f(ParamType param);
```

## 1.1. `ParamType`为指针或引用

若`ParamType`为`T&`：

- 传入`int`：`T = int`，`ParamType = int&`

- 传入`const int`：`T = const int`，`ParamType = const int&`

- 传入`const int&`：`T = const int`，`ParamType = const int&`
  
  - 推导的`&`被忽略

若`ParamType`为`const T&`：

- 传入`int`：`T = int`，`ParamType = const int&`

- 传入`const int`：`T = int`，`ParamType = const int&`
  
  - 推导的`const`被忽略

- 传入`const int&`：`T = int`，`ParamType = const int&`
  
  - 推导的`const`和`&`都被忽略

对于指针（`T*`与`const T*`）也是一样

## 1.2. `ParamType`为通用引用

即`ParamType`为`T&&`，可接受左值和右值：

- 若传入参数为左值（即可取地址），`T`和`ParamType`会被推导为左值引用
  
  - 传入`int`：`T = int&`（这里推导增加了引用），折叠后`ParamType = int&`
  
  - 传入`const int`：`T = const int&`（这里推导增加了引用），折叠后`ParamType = const int&`
  
  - 传入`const int&`：`T = const int&`，折叠后`ParamType = const int&`

- 若传入参数为右值，同第1节
  
  - 传入`int`右值，如数字：`T = int`，`ParamType = int&&`

> 折叠规则：只要有左值引用，优先折叠为左值引用
> 
> - `& + & -> &`
> 
> - `& + && -> &`
> 
> - `&& + & -> &`
> 
> - `&& + && -> &&`

## 1.3. 传值

即`ParamType`为`T`。

- 若传入参数包含引用，引用被忽略，再忽略`const`和`volatile`
  
  - 传入`int`, `const int`, `const int&`：`T`和`ParamType`都为`int`
  
  - 这说明了传入的参数就是一个拷贝，和外面的无关了
  
  - 若传入`const char* const`，拷贝了指针，但右边的`const`被忽略，所以变成了指针可变、内容不可变

## 1.4. 数组

若`ParamType`为`T`

- 若传入`int`数组，则会退化为`const int*`指针

若`ParamType`为`T&`

- 若传入`int`数组，则`T`会推导为`int[]`

当然，更推荐直接使用`std::array`

## 1.5. 函数

会被退化为函数指针

## 1.6. 总结

1. 若`ParamType`为`T&`，传入引用时，推导会将引用忽略

2. 若`ParamType`为`T&&`，传入左值引用，会优先推导为左值引用

3. 若`ParamType`为`T`，引用、`const`和`volatile`会被忽略，会出现拷贝

4. 数组和函数会被退化为指针，除非`ParamType`为引用

# 2. `auto`类型推导

基本同模板推导：

- `auto&`：第一种情况

- `auto&&`：第二种情况

- `auto`：第三种情况

但是`{}`下会被推导为`std::initialize_list`

若`auto`作为返回值或者函数参数中，则采用模板的方案

# 3. `decltype`

简单返回表达式的类型，不会加以修改。

用于模板返回类型声明，而返回类型依赖参数类型：

- `decltype(auto)`标注返回值类型，而不用`auto`那套推导方式

- 或在函数后用`-> decltype(...)`标注返回值类型

此外，对于`T`类型但不是单纯变量名的左值，`decltype`总会会返回`T&`，所以用于`decltype(auto)`返回值声明时要小心。

# 4. 查看类型推导结果

## 4.1. IDE

可通过IDE传达推导的信息，例如CLion

## 4.2. 编译器诊断

可通过编译器的错误提示看到类型是什么

## 4.3. 运行时输出

类似`typeid`和`std::type_info::name`的方案，或用第三方库

> `typeid(T).name()`, `typeid(param).name()`

实际上这些都不怎么可靠
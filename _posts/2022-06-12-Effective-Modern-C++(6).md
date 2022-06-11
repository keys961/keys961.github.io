---
layout: post
title: "Effective Modern C++(6): 右值引用、移动、完美转发(1)"
author: "keys961"
comments: true
catalog: true
tags:
  - C++
---

# 1. `std::move`与`std::forward`

2个函数实际上只做了类型转换，运行时什么都不做。

- `std::move`：接受一个通用引用，返回一个右值引用
  
  - 若不想对象移动，声明为`const`类型，传参时不会调用移动构造（因为移动构造没有`const`），而是拷贝构造

- `std::forward`：若变量**传入的**是左值，则转化为左值；否则转化为右值
  
  - 注意，是传入的。即，外面给了左值，则转化为左值；否则为右值。
    
    > 因为函数内的参数变量是左值，它可以取地址

# 2. 通用引用 vs 右值引用

通用引用：模版中的参数`T&&`和自动推导的`auto&&`，则为通用引用

- 若不是标准的模版`T&&`，例如`const T&&`, `std::vector<T>&&`，都不是通用引用，而是右值引用

- 若通用引用被右值初始化（即传入的是右值），则成为右值引用；否则成为左值引用

通用引用的特性在“引用折叠”中体现。

**通用引用`T&&`推导时，有下面的规则，这在第6节有用：**

- **若传入左值引用，则`T = Type&`**

- **若传入右值引用，则`T = Type`**

> 此外，若定义了`const T&`和`T&&`重载，传入右值（临时对象，字面值）会匹配后者。

# 3. 对右值引用使用`std::move`，对通用引用使用`std::forward`

只对右值引用使用`std::move`，而对于通用引用务必使用`std::forward`。

若返回右值引用或通用引用，也采用上面的规则。

一些问题：

- 对通用引用使用`std::move`：若传入左值，导致数据被移动走，产生UB

- 这种重载场景：一个`const`左值+一个右值，右值对参数使用`std::move`，当传入一个字面量时：
  
  - 此时传入的参数会生成一个临时拷贝，从而能调用`std::move`，性能不好
  
  - 维护代码多
  
  - 不利于扩展

此外，下面这种情况，尽量不要在返回值调用`std::move`，误以为这是“优化”：

1. 返回函数内局部变量，或某个值参数

2. 该局部变量和函数返回值类型相同

上面情况下，编译器会优化（RVO），避免返回值的拷贝。而调用`std::move`后，第2个条件就不符合了，无法优化。

- 优化：只会调用一次普通构造函数

- 不优化：会多一次移动构造函数的调用

# 4. 避免通用引用上的重载

> 例子：
> 
> ```cpp
> void logAndAdd(const std::string& name) {
>   list.emplace(name);
> }
> 
> 
> std::string petName("Darla");
> logAndAdd(petName);                     // 1
> logAndAdd(std::string("Persephone"));    // 2
> logAndAdd("Patty Dog");                 // 3
> ```
> 
> 1. `name`传入的是左值，`emplace`会有一个拷贝
> 
> 2. `name`传入的是右值，但它本身是左值，所以`emplace`还是有拷贝（可用`std::move`执行移动）
> 
> 3. `name`传入是右值，同2
> 
> 若使用通用引用+`std::forward`，则：
> 
> 1. `name`传入的是左值，`emplace`传入左值，会有一个拷贝
> 
> 2. `name`传入的是右值，`emplace`传入右值，调用`std::move`
> 
> 3. `name`传入的是右值且为字面量，`emplace`直接从字面量创建`std::string`

上面例子中，可以看到通用引用的好处。但是若重载它，只有精确匹配类型外，其它都会匹配到通用引用的函数，从而导致错误。

- 例如重载了一个`int`，但传入`size_t`等参数，就不会匹配这个重载版本

- 例如重裁了一个父类类型，但传入子类参数，也不会匹配这个重载版本

此外，在构造函数上使用通用引用也不好，也是上述原因，且由于它不影响编译器自动生成的特殊成员函数，因此会和这些函数重载弄混：

- 例如拷贝构造，若传入是`non-const`，则反而会调用通用引用的版本，从而出错

- 容易劫持子类对父类拷贝和移动构造函数的调用（见上面第2条，就是原因）

所以，避免对通用引用重载。

# 5. 重载通用引用的替代方案

上面说明了，避免重载通用引用。所以需要替代方案。

## a. 放弃重载

直接使用其它函数名，就不会有问题。

## b. 传递`const T&`

回退到C++98方案，但这样的效率不如通用引用+`std::forward`高。

## c. 传值

函数参数就直接用值传递。这在你认为移动比拷贝开销小的时候做。

## d. Tag Dispatch

继续使用通用引用，但是通过调用`<type_traits>`里的模板，判断`T`的类型，然后分发到不同的实现重载中：

例如：

- 调用`std::is_integral<typename std::remove_reference_t<T>>()`，判断`T`是不是整数，若是则返回一个`std::true_type`变量，否则返回`std::false_type`变量

- 然后实现的2个重载，一个包含`std::false_type`参数，另一个包含`std::true_type`参数

## e. 限制使用通用引用的模板

在模板添加额外限制，限制`T`的类型，从而避免不必要的匹配和调用。

例如：

- `typename = std::enable_if_t<condition>`：当`T`符合一定条件时使用

- 里面的`condition`可以用类似`std::is_xxx_v<>`使用，例如：
  
  - `std::is_same_v<T, type>`：判断`T`和`type`是否是一个类型

下面一个例子，只有当`T`和`R`都为整数时，才能被调用：

```cpp
template<typename T, typename R,
         typename = std::enable_if_t<std::is_integral_v<T> && std::is_integral_v<R>>
        >
void call(T&& t, R&& r) {
  // ...
}
```

> 这里可以实现类似Java泛型`extends`的功能，可使用`std::is_base_of_v`

此外，在这类模板调用的时候，可以添加`static_assert`判断类型是否匹配，从而可以让编译器更清晰地输出错误。

# 6. 引用折叠

折叠场景：模板推导，`auto`推导，`typedef`与别名声明，`decltype`

折叠规则：

- 若中间有左值引用，一律左值（`&+&`, `&+&&`, `&&+&`）

- 否则右值（`&&`, `&&+&&`）

## 例子：`std::forward<T>`

大体实现：

```cpp
template<typename T>
T&& forward(std::remove_reference_t<T>& param) {
  return std::static_cast<T&&>(param);
}
```

这里`T&&`作为返回值，是通用引用，适用于下面的推导：

- 传入左值，`T = type&`

- 传入右值，`T = type`

上面的例子，若传入左值，则变为下面的，`type& &&`折叠为`type&`，为左值：

```cpp
type& && forward(type& param) {
  return std::static_cast<type& &&>(param);
}
```

若传入右值，则变为下面的，直接返回`type&&`，无需折叠，为右值：

```cpp
type&& forward(type& param) {
  return std::static_cast<type&&>(param)
}
```
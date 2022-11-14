---
layout: post
title: "C++ 20 Coroutine API Memo & Exploration"
author: "keys961"
comments: true
catalog: true
tags:
- C++
- Coroutine
---

# 1. 概览

C++ 20的Coroutine是一个函数，它支持用户态的**挂起**和**恢复**（并调度到某个线程上）。

它可以长成这样：

```cpp
Task<int> func_coroutine(void *data) {
  // ...
  co_await func_another_coroutine(); // suspend current coroutine
  // ...
  co_return 2; // return the value
}
```

类似于线程在CPU核心的调度，这里对应的是coroutine在线程上的调度：

- **挂起**：coroutine在某个线程中被切出

- **恢复**：coroutine被切回某个线程，该线程调用了`handle.resume()`

# 2. Coroutine核心：`Promise` & `Awaiter`

假如我们随便编写一个`Task`类，那么上述的代码不能通过编译，会警告我们找不到`Task::promise_type`。这就牵扯到coroutine的第一个核心：`Promise`。

## 2.1. `Promise`

正如上面所述，返回值`Task`需要一个`promise_type`。这个`promise_type`需要实现下面的几个函数：

- `Awaiter initial_suspend()`：在当前coroutine开始执行后，调用它，返回的`Awaiter`决定本coroutine是否被挂起

- `Awaiter final_suspend()`：当前coroutine执行完成后（比如`co_return`时），调用它，返回的`Awaiter`决定本coroutine是否被挂起
  
  - 若决定挂起，需要之后在外部调用`handle.destroy()`销毁coroutine，并手动清理资源

- `Task get_return_object()`：返回这个`Task`对象，在最开始的时候被调用
  
  - `Task`还需要持有`std::coroutine_handle<promise_type>`类型的`handle`字段，代表当前的coroutine

因此，一个coroutine的具体执行步骤是：

1. 调用`get_return_object()`，返回`Task`对象，里面记录了coroutine的`handle`

2. 调用`initial_suspend()`，返回一个`Awaiter`，由它来决定coroutine执行前是否挂起

3. 执行coroutine的逻辑

4. 最后，调用`final_suspend()`，返回一个`Awaiter`，由它来决定coroutine执行后是否挂起

```cpp
template<typename T, typename Exec>
struct TaskPromise {
  // 由DispatchAwaiter决定，本coroutine执行前是否被挂起
  DispatchAwaiter initial_suspend() { return DispatchAwaiter{&exec}; }
  // 本coroutine执行后永远被挂起，等待销毁
  std::suspend_always final_suspend() noexcept { return {}; }
  // 创建Task对象，记录了coroutine的handle
  Task<T, Exec> get_return_object() {
    return Task{std::coroutine_handle<TaskPromise>::from_promise(*this)};
  }
}

template<typename T, typename Exec>
struct Task {
  using promise_type = TaskPromise;
  std::coroutine_handle<> handle;
  // ... 
}
```

除此之外，还有几个比较重要的函数：

- `void unhandled_exception()`：若本coroutine执行出现没有捕捉的异常，该函数就会被调用

- `void return_value(T value)/void return_void()`：本coroutine执行`co_return`时，会调用该函数，将值传进去，`Promise`需要保存该返回值

- `Awaiter await_transform(XXX)`：若本coroutine中调用了`co_await XXX`，若`XXX`不是`Awaiter`，那么会调用该函数，将`XXX`转换成`Awaiter`。此时，本coroutine的挂起和恢复受该`Awaiter`控制

- `YYY yield_value(XXX)`：若本coroutine中调用了`co_yield XXX`，那么它等效于`co_await prommise.yield_value(XXX)`

如上文所述，`Awaiter`控制了coroutine的挂起和恢复，下面就说明coroutine的第二个核心：`Awaiter`。

## 2.2. `Awaiter`

`Awaiter`控制了当前coroutine的挂起和恢复。它需要实现下面几个函数：

- `bool await_ready()`：若返回`false`，则会挂起本coroutine；否则不会挂起。

- `? await_suspend(std::coroutine_handle<>)`：若`await_ready()`返回`false`，则会调用该函数。它可以决定参数中的coroutine（即本coroutine）什么时候唤醒，可以在函数内选择调用`handle.resume()`唤醒。
  
  - 若`?`为`void`，或返回`true`：挂起本coroutine
  
  - 若返回`false`：唤醒本coroutine
  
  - 若返回其它的`std::coroutine_handle<>`：返回的coroutine被唤醒
  
  - 若抛出异常：唤醒本coroutine，并抛出异常
  
  例如，我们希望让本coroutine在一个线程池中唤醒，可以这样：
  
  ```cpp
  void await_suspend(std::coroutine_handle<> h) {
    handle = h;
    exec.execute([this]() {
      handle.resume(); // 在线程池中resume
    });
    // 但先suspend本coroutine
  }
  ```

- `T await_resume()`：若本coroutine被唤醒，那么它的返回值会作为`co_await`表达式的返回值。
  
  例如下面的例子，一个整数`a`作为`co_await`表达式的返回值，它就由`await_resume()`返回的：
  
  ```cpp
  Task<void> f() {
    // ...
    int a = co_await f2(); // return an integer
    // ...
  }
  ```

# 3. 3个运算符：`co_await`, `co_yield`, `co_return`

假设我们有这样的Coroutine：

```cpp
Task<int> f() {
  // ...
  co_await XXX; // For 3.1
  // ...
  co_yield YYY; // For 3.2.
  // ...
  co_return 0; // For 3.3.
}
```

## 3.0. `f()`的执行

首先回顾2.1.节的内容。

1. 调用`f()`前，首先调用`Task::promise_type::get_return_object()`创建`Task`对象，保存`std::coroutine_handle<>`实例

2. 调用`Task::promise_type::initial_suspend()`，返回一个`Awaiter`，它会挂起并唤醒该coroutine

3. 执行上面的3个步骤

4. 最后调用`Task::promise_type::final_suspend()`，返回一个`Awaiter`，挂起或唤醒该coroutine

> 若无特别说明，`Task::xxx`的`Task`指的是返回值`Task<int>`实例。

## 3.1. `co_await`

`co_await expr`：这里`expr`需要返回一个`Awaiter`。

若不是`Awaiter`，则调用`Task::promise_type::await_transform(expr)`转成一个`Awaiter`。

此时，当前coroutine（**调用`co_await`表达式的coroutine**）的挂起和唤醒就由该`Awaiter`决定。

例如：

- `co_await 2s`：返回一个`SleepAwaiter`（通过`2s`转化而来的），它会先挂起本coroutine，然后过2秒后唤醒

- `co_await f()`：返回一个由`Task<int>`转换而成的`Awaiter`，该`Awaiter`决定是否挂起本coroutine，遵循2.2.节的规则
  
  - 但此时创建了一个新coroutine，它的执行遵循3.0.节的步骤

## 3.2. `co_yield`

它就是`co_await`的马甲，就是`co_await Task::promise_type::yield_value(expr)`。这里不再详述。

## 3.3. `co_return`

`co_return expr`：该语句作为coroutine的返回值

- 若返回的是`void`：调用`Task::promise_type::return_void()`

- 若返回是具体值：调用`Task::promise_type::return_value(expr)`

之后，coroutine将会返回，最后调用`Task::promise_type::final_suspend()`，其返回的`Awaiter`决定最后是否需要挂起这个coroutine。

# 4. 其它细节

## 4.1. 关于coroutine的恢复

**Coroutine会在调用`handle.resume()`的线程上执行，直到它再被挂起，该线程才会执行`handle.resume()`下面一行代码**。

如下代码所示：

```cpp
void resume() {
  // called by T1
  // ...
  std::cout << "Resuming..." << std::endl;
  handle.resume();
  std::cout << "Resumed" << std::endl;
  handle.destroy();
}

// 假设h()的coroutine handle就是上面的
Task<void> h() {
  std::cout << "h()" << std::endl;
}

std::suspend_always Task<void>::promise_type::initial_suspend() {
  return {};
}
```

这里的`h()`会先被挂起（见`initial_suspend()`），然后线程`T1`调用`resume()`来恢复该coroutine，此时：

- `h()`会在`T1`线程执行

- 打印结果是：
  
  ```
  Resuming...
  h()
  Resumed
  ```

## 4.2. 典型的`Awaiter`

### a. `std::suspend_always`

永远挂起当前coroutine。

```cpp
struct suspend_always {
  // 永远需要挂起
  constexpr bool await_ready() const noexcept { return false; }
  // 返回void，直接挂起coroutine
  constexpr void await_suspend(coroutine_handle<>) const noexcept {}
  constexpr void await_resume() const noexcept {}
};
```

### b. `std::suspend_never`

永远不挂起当前coroutine。

```cpp
struct suspend_never {
  // 永远不挂起
  constexpr bool await_ready() const noexcept { return true; }
  // 该函数不会被调用
  constexpr void await_suspend(coroutine_handle<>) const noexcept {}
  constexpr void await_resume() const noexcept {}
};
```

# 5. 相关源码和参考

这里参考了：[渡劫 C++ 协程（1）：C++ 协程概览 | Benny Huo](https://www.bennyhuo.com/2022/03/09/cpp-coroutines-01-intro/)的文章，解释的很清楚。

然后代码也在：[TempRepo/coroutine at master · keys961/TempRepo · GitHub](https://github.com/keys961/TempRepo/tree/master/coroutine)，有注释。

此外，cppreference也有很好的解释：[Coroutines (C++20) - cppreference.com](https://en.cppreference.com/w/cpp/language/coroutines)

# 6. 总结

扩展性还是很好的，但需要记住非常多的API，并理清各个函数的意义，上手还是非常难的。

期待后续的更新，使得它更加易用。

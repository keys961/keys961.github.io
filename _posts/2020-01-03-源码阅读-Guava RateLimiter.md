---
layout: post
title: "源码阅读-Guava RateLimiter"
author: "keys961"
comments: true
catalog: true
tags:
  - Java
typora-root-url: ./
---

# 1. 限流算法

Guava的`RateLimiter`是用于限流的，其基于一个限流的算法。

而限流算法有很多，不过主要分为2大类：

- 漏桶算法
- 令牌桶算法

## 1.1. 漏桶算法

其思路很简单，它维护2个变量：

- `rate`：桶漏出的频率
- `capacity`：桶容量

请求会暂时落入桶中，从而占用桶的容量。而桶以`rate`频率漏出请求，漏出的请求就可以被执行。当桶溢出的时候，即请求速率过快，请求会被阻塞/拒绝。

由于桶漏出的速率是固定的，当突发流量来的时候，速率会被强制限制到`rate`，这样效率不高。

## 1.2. 令牌桶算法

其思路也很简单，但思路却和漏桶算法相反。

它也维护2个变量：

- `rate`：往桶加入token的频率（若QPS为$Q$，则每过$\frac{1}{Q}$秒往桶中放1个token），也即限制的流量频率
- `capacity`：桶中token的最大数量

请求到来后，会尝试从桶中获取token，获取到才能继续执行下去。若token获取不到，请求会被阻塞/拒绝。

令牌桶算法的好处有：

- 突发流量到来后，只会当桶中token耗尽后，才会限制流量到`rate`，相对高效
- 限流设定可以随时更改，只需更改加入token的频率即可，即`rate`

而Guava的`RateLimiter`就是基于该算法。

# 2. Guava `RateLimiter` 概述

`RateLimiter`的API是非常简单的：

```java
// RateLimiter的创建，必须指定流量频率permitsPerSecond
static RateLimiter create(double permitsPerSecond); // (1)
static RateLimiter create(double permitsPerSecond, Duration warmupPeriod); // (2)
static RateLimiter create(double permitsPerSecond, long warmupPeriod, TimeUnit unit); // (3)
// 获取批准，阻塞
double acquire();
double acquire(int permits);
// 尝试获取批准，非阻塞/超时检测
boolean tryAcquire();
boolean tryAcquire(int permits);
boolean tryAcquire(long timeout, TimeUnit unit);
boolean tryAcquire(int permits, long timeout, TimeUnit unit);
// 限流频率参数的获取与设置
double getRate();
void setRate(double permitsPerSecond);
```

而查看源码，`RateLimiter`实际上有2个实现：

- `SmoothBursty`：上面第1个`create`创建的限流器
- `SmoothWarmingUp`：上面第2、3个`create`创建的限流器，带有预热功能

它们都有共同的基类`SmoothRateLimiter`，而它的基类就是`RateLimiter`。

# 3. 基类：`RateLimiter` & `SmoothRateLimiter`

`RateLimiter`实际上只有2个字段：

- `stopWatch`：一个`StopWatch`实例，作为计时器。它从0开始计数（实际上它就是读`System.nanoTimes()`）
- `mutexDoNotUseDirectly`：一个`Object`实例，是一个单例，作为monitor用于上锁（`mutex()`方法会返回它，然后利用`synchronized`关键字上锁）

而`SmoothRateLimiter`有4个字段：

- `storedPermits`：还有多少个`permits`没被使用

- `maxPermits`：桶中最大存放的`permits`

- `stableIntervalMicros`：每隔多少时间产生1个`permits`，单位微秒

- `nextFreeTicketMicros`：下一次可以获取`permits`的时间

  > 当`storedPermits`够的时候，直接相减即可；若不够，则需要将该值往后推，表示我预占了多少时间的`permits`的量。
  >
  > 当下一个请求来的时候，若没有达到这个时间，线程就会`sleep`，并也将该值往后推。

有一个疑问：**桶中的`permits`是如何被添加的？**实际上，不需要另一个线程，**当请求`permits`时，只要同步一下，根据时间重新计算桶中的`permits`数量**就可以了。

# 4. 实现：`SmoothBursty`

`SmoothBursty`是一个限流器的简单实现，它适用于一些突发流量来临的情况，这是因为它能缓存一定数量的`permits`以拿来使用和预占（当`permits`不够时）。

## 4.1. 创建

`SmoothBursty`的创建使用的是第2节中的第1个创建方法，代码如下：

```java
public static RateLimiter create(double permitsPerSecond) {
    return create(permitsPerSecond, SleepingStopwatch.createFromSystemTimer());
}

static RateLimiter create(double permitsPerSecond, SleepingStopwatch stopwatch) {
    RateLimiter rateLimiter = new SmoothBursty(stopwatch, 1.0 /* maxBurstSeconds */);
    rateLimiter.setRate(permitsPerSecond);
    return rateLimiter;
}
```

注意`SmoothBursty`构造函数的第2个参数`maxBurstSeconds`，它代表桶中最多存放多少时间的`permits`。这里默认为1秒，且不能修改，意思为桶中最多存放`1 * permitsPerSecond`个`permits`。

> `SmoothBursty`的字段也只有`maxBurstSeconds`，所以代码略。

## 4.2. 设置流量速率

4.1.创建`SmoothBursty`时，设置了初始速率`permitsPerSecond`，设置的代码如下：

```java
// In RateLimiter
public final void setRate(double permitsPerSecond) {
    // ...
    synchronized (mutex()) {
        // 上锁设置速率，参数分别是: 速率、当前时间(微秒)
        doSetRate(permitsPerSecond, stopwatch.readMicros());
    }
}

// In SmoothRateLimiter
final void doSetRate(double permitsPerSecond, long nowMicros) {
    // 1. 重新计算桶中的permits
    resync(nowMicros);
    // 2. 设置生成1个permits的时间间隔
    double stableIntervalMicros = SECONDS.toMicros(1L) / permitsPerSecond;
    this.stableIntervalMicros = stableIntervalMicros;
    // 3. 重新设置maxPermits,并更新桶中的permits个数(这里是和旧速率按比例缩放)
    doSetRate(permitsPerSecond, stableIntervalMicros);
}

// In SmoothBursty
void doSetRate(double permitsPerSecond, double stableIntervalMicros) {
    double oldMaxPermits = this.maxPermits;
    // 1. 重新设置maxPermits
    maxPermits = maxBurstSeconds * permitsPerSecond;
    if (oldMaxPermits == Double.POSITIVE_INFINITY) {
        storedPermits = maxPermits;
    } else {
        // 2. 按比例缩放桶中的permits个数,因为设置的速率改变了
        storedPermits =
            (oldMaxPermits == 0.0)
                ? 0.0 // initial state
                : storedPermits * maxPermits / oldMaxPermits;
    }
}
```

设置速率的操作非常简单，整个操作是上锁的，因此没有同步问题。其步骤如下：

- 同步/重新计算桶中的`permits`个数（重新生成`permits`，即`storedPermits`）
- 计算并设置生成1个`permits`的时间间隔（`stableIntervalMicros`）
- 重新设置速率和桶`permits`上限（`maxPermits`），并等比缩放已有的`permits`（`storedPermits`）

## 4.3. 同步/重新计算桶中存放的permits个数

同步桶中存放`permits`个数，并同步`nextFreeTicketMicros`，主要是通过`resync(long)`方法，代码如下：

```java
// In SmoothRateLimiter
void resync(long nowMicros) {
    // 若当前时间大于nextFreeTicketMicros
    // 即很久没有从桶中获取permits/tokens，或者需要第一次计算桶中的permits/tokens
    // 就：1. 需要重新计算/生成桶中的permits
    // 2. 将nextFreeTicketMicros推后到现在
    if (nowMicros > nextFreeTicketMicros) {
        // 1. 计算新增的permits个数
        double newPermits = (nowMicros - nextFreeTicketMicros) / coolDownIntervalMicros();
        // 2. 将新增的permits添加到桶中,但不能超过上限
        storedPermits = min(maxPermits, storedPermits + newPermits);
        // 3. 将nextFreeTicketMicros推后到现在
        nextFreeTicketMicros = nowMicros;
    }
}
```

这里，只有当`nowMicros > nextFreeTicketMicros`才能重新计算（因为不这样，说明桶中没`permits`了，自然不用重新计算）。同步的步骤主要是3步：

- 计算新增的`permits`个数
- 将新增的`permits`添加到桶中,但不能超过上限
- 将`nextFreeTicketMicros`推后到现在

> 而这里有一个方法`coolDownIntervalMicros()`，这里先不用管它，在`SmoothWarmingUp`中会说明：
>
> - **在这里，该方法直接返回`stableIntervalMicros`**
>
> 注意到，创建限流器，第一次只需`resync(long)`时，`stableIntervalMicros`为0，得到的`newPermits`为`Double.POSITIVE_INFINITY`，但是没关系，`storedPermits`依旧是0。当从限流器获取`permits`时，`resync(long)`依旧会被调用，此时`stableIntervalMicros`已经被设置，`storedPermits`会被重新计算成一个正常值。

## 4.4. 获取permits/tokens

这里就是`RateLimiter`的几个`acquire`方法了，这里挑选下面这个：

```java
public double acquire(int permits) {
    // 1. 预约permits,若获取不到足够的,则返回要sleep的时间
    long microsToWait = reserve(permits);
    // 2. 等待第1步计算的时间(若获取到足够的,则不会sleep)
    stopwatch.sleepMicrosUninterruptibly(microsToWait);
    // 3. 返回获取permits时sleep的时间，单位为秒
    return 1.0 * microsToWait / SECONDS.toMicros(1L);
}
```

这里最重要的就是`reserve(int)`方法，它加锁最后调用了`reserveEarliestAvailable(int, long)`方法，用于获取`permits`（即令牌桶的令牌），若获取不到足够的，则返回需要睡眠的时间。具体可看下面的代码解释：

```java
final long reserve(int permits) {
    checkPermits(permits);
    synchronized (mutex()) {
        // 上锁，获取permits，返回等待/睡眠的时间
        return reserveAndGetWaitLength(permits, stopwatch.readMicros());
    }
}

final long reserveAndGetWaitLength(int permits, long nowMicros) {
    // momentAvailable代表本次请求permits可用的时间
    long momentAvailable = reserveEarliestAvailable(permits, nowMicros);
    // 和当前时间相减，得到要睡眠的时间，睡眠后，permits就有了
    return max(momentAvailable - nowMicros, 0);
}

final long reserveEarliestAvailable(int requiredPermits, long nowMicros) {
    // 1. 更新storedPermits和nextFreeTicketMicros(若很久没有获取令牌时)
    resync(nowMicros);
    // 直接返回旧的nextFreeTicketMicros
    long returnValue = nextFreeTicketMicros;
    // 当前可用的permits数
    double storedPermitsToSpend = min(requiredPermits, this.storedPermits);
    // 需要另外获取的permits数
    double freshPermits = requiredPermits - storedPermitsToSpend;
    // 2. 计算不够的部分，需要等待多少时间
    long waitMicros =
        // 这里该方法返回0，从桶中获取permits不需要另外等待
        storedPermitsToWaitTime(this.storedPermits, storedPermitsToSpend)
            + (long) (freshPermits * stableIntervalMicros);
	// 3. 把nextFreeTicketMicros往后推(如果permits不够需要等待)
    this.nextFreeTicketMicros = LongMath.saturatedAdd(nextFreeTicketMicros, waitMicros);
    // 4. 拿走permits
    this.storedPermits -= storedPermitsToSpend;
    return returnValue;
}
```

可以见到，代码还是很简单的。

不过需要注意的一点：假如`storePermits`比较小，某一个请求`requirePermits > storePermits`时，由于返回的是`nextFreeTicketMicros`旧值，从而本请求睡眠时间为0，直接返回了；不过该操作会顺延`nextFreeTicketMicros`，当下一个请求到来时，根据顺延的`nextFreeTicketMicros`，请求会睡眠一段时间，从而限制了速度。

所以可以说，在`SmoothBursty`中：

- 当`requirePermits`过大时，请求是会**预占后面的`permits`**，当前请求的速度影响较小
- 但是由于之前请求的预占，会**延长后一个请求获取`permits`的时间**，从而限制流量

> 因此，它和传统令牌桶算法有一定的区别，但大致相同

# 5. 实现：`SmoothWarmingUp`

和`SmoothBursty`不同，`SmoothWarmingUp`适用于一些需要**预热**的场景，如数据库等等。

> 例如某个服务限流1000QPS，我们不能让系统立刻达到1000QPS流量，而是逐步提高流量限制，用于预热，最后到达流量上限最大值。

从4.4.中的`reserveEarliestAvailable(int, long)`方法中，有一个方法**`storedPermitsToWaitTime(double, double)`**，它用于计算从桶中获取已有`permits`所需要的时间：

- `SmoothBursty`：返回0，即**从桶中取已有`permits`不需要等待**
- `SmoothWarmingUp`：可能返回大于0，在**预热阶段，从桶中取已有`permits`需要等待一定的时间**

这就是两者最大的不同。

不过首先，要说明一下预热的概念。

## 5.1. 预热图解

首先要上一个javadoc中的一张图：

![warming_up](https://i.loli.net/2020/01/03/CDdTwi7jhaUxRBY.png)

说明一下上图：

- 横轴：表示桶中已暂存的`permits`

  - `thresholePermits`：暂存`permits`数量的阈值。当暂存数量小于该值时，说明桶中`permits`数量少，流量大，即充分预热；当暂存数量大于该值时，说明桶中`permits`多，流量小，即可能在预热
  - `maxPermits`：暂存`permits`数量的最大值
- 纵轴：表示生成每个`permits`的时间间隔

  - `stableInterval`：预热完毕后的生成`permits`间隔
  - `coldInterval`：冷启动时的生成`permits`间隔
  - `coldFactor`：一个因子，硬编码为3，满足`stableInterval * coldFactor = coldInterval`
- `warmUpPeriod`：即上面的梯形，该面积就是“预热时长”，由此得到下面的公式：
  - `thresholdPermits = 0.5 * warmupPeriod / stableInterval`
  - `maxPermits = thresholdPermits + 2.0 * warmupPeriod / (stableInterval + coldInterval)`（根据梯形面积公式）
- 原理说明：

  - **当`storedPermits`小的时候，流量大，即预热充分**，速度也可以变快，所以生成`permits`间隔小
    - 流量重复大的时候，`storedPermits -> 0`，其生成`permits`间隔最小
  - **当`storedPermits`大的时候，流量小，即在预热中**，速度需要限制，所以生成`permits`间隔大
    - 冷启动的时候，`storedPermits = maxPermits`，其生成`permits`间隔最大

## 5.2. 创建

创建`SmoothWarmingUp`主要是调用第2节的(2),(3)这2个方法，最后都会进入下面这个方法：

```java
static RateLimiter create(
      double permitsPerSecond,
      long warmupPeriod,
      TimeUnit unit,
      double coldFactor,
      SleepingStopwatch stopwatch) {
    RateLimiter rateLimiter = new SmoothWarmingUp(stopwatch, warmupPeriod, unit, coldFactor);
    rateLimiter.setRate(permitsPerSecond);
    return rateLimiter;
}
```

而`SmoothWarmingUp`主要有下面几个字段：

- `warmupPeriodMicros`：以微秒计的预热时间
- `slope`：5.1.节图上那条直线的斜率
- `coldFactor`：值为3，意思见5.1.节
- `thresholdPermits`：之后设置速率时，会被计算，意思见5.1.节

创建`SmoothWarmingUp`实例后，会初始化上面3个变量，而最后1个变量在设置速率的时候被计算。

## 5.3. 设置流量速率

总体流程，和`SmoothBursty`一样，唯一不同的就是方法`doSetRate(double, double)`：

```java
void doSetRate(double permitsPerSecond, double stableIntervalMicros) {
    double oldMaxPermits = maxPermits;
    // 1. 根据公式计算coldIntervalMicros, thresholdPermits, maxPermits, slopes
    double coldIntervalMicros = stableIntervalMicros * coldFactor;
    thresholdPermits = 0.5 * warmupPeriodMicros / stableIntervalMicros;
    maxPermits = thresholdPermits + 2.0 * warmupPeriodMicros / (stableIntervalMicros + coldIntervalMicros);
    slope = (coldIntervalMicros - stableIntervalMicros) / (maxPermits - thresholdPermits);
    if (oldMaxPermits == Double.POSITIVE_INFINITY) {
        storedPermits = 0.0;
    } else {
        // 2. 等比更改暂存的permits数量
        storedPermits =
            (oldMaxPermits == 0.0)
                ? maxPermits // initial state is cold
                : storedPermits * maxPermits / oldMaxPermits;
    }
}
```

这里不同之处就在于利用5.2.节的公式，计算一系列参数，其它部分和`SmoothBursty`并没有什么不同。

## 5.4. 同步/重新计算桶中存放的permits个数

和`SmoothBursty`一样，首先需要`resync(long)`，当计算新增的`permits`时，会调用下面的代码：

```java
double newPermits = (nowMicros - nextFreeTicketMicros) / coolDownIntervalMicros();
```

> 注意，这个代码块内，`nowMicros > nextFreeTicketMicros`，说明流量小，在预热

注意到函数`coolDownIntervalMicros()`：

- 在`SmoothBursty`中，它直接返回了`stableIntervalMicros`（因为预热不预热都一样）

- 在`SmoothWarmingUp`中，它返回值如下代码所示，代表冷却时间间隔：

  ```java
  double coolDownIntervalMicros() {
      return warmupPeriodMicros / maxPermits;
  }
  ```

可见，在`SmoothWarmingUp`中，重新计算获取到`newPermits`会变小，也引证了预热限流的特点。

## 5.5. 获取permits/tokens

整体流程，和`SmoothBursty`一样，我们主要关注方法`reserveEarliestAvailable(int, long)`，这里回顾一下：

```java
final long reserveEarliestAvailable(int requiredPermits, long nowMicros) {
    // 1. 更新storedPermits和nextFreeTicketMicros(若很久没有获取令牌时)
    resync(nowMicros);
    // 直接返回旧的nextFreeTicketMicros
    long returnValue = nextFreeTicketMicros;
    // 当前可用的permits数(需要消费的最大permits数,不超过storedPermits)
    double storedPermitsToSpend = min(requiredPermits, this.storedPermits);
    // 需要另外获取的permits数
    double freshPermits = requiredPermits - storedPermitsToSpend;
    // 2. 计算不够的部分，需要等待多少时间
    long waitMicros =
        // 这里该方法返回0，从桶中获取permits不需要另外等待
        storedPermitsToWaitTime(this.storedPermits, storedPermitsToSpend)
            + (long) (freshPermits * stableIntervalMicros);
	// 3. 把nextFreeTicketMicros往后推(如果permits不够需要等待)
    this.nextFreeTicketMicros = LongMath.saturatedAdd(nextFreeTicketMicros, waitMicros);
    // 4. 拿走permits
    this.storedPermits -= storedPermitsToSpend;
    return returnValue;
}
```

而这里，重点关注`storedPermitsToWaitTime(double, double)`：

- 在`SmoothBursty`中，它直接返回0

- 在`SmoothWarmingUp`中，代码如下：

  ```java
  // storedPermits代表现在桶中剩下的permits
  // permitsToTake代表请求需要拿走的permits，但是不超过storePermits
  long storedPermitsToWaitTime(double storedPermits, double permitsToTake) {
      // 这里求了5.1.节曲线的定积分
      // 下界是storedPermits,上界是permitsToTake
      double availablePermitsAboveThreshold = storedPermits - thresholdPermits;
      long micros = 0;
      // 1. 求右边梯形的积分
      if (availablePermitsAboveThreshold > 0.0) {
          double permitsAboveThresholdToTake = min(availablePermitsAboveThreshold, permitsToTake);
          double length =
              permitsToTime(availablePermitsAboveThreshold)
                  + permitsToTime(availablePermitsAboveThreshold - permitsAboveThresholdToTake);
          micros = (long) (permitsAboveThresholdToTake * length / 2.0);
          permitsToTake -= permitsAboveThresholdToTake;
      }
      // 2. 求左边矩形积分
      micros += (long) (stableIntervalMicros * permitsToTake);
      // 3. 求和积分并返回，即从桶中取permits需要占用的时间(这会增加下一个请求的等待时间)
      return micros;
  }
  
  // 给定permits(x轴)，计算interval(y轴)
  private double permitsToTime(double permits) {
      return stableIntervalMicros + permits * slope;
  }
  ```

而其他情况下，`SmoothWarmingUp`和`SmoothBursty`一样。

# 6. 总结

Guava的`RateLimiter`实现主要以令牌桶算法为基础：

- 它通过预占`permits`，以影响下一个请求的等待时间（以`nextFreeTicketMicros`为锚，它会随请求往后推延，表示请求可以获得`permits`的时间）
- 桶中`permits`的添加，不需要另一个线程，只需请求过来时，根据时间戳重新计算即可

Guava有2个`RateLimiter`的实现：

- `SmoothBursty`：适用于一些突发流量来临的限流器，因为其缓存了`permits`
- `SmoothWarmingUp`：适用于一些需要预热的限流器，因为其由于保存`permits`多少，调整其生成的速度（`permits`越高，说明越冷，其生成速度越慢）
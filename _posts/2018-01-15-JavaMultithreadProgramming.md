---
layout: post
title: "Java并发知识点整理"
author: "keys961"
catalog: true
tags:
  - Java
  - Concurrency
comments: true
---

# Java 并发知识点

## Chapter 1

1. 如何减少上下文切换：无锁并发编程、CAS、使用最少线程、使用协程(单线程里实现多任务调度、维持多个任务的切换)

2. 避免死锁：避免一个线程同时获取多个锁，避免在锁内占用多个资源、尝试使用定时锁(`lock.tryLock(timeOut)`)、数据库锁必须在一个连接里加上以及释放。

## Chapter 2

1. `volatile`: 当一个线程修改变量时，其它线程都能读到这个修改的值(一致性更新)。

   两条实现原则：

   1) 触发lock前缀指令，引起处理器缓存回写到内存

   2) 一个处理器缓存回写到内存会导致其它处理器的缓存无效

   使用优化（追加到64字节）

2. `synchronized`: 效果：对于普通同步方法->锁当前实例；对于静态同步方法->锁当前类的Class对象；对于同步方法块->锁括号内配置对象。

   实现：基于Monitor。

   指令：monitorenter, monitorexit。其对象锁存在对象头中

3. 锁的类别：偏向锁->轻量级锁->重量级锁，依次升级。锁不能降级。

   偏向锁：等到竞争出现锁才会释放；适用于只有一个线程访问同步块场景。

   轻量级锁：使用CAS获得锁，若失败，则自旋获得锁；用CAS解锁，若失败，则膨胀成重量级锁；适用与同步块执行速度块，追求响应时间。

   重量级锁：线程可能阻塞；适用于追求吞吐量，同步块执行速度长的。

4. 原子性操作：1)总线锁：对总线上锁，其它处理器请求阻塞；2)缓存锁定

   Java中的实现：锁(除了偏向锁其他都是用循环CAS进入/释放锁)，循环CAS。

   CAS三大问题：1) ABA问题。A->B->A，表面无变化实际上变化，使用版本号解决，即1A->2B->3A；2)自旋，CPU开销大；3)多共享变量无法保证原子性，可通过多变量绑定成一个变量操作(`AtomicReference`类)

## Chapter 3

1. Java线程共享变量(如堆内存)在每个线程中有一个副本(如写缓冲区)。因此线程通信的时候要：更改本地副本变量并写回主内存->另一个线程读主内存更新该线程内的副本。这由JMM控制。

2. 重排序：编译器重排，指令并行重排，内存系统重排。JMM可禁用特定类型的编译器和处理器重排序，保证一致的内存可见性。

	```java
	//example a = b = 0
	P1: a = 1; x = b;
	P2: b = 2; y = a;
	//possible x = y = 0
	```
可能出现先把a写入缓冲区，然后读x，再把缓冲区写入内存，这会导致P2读出的a没有进行更新。这里内存操作进行了重排序。

3. 内存屏障：LoadLoad(确保Load1装载先于后面的装载), StoreStore(确保Store1数据先刷新到内存先于后面的存储指令), LoadStore(确保Load1装载先于装载的后续指令), StoreLoad(确保Store1数据先刷新到内存先于后面的装载指令)。其中StoreLoad拥有其它3个的效果，不过执行该屏障开销较大，因为它把所有写缓冲区数据写回内存。

4. **Happens-before: 若一个op对另一个op可见, 则2个操作有Happens-before关系,其并没有指定顺序,只要求前一个操作对后面的可见**
	
	- **程序顺序**: 一个线程内的每个操作happens-before后续的操作

	- **监视器锁**: 锁解锁happens-before于这个锁加锁

	- **`volatile`规则**: 该域的写happens-before该域的读

	- **传递性**: A -> B, B -> C => A -> C

	- **`start()`**: 其操作在该线程其它操作之前

	- **``join()``**: 其它操作发生在该线程被`join()`之前

5. 数据依赖性，出现'写'，就有依赖性(RW, WR, WW)。单处理器和单线程的指令重排遵从数据依赖性，但是多处理器多线程不被考虑。

6. as-if-serial: 单线程中不管怎么重排序最后执行结果不能改变。

7. 顺序一致性模型: 1)一个线程中的所有操作必须按照程序的顺序来执行 => 所有操作完全按照程序的顺序串行执行; 2)每个操作都必须原子执行且立即对所有线程可见。(但JMM会重排序,但保证数据依赖性,在保证执行结果正确并正确同步的前提下尽量优化)

8. `volatile`的内存语义: 

	**特性：对变量的读/写具有原子性(不包含`v++`复合操作); 对一个`volatile`的读总能看到这个变量的最后的写入。**
	
	**即第二个操作是`volatile`写,或者第一个是`volatile`读, 都不能指令重排；或者第一个是`volatile`写和第二个是`volatile`读时不能指令重排。	**

	读语义: 设置本地副本无效->从主内存读取共享变量。后面插入LoadLoad屏障(禁止下面的普通读和`volatile`读重排序),再插入LoadStore屏障(禁止下面的普通写和`volatile`读重排序);

	写语义: 强制把本地副本共享变量值刷新到主内存中。前面插入StoreStore屏障(禁止上面的普通写和下面的`volatile`写重排序),后面插入StoreLoad屏障(禁止上面的`volatile`写于下面的`volatile`读/写重排序)。

9. 锁的内存语义

	线程锁释放: 将本地副本写入主内存

	线程锁获取: 将本地副本设为无效，重新从主内存读取变量到本地副本

	公平锁: 抢占锁的顺序为先后调用lock方法的顺序依次获取锁(`ReentrantLock:tryAcquire()`),首先读`volatile`变量`state`; 解锁时调用`Sync:tryRelease()`,最后写`volatile`变量`state`.

	非公平锁(默认): 抢占锁顺序不定，谁运气好，谁就获取到锁，获取锁使用CAS以原子状态更新`state`; 释放锁和公平锁相同. (CAS实现在`sun.misc.Unsafe:compareAndSwapInt()`本地方法中实现)

10. `concurrent`包的实现: 声明共享变量为`volatile`, CAS实现同步, 使用`volatile`读写和CAS实现通信

11. `final`域的内存语义

	重排规则: 1)构造函数对`final`域的写入，该引用赋给另一个引用这两个操作不能重排; 2)初次读一个含`final`域对象的引用和随后初次读`final`域不能重排。

	写规则: JMM禁止编译器把`final`域的写重排到构造函数外并插入StoreStore屏障(在x86中被忽略)防止处理器重排到构造函数之外,即防止写逸出。

	读规则: 初次读一个含`final`域对象的引用和随后初次读`final`域不能重排，在读之前插入LoadLoad屏障(在x86也被忽略)。这确保多线程引用`final`域时，该域必被初始化了.

	//假如不同线程对数组或类似元素的写入，需要使用同步原语来保证内存的可见性

12. 线程安全的单例模式(延迟加载):

	1.double-check with `volatile`(创建对象的一系列指令会被重排序); 
	
	原理: `new Obj()`分为三个步骤:
	
	- 1: 分配空间
	
	- 2: 初始化对象(W)

	- 3: 给引用赋值(W)

	若不用`volatile`限制,那么2,3会被重排,第二个线程可能访问到的实例不是`null`, 但是没有初始化, 出现错误。而加入限制后,由于2是普通写, 3是`volatile`写,即满足第二个步骤是`volatile`写的条件,那么指令不能重排,这样解决了这个问题。 
	
	2.静态内部`InstanceHolder`类里初始化了静态的`instance`，这里利用了`ClassLoader`机制(初始化锁)，只允许一个线程进行初始化。

## Chapter 4 

1. 线程优先级从1~10，默认为5. 调度策略/算法在不同OS/JVM上有差异

2. 线程状态: `NEW, RUNNABLE, BLOCKED, WAITING, TIME_WAITING, TERMINATED`,可用`jstack`查看线程状态

3. 守护线程: 用作程序中的后台调度和支持工作。当JVM不存在非守护线程时, JVM会退出。所以不能依靠`finally`块在守护线程中清理资源。

4. `Thread`类使用`init()`初始化线程，调用`start()`启动线程。

5. 线程中断: 调用`interrupt()`方法,设置中断位为1,但是否中断取决于线程自身的处理(线程检查自身是否被中断来响应); `isInterrupt()`判断是否中断,但抛出`InterruptedException`前会将中断位清除。

6. 终止线程: 使用中断或者`volatile`条件变量。不要用`stop()`这种不安全的终止方式。

7. Monitor进入流程: Enter->失败:进入同步队列->收到Exit通知出队再次竞争Moniter

8. 等待/通知机制: `wait()`: 等待，可设置超时，释放对象锁; `notify[All]()`: 随机唤醒/唤醒全部等待的线程。这些在共享的变量中操作，首先要持有该变量的锁，等待/通知操作要成对出现。

9. 管道输入/输出流: `PipeIn/OutputStream`, `PipeReader/Writer`。使用的时候需要绑定，即将输出流和输入流绑定(调用`connect()`方法，把out->in, 输入流可以读输出流的内容),绑定只要一侧调用就行了,即只需`out.connect(in)`或`in.connect(out)`,2个功能相同。

10. `join()`: 等待子线程完成后再继续. 实现: 获取子线程`class`锁->判断是否`isAlive()`,若依旧存活则等待。线程终止后会调用自身的`notifyAll()`方法。

11. `ThreadLocal<T>`: 为每一个线程维护变量的副本,隔离线程之间数据访问的冲突(如并发访问`SimpleDateFormat`,并发访问数据库`Connection`[从连接池获取]),设计思路为以空间换时间.实现是维护一个`ThreadLocalMap`,key为线程,value为设置的值.

12. 例子: 线程池: (本质:生产者-消费者模型) 维护一个列表(放置提交的任务线程),维护一个列表(放置已启动的线程,它会获取列表中的提交的任务并执行)

## Chapter 5

1. 在`finally`块中释放锁。`lock()`:阻塞不可中断式; `tryLock()`:非阻塞式,可设置超时; `lockInterruptibly()`:阻塞可中断式

2. AQS: 队列同步器(使用模板设计模式)。必须使用3个方法更改/查看状态:`getState(), setState(), compareAndSetState()`.在锁中聚合了同步器,用其实现锁语义. 可重写一系列方法，提供一些列模板方法。

3. AQS实现:

	- 同步队列:一个FIFO双向队列,一个线程获取同步状态失败时会被封装成`Node`插入队尾(使用CAS),线程阻塞;头节点是获取同步状态成功的节点,同步状态释放时唤醒后继节点让其尝试获取同步状态,若获取成功则将其设置为头节点(不用CAS)

	- 独占式获取/释放: `aquire()`获取,对中断不敏感。首先进入`tryAcuiqure()`获取(获取和释放通常用自旋CAS)->不成功,进入`addWaiter(Node.EXCLUSIVE)`通过死循环CAS将节点插入队尾->进入`acquireQueued()`自旋尝试获取同步状态(只有前驱节点是头节点才会去获取),若获取到同步状态则设置其为头节点并退出；`release()`释放,调用`tryRelease()`释放同步状态,并唤醒后继节点获取同步状态。

	- 共享式获取/释放: `acquireShared()`获取,首先进入`tryAcquireShared()`获取(参数为`state`递减的数量,参考信号量)->不成功则进入`doAcquireShared()`创建节点(`Node.SHARED`)并自旋->若前驱结点是头节点则尝试获取同步状态,成功就退出; `releaseShared()`释放,进入`tryRelease()`释放锁并唤醒后续等待节点(使用CAS,因为释放同步状态的操作会同时来自多个线程)

	- 独占超时获取: 调用`doAcquireNanos()`获取,支持响应中断(抛异常),不断自旋递减`nanosTimeout`判断是否超时,获取同步状态类似(当`nanosTimeout`很小时会进入快速自旋以保证精确性)。

4. `ReentrantLock`重入锁: 多次执行相同的`lock()`不会错误地阻塞线程。

	- 公平/非公平锁: 前者先来先到(CAS前还要判断队列是否还有前驱结点,若有则表明还需要等待),后者是不满足的(只要CAS成功就获取到同步状态);前者减少饥饿,后者性能更高。

	- 重进入: 获取:首先判断是否获取到,若是,则再次成功获取,计数自增; 释放:计数自减,到0的时候表明完全释放。(本质还是信号量一套)

5. 读写锁(`ReadWriteLock`,实现有`ReentrantReadWriteLock`)

	- 获取/释放读/写锁:`readLock()`, `writeLock()`获取读/写锁并通过`lock()`,`unlock()`上锁/解锁，并且可以通过一些方法来获取读/写锁被获取的状态.读是Shared, 写是Excluded.

	- 实现:维护一个位向量,高16位为读状态、低16位为写状态.

	- 写锁:获取:当读锁被获取或被其他线程获取写锁->等待,否则写状态增加(CAS);释放:类似于`ReentrantLock`.

	- 读锁:获取:若有写锁被其他线程获取->等待,否则总是成功获取读锁,读状态增加(CAS);释放:利用CAS减小读状态(减去1<<16)

	- 锁降级:先获取写锁,再获取读锁,最后释放原来的写锁,剩下的就是读锁,锁等级下降.

6. `LockSupport`:用于阻塞/唤醒线程

	- `park(), parkNanos(), parkUntil()`:阻塞当前线程(可设置时间),当调用`unpark()`或线程中断(或超时)才会返回
	
	- `unpark()`:唤醒处于阻塞的线程

7. `Condition`接口: 类似于`pthread_cond_t`,要和锁绑定.

	- 使用:先调用锁上的`newCondition()`获取条件变量。等待:先获取锁,然后调用`await()`陷入等待,此时会释放掉锁,等待被`signal()`后重新获取锁,从`await()`中返回; 激活:先获取锁,然后调用`signal()/signalAll()`最后释放锁。

	- 实现: 等待队列(FIFO),更改队列没用CAS因为调用`await/signal()`前必须获得锁,因此线程已经安全; 等待时将同步器的同步队列头节点放到条件变量的尾节点(释放锁->`park()`),激活时将等待队列的头节点放到同步队列的尾节点(让等待线程等待被同步器移到头节点并调用`LockSupport.unpark()`激活以获取锁),而`signalAll()`则把等待队列的所有节点全部移到了同步器的同步队列中。

## Chapter 6

1. **`ConcurrentHashMap`:锁分段技术提升并发访问率**

	(弱一致, `Hashtable`:强一致)	

	- 组成:`ConcurrentHashMap<K,V>`聚合了`Segment<K,V>`,而`Segment<K,V>`继承`ReentrantLock`(即每个`segment`代表一个锁)并聚合了`HashEntry<K,V>`的表,使用分离链表法

	- 初始化:

	1)`segment`长度是2^n个且不小于`concurrencyLevel`;

	2)`segmentShift`和`segmentMask`用于散列算法使用.`sshift=ssize从1左移位次数`,`segmentShift=32-sshift`,`segmentMask=ssize-1`;

	3)每个`segment`的`HashEntry`长度为不小于`initialCapacity/ssize`的最小的2^n,容量为长度*`loadFactor`,默认`initialCapcity=16,loadFactor=0.75`;

	4)定位`Segment`,使用Wang/Jenkins hash变种算法对元素的`hashCode()`进行复合散列

	- 操作:

	1)`get()`:不需要加锁(共享变量都是`volatile`,如段大小`count`,`HashEntry`的`value`,以保证读的不过期),但是**弱一致**(在`put`一个新`Entry`,即`new HashEntry()`时,指令会重排,导致读到没有初始化的数据,参考3.12节)

	2)`put()`:定位到`segment`->上锁->在`segment`插入并解锁。若要扩容(即插入前先判断数量超过了`threshold`容量),只对`segment`扩容,容量扩大到原来的2倍并进行再散列
	
	3)`size()`:先尝试2次通过不锁`segment`方式统计大小,若2次值不相同则采用加锁方式统计大小,然后累加.(结果依旧有可能不可靠)。一种可靠的办法就是统计`size`前后比较`modCount`是否变化(`put`,`remove`等操作会自加这个变量)来判断容器大小是否发生改变

2. `ConcurrentLinkedQueue`:使用CAS非阻塞实现线程安全

	- 入队:定位尾节点:`tail`可能不是尾节点,也可能是`tail.next`;设置入队节点为尾节点:使用CAS更新,调用`casNext(null, n)`;HOPS:减少`tail`更新频率,并不将其每次都设为尾节点,只有当`tail`与尾节点的距离大于HOP值(默认1)才更新.

	- 出队:定位头节点,依旧使用HOPS减少更新`head`的消耗,`head`不一定是头节点,然后通过CAS更新头节点并出队

3. 阻塞队列(`BlockingQueue`)

当队列满,插入阻塞;当队列空,则取出阻塞(支持超时操作)

JDK实现:`ArrayBlockingQueue`(有界),`LinkedBlockingQueue`(有界), `PriorityBlockingQueue`(无界), `DelayQueue`(无界,优先级,延迟), `SynchronousQueue`(不存储元素), `LinkedTransferQueue`(无界), `LinkedBlockingDeque`(双向).默认使用非公平访问.

原理:使用通知模式实现.当消费者消费元素后会通知生产者当前队列可用,反过来也是一样.JDK使用2个`Condition`变量实现(`notFull`,`notEmpty`)(通过信号量也可以实现,原理相同),底层使用`pthread_mutex_t`和`pthread_cond_t`实现

4. `Fork/Join`框架

	- 思想:分治法(分割->合并,递归思想)

	- Work-stealing算法:干完活的线程帮助其他线程干活,窃取对方任务队列的任务执行。窃取的任务永远在队列的尾部。它充分利用了线程进行并行云散,减少线程间竞争;但任务较少时,消耗了不必要的资源。

	- 使用:1)`ForkJoinTask`任务,可继承`RecursiveAction`(无返回值)或`RecursiveTask`(有返回值);2)`ForkJoinPool`来执行任务。
	- 步骤是:创建任务->扔到`ForkJoinPool`中执行(`submit()`)->任务中创建子任务并调用`fork()`启动子任务->调用子任务的`join()`来获取子任务结果->最外层用`Future<T>`接收结果

	- 异常处理:不能再主线程捕获异常,提供`isCompletedAbnormally()`和`getException()`检查是否正常运行和获取异常

	- 原理: `fork()`:异步执行任务(`pushTask()`,放入任务队列中,再用`ForkJoinPool`的`signalWork()`激活任务),返回这个任务的引用;`join()`:阻塞并获取结果(`doJoin()`),任务状态有4种:`NORMAL`,`CANCELED`(抛`CancellationException`),`SIGNAL`,`EXCEPTIONAL`(抛对应异常)

## Chapter 7

1. 原子更新基本类型:`AtomicBoolean`,`AtomicInteger`,`AtomicLong`,更新使用CAS,提供懒惰更新,可能导致更改对其他线程不可见

2. 原子更新数组:`AtomicInteger/Long/ReferenceArray`,构造时会复制一份数组,调用`getAndSet(index, value)`修改,内部使用CAS

3. 原子更新引用类型:`AtomicReference`,`AtomicReferenceFieldUpdater`,`AtomicMarkableReference`,依旧用CAS修改

4. 原子更新字段类:`AtomicIntegerFieldUpdater`,`AtomicLongFieldUpdater`,`AtomicStampedReference`,使用`newUpdater()`获取更新器并保证更新的字段是`public volatile`

## Chapter 8

1. `CountDownLatch`:允许一个/多个线程等待其他线程完成操作.

	其接受一个整数N作为计数器(即等待N个线程完成),当调用`countDown()`将计数器减1,并且随后要调用`await()`阻塞线程直到计数器为0后阻塞消除。

2. `CyclicBarrier`:可循环屏障。让一组线程到达屏障并阻塞,直到最后一个到达后阻塞消除。调用`await()`阻塞(直到最后一个到达同步点)。可设置当线程到达屏障后优先执行的动作。

	- `CountDownLatch`和`CyclicBarrier`区别:
	
		1. 前者一次性,后者可调用`reset()`重复使用

		2. 前者减计数,后者加计数

		3. 后者提供更加有用的方法,如获得阻塞线程数,判断阻塞线程是否被中断等等,并可设置屏障解除后第一步的工作。

3. `Semaphore`:信号量。(P=`acquire()`, V=`release()`)

4. `Exchanger`:用于线程间交换数据。双方分别调用`exchange()`方法可将传入的数据交换(即A调用传入a,B调用传入b,那么A会接收到b且B也接收到a). 若只有一方调用`exchange()`,线程阻塞.

## Chapter 9

1. 线程池好处:降低资源消耗,提高响应速度,提高线程可管理性

2. 线程池组件: `corePool`核心线程池, `workQueue`阻塞任务队列, `maximumPool`最大线程池,`rejectedExecutionHandler`拒绝执行处理器

3. 线程池处理流程: 

	- 若核心线程池没满,创建新线程到核心线程池,执行任务(最开始叫做预热,执行完后,会反复`poll/take`队列里的任务执行)

	- 若核心线程池满了,将任务加入阻塞队列`workQueue`

	- 若阻塞队列满了,则创建新线程到最大线程池,执行任务

	- 若最大线程池已满,拒绝执行并被不同策略处理

	- 默认在最大线程池中的线程若空闲超时,则被关闭;核心线程池中的线程也可以设置

4. 线程池创建(`ThreadPoolExecutor`),指定`corePoolSize`,`maximumPoolSize`, `keepAliveTime`, `timeUnit`, `taskQueue`, `threadFactory`,`errorHandler`即可。任务队列选择阻塞队列(最好有界);而饱和拒绝策略提供4种,也可以自定义.

5. 提交任务: `execute()`:提交`Runnable`,`submit()`:提交,可返回结果(`Future<T>`)

6. 关闭线程池: `shutdown()`,`shutdownNow()`:遍历工作中的线程并中断它们.前者是中断,后者直接停止.`isShutdown()`返回`true`,但是`isTerminated()`只会当线程全关闭后才会返回`true`

7. CPU密集型:线程数小点;IO密集型:线程数大些。

## Chapter 10

1. `Executor`三大部分:任务(`Runnable/Callable`),任务的执行(`Executor/ExecutorService`),异步计算结果(`Future/FutureTask`,后者实现了`Runnable`和`Future`接口)

2. `Executor`成员:

	- `ThreadPoolExecutor`:使用工厂类`Executor`创建,分为3种:`FixedThreadPool`,`SingleThreadExecutor`,`CachedThreadPool`

	- `ScheduledThreadPoolExecutor`:周期性执行任务,使用工厂类`Executor`创建。常用有2种:`ScheduledThreadPoolExecutor`,`SingleThreadScheduledExecutor`

	当我们把任务提交`submit`到这些`Executor`中会返回`FutureTask`的结果,可以获得最后任务的结果(获取结果是阻塞/同步式的)

3. `FixedThreadPool`:`coreSize`&`maxSize`都设为一样的固定值,队列是有界的,空闲线程会立即停止.
	
	运行流程:若当前运行线程数小于`coreSize`,创建新线程;预热后,任务加入队列;运行线程完成任务后,反复从队列中获取任务执行.

4. `SingleThreadExecutor`:`coreSize`&`maxSize`为1,其他流程和`FixedThreadPool`一样

5. `CachedThreadPool`:`coreSize`为0(默认不预热线程),`maxSize`为最大值,`timeAlive`为1分钟(即线程执行完会等待60s等待队列中的任务,若有则取出执行,若超时了还没有就关闭线程),队列无界.

6. `ScheduledThreadPoolExecutor`:周期性执行任务。队列使用无界的`DelayQueue`,任务(`ScheduledFutureTask`)获取方式不同,执行周期任务后会有额外处理。

	- 传入的任务是`ScheduledFutureTask`,初始化需要指定执行时间,序列号,间隔(执行顺序:优先时间小,序号小的)

	- 执行流程:传入任务到队列->从队列获取任务(可能阻塞)->执行任务->修改执行时间到下一个周期->把任务添加回队列

7. `FutureTask`:继承了接口`Runnable`&`Future`.

	- 获取结果使用`get()`,若任务没完成,则会阻塞;

	- 取消任务使用`cancel()`,若任务没启动->任务不会执行,任务已启动->调用`cancel(true)`中断线程,任务已完成->调用返回`false`(即无法取消)

	- 使用:可交给`executor`执行也可以通过`ExecutorService.submit()`提交,都会返回`FutureTask`以获取结果
	
	- 实现:基于AQS。下面是对于某个`FutureTask`,多线程访问该对象的说明(可见P401中的例子):

		`get()`:调用AQS的`acquireSharedInterruptibly()`方法,首先判断`acquire()`是否能成功(即任务已完成或者取消,任务不为空),若成功则直接返回,否则到AQS的等待队列中(当前线程阻塞)去等待其他线程执行`release()`操作;其他线程执行`release()`(如`run(),cancel()`)会唤醒队列中的第一个线程,再次尝试再次获取,若成功则离开等待队列并唤醒它的后续线程;最后线程返回`get()`结果

		`run()`:执行任务,然后以CAS更新状态,更新成功则调用AQS的`releaseShared()`以唤醒等待队列的第一个线程;最后调用`done()`表明任务完成


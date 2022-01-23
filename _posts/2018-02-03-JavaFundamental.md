---
layout: post
title: "Java Fundamental"
author: "keys961"
catalog: true
tags:
  - Java
comments: true
---

# Java 基础(可用于JAD课程的<del>预</del>复习资料

1. Java Source Code(`.java`) -> 编译成Bytecode(`.class`) -> 解释器运行在JVM上

2. 标识符可以以`$`开头，长度不限。`true`, `false`不是关键字。

3. `final`: 对象引用不可更改/方法不可重写/类不可被继承/初始化抑制指令重排序

4. `byte`在算数运算时提升为`int`；`char`代表UTF-16字符，占2个字节；字面量溢出会导致编译错误

5. 注意`&&`和`||`的短路；`switch`支持`char`, `byte`, `short`, `int`, `String`以及`Enum`。

6. 二维数组的某位度长度可以不一样

7. `Arrays`可以向上转换但不能向下转换

8. 让GC回收内存：可让引用赋为`null`。强引用：平时我们使用的，不会被回收，宁愿抛出OOM异常；软引用(`SoftReference<T>`)：用于实现缓存，还有用但非必需的对象，在OOM之前，会将其列进回收范围内进行二次回收，若还没有足够内存，才抛出OOM；弱引用(`WeakReference<T>`)：典型用途就是规范化映射，GC运行时如果碰到了弱可及对象，直接回收，不过可能要运行多次；虚引用(`PhantomReference<T>`)。

9. 不可变类：`String`, 基本类型包装类, `BigInteger`, `BigDecimal`等

10. `String`类进行`concat`操作时，底层使用`StringBuilder`

11. 自动拆装箱 & `intern()`：

    - `valueOf()`：装箱；`xxValue()`：拆箱；
    - `-128 == new Integer(-128)`：返回`true`因为拆箱
    - `new Integer(0) == new Integer(0)`：`false`，引用不同
    - `Integer.valueOf(-128) == Integer.valueOf(-128)`：`true`，因为常量池缓存-128~127，另外`Byte Short Long Character Boolean`也被缓存
    - 三元运算符会自动拆箱，假如两种类型都是合法的
    - `String`的字面量第一次出现时会被编译器优化(或手动`intern()`,若常量池中不存在，则添加到常量池中)到常量池(位于堆中，原来在方法区)，再次出现时直接指向常量池存储的对象即可
    - `StringBuiler`:线程不安全；`StringBuffer`: 线程安全

12. 枚举：是单例，继承于`Emun<E extends Enum<E>>`。枚举类型无法被继承和克隆。本质上是`int`值，可通过`ordinal()`方法得到(从0计数)。可通过`valueOf()`获得枚举实例。

13. 重载：参数列表必须不同（其它都可改变），方法可在子类重载。**调用是静态的，即编译期确定**。

14. 重写：子类不能降低可访问权限。若类加了`final`，等价于所有的方法都修饰了`final`。

15. 静态方法不能被重写，因为**静态方法在编译期和具体的类绑定在一起(即静态方法调用是静态的)**，若子类也有相同的静态方法，超类的被隐藏；无法被访问的方法也不能被重写，若两个方法签名相同，它们并不相关。

16. 内部类：

    - 内部类：对于外部类来说是“local”的，可以相互访问对方的私有成员和方法(内部类与外部类，内部类与内部类，因为有外部类的引用)。内部类调用函数/成员时，优先使用内部类的，若要使用外部的则使用`OuterClass.this.xx`。内部类不能被重写。
    - 静态内部类：除了不能访问外部类的对象和实例方法（因为没有外部类的`this`引用，其它都一样；但是当它被静态方法中构造，或者含有静态变量时，必须声明为静态类
    - 局部内部类：只能在对应的方法内实例化，且不能访问所在方法内的非`final`参数(JDK 1.7及以前，为了保证局部变量生命周期和内部类对象的生命周期一样长，1.8以后可以访问非`final`的)。只能由`abstract, final`修饰
    - 匿名内部类：例: GUI的`ActionListener`添加，可通过`lambda`函数代替(`([type] o1, ...)->{ //procedure & return val }/(return val)`)

17. 接口在1.7中只能有：静态常量(`static final`)和公共抽象方法(`public abstract`)；1.8中允许：默认方法(`default`)和静态方法(`static`)；1.9中允许：私有方法(`private`)。`Clonable`, `Serializable`均为`Marker Interface`。

18. IoC本质上通过反射技术实现。

19. 错误结构图：`Throwable <- Exception & Error <-(Exception)RuntimeException & Other Exceptions`, 除了`RuntimeException`(建议守护线程捕捉它)，其它的`Exception`都要被检查，否则报编译错误。

20. 当异常抛出的时候，若没有被捕捉(`catch`)或在`catch`块中抛出新异常，那么后面的代码（不包括`finally`块,即`finally`是要执行的）都不会执行。若被捕捉，`finally`块以及后面的代码肯定被执行(除非调用`System.exit()`强制退出)，且前面由返回，返回值会被`finally`覆盖(或引用被修改)。 ->`finally`块必被执行

21. Java中的Stream I/O使用装饰者模式，默认是阻塞/同步的.(NIO可为异步/非阻塞的)

22. `transient`保证成员不被序列化；需要序列化的类需要配备`serialVersionUID`，否则序列化/反序列化会失败

23. 当对象拥有`writeObject()`方法时，序列化时优先调用该方法(可先调用`defaultWriteObject()`)；同理反序列化也一样

24. 保证序列化/反序列化的单例，需要添加`readResolve()`方法返回单例

25. 静态泛型方法的签名格式：`static <T> RetType FuncName(T arg, ...)`

26. 泛型的通配符: `?`: 无限定通配符；`? entends T`: `?`必须是`T`子类；`? super T`: `?`必须是`T`超类。

    例子：有方法`static void print(Pair<? extends Employee> p)`,那么可以传入参数`p: Pair<Manager>`，假如没有通配符就会报错。（同样可以用于返回值上）

27. 参数化类型没有实际类型参数的继承关系！

28. 泛型参数在运行时被擦除，所以不同类型参数的同一个泛型类只有一个`class`文件被加载到JVM中

    - `inst instanceof Cls<T>`是错误的因为JVM中没有存储`Cls<T>`类而只存储了`Cls`类；
    - 不能调用`new T()`，可传入`Class<T>`通过反射创建新实例；
    - 不能创建泛型数组，可用`(T[]) new Object[N]`规避；
    - 不允许`Cls<T>[] list = new Cls<T>[N];`，但可以`(Cls<T>[])new Cls[N]`
    - 静态上下文(静态方法、数据域和初始化语句)中不允许使用和该泛型类相同参数的泛型变量，因为泛型参数在实例化时才能决定，而静态方法无需实例化就能使用。
    - 异常不能是泛型，因为运行时泛型参数不被识别

29. `Class<T>`就是`T.class`，所以不同的`T`，`Class<T>`不兼容

30. **成员加载顺序**：父类静态代码域(静态变量, 静态块. 按照代码顺序)->子类静态代码域->父类成员代码域(实例变量, 普通块. 按照代码顺序)->父类构造方法->子类成员代码域->子类构造方法

---

## 其他细节

1. `String`是不变类,其返回的修改字符串方法原串没有改变

2. `equals()`方法默认比较地址是否相同

3. 方法中要抛出异常到上层,方法必须修饰`throws`(多异常逗号分割) ,否则不过编译

4. 若子类能被序列化但父类不能,反序列化子类的时候,父类必须有无参构造函数且这个构造函数会被调用

5. 大量不必要`import`影响编译速度但不影响运行速度

6. `InputStream`的`read()`每次读1字节,返回该字节的ASCII码;`read(byte[])`读尽量多的字节,返回读取字节数;若读到末尾都返回EOF(-1)

7. 构造函数不能递归调用;`Integer`等不可变类不可以作为异常被抛出

8. 若继承`Thread`类,重写`run`(不是`start`,否则启动的只是一个普通方法而非新线程),启动用`start`,它会调用`run`(重写的或者`Runnable`的)

9. `C<T1>`和`C<T2>`无任何关系,编译器两者不能相互赋值,不管`T1`,`T2`其有无继承关系

10. 默认的`clone()`是浅拷贝

---

## 拓展部分

1. 网络:	TCP:服务端`ServerSocket`,`accept()`创建当前连接的`Socket`;客户端使用`Socket`即可;可从`Socket`得到`Input/OutputStream`通信,同步的。URL:创建`URL`对象并调用`openStream()`获得输入流。UDP:使用`DatagramSocket`和`DatagramPacket`通信(`send/receive()`)

2. `Statement`:`conn.createStatement()`,然后`executeQuery/Update(SQL)`执行SQL,返回`ResultSet/int`,结果集列下标从1计数。`PreparedStatement`:`conn.prepareStatement(SQL)`,用`?`通配符,然后往里面塞值,下标从1开始,然后执行`executeQuery/Update()`;事务处理:`setAutoCommit()-默认true`,`commit()`,`rollback()`。`DatabaseMetadata`:数据库元数据;批处理:`addBatch(SQL)`,`executeBatch()`;`ResultSet`可设置Scrollable,修改它会更新数据库数据

---

1. ​fast-fail & fast-safe:迭代时前者检查元素数量是否保持一致性,若没有则抛异常(`ConcurrentModificationException`),用于普通的集合类;后者迭代时使用一个副本迭代,元素数量变化时不会抛异常,用于JUC包集合

2. 迭代器`Iterator`可以对集合元素进行迭代,删除元素必须通过迭代器的`remove()`方法而不是集合的`remove()`方法.它只能向前迭代,而其子类`ListIterator`可以双向迭代.而`Enumeration`是旧的迭代器,速度快,但不安全且不能删除元素.

3. `HashMap`:

	- 维护一个`Entry<K,V>`数组(`K`可为`null`,在`Hashtable`中不可以),使用分离链表法处理冲突.当分离链表过长(>8)会将链表转化为红黑树,过短则恢复为链表.插入节点在链表头部.

	- Hash表初始容量16,加载因子0.75.当条目过多超过负载因子则进行Rehash,Hash表扩大到原来的2倍.
	
	- 判断Key:先比较Hash值(`hashCode()`),再比较`equals()`(遍历链表).相同Hash值的Key再同一条链表上.

	- `keySet()`:使用迭代器(`HashIterator`,而`Hashtable`是用`Enumeration`迭代)从Hash表上到下遍历所有的Key,根据插入规则其顺序是无序的.(而`LinkedHashMap`是按照插入的顺序的,因为这里面的`Entry<K,V>`还维护了一个双向链表记录插入顺序)

4. `LinkedList`实际上是双向链表,而`ArrayList`底层是数组(默认10,可扩容到原来的2倍,需复制数据,对基本数据类型要装箱)

5. `TreeMap`:底层实现是红黑树,所以维持了有序性.

6. `PriorityQueue`:无界优先队列,底层实现是二叉堆.

7. `finalize()`:在GC回收前被调用,因此不能保证其肯定被调用.而它主要用途是收集特殊渠道申请的内存(如Native方法申请的).

8. JDK7以前的永久代通常放方法区里含有的东西比如字节码(类的方法),类元数据,常量信息,JVM内部对象,JIT优化信息.它一般不会被GC,若超限了则触发Full-GC,此时永久代会被GC.

9. 串行的GC适合于小规模的,基于吞吐量的GC通常采用并行版本,适用于中大规模的.

10. 异常处理完成后异常对象会被GC.

11. `Class.forName()`:加载并初始化指定类到虚拟机,返回对应`Class`对象.

12. JDK8中的`CallableStatement`:继承`PreparedStatement`,使用`conn.prepareCall()`创建,提供了一种以标准形式调用已存储过程的方法,还增加了调用数据库中的存储过程和函数以及设置输出类型参数的功能.

13. NIO

	- 核心:`Channel`,`Buffer`,`Selector`

	- `Channel`:实现有`FileChannel`(阻塞),`DatagramChannel`,`[Server]SocketChannel`(文件,UDP,TCP).可以异步读写,单双工.通道的数据要读入`Buffer`或者从`Buffer`中写入,可配置其未非阻塞/阻塞的通道.(`getChannel()`获取`Channel`,`channel.read(buf)`从`channel`读数据到`buffer`,`channel.write(buf)`把`buffer`数据写入`channel`,此外可以用`transferFrom/To()`实现通道间数据传输)

		- **对于网络`Channel`,需要注意:连接时可能没完成连接就返回了,需要循环等待其完成(`finishConnect()`);写时可能没写东西就返回,所以要循环调用`write()`把缓冲区全写出(配合`hasRemaining()`);读时可能没有读出任何数据,需要关注它的返回值.**

	- `Buffer`:缓冲区.

		- 三个属性:`capacity`(固定大小,能装载的元素容量),`position`(写模式下数据的最后一个位置,读模式下读取的当前位置),`limit`(写模式下决定能写多少数据,等于`capacity`,读模式下设置为写模式的`position`值)

		- 使用:使用静态工厂分配(`allocate(capacity)`),`put()`写数据,`get()`读数据,`hasRemaining()`在都模式下判断是否有剩余数据.

		- `flip()`:将写模式切换成读模式.`position`设为0,`limit`设为原来的`position`

		- `rewind()`:将`position`设为0,其他不变(用于重读).

		- `clear()`:`position`设为0,`limit`设为`capacity`,表明缓冲区被清空(实际上数据还是存在的)

		- `compact()`:将未读数据拷贝到起始处,`position`设为未读数据最后一个后面,`limit`设为`capacity`,表明后面的空间可以准备接收数据

		- `mark()`&`reset()`:标记`position`和恢复`position`,配套使用.

	- `Selector`:单个线程可管理多个`Channel`.调用`Selector.open()`打开通道,调用`channel.register()`将通道注册到`selector`上(通道必须非阻塞,`selector`可监听读/写/连接/接受等事件),调用`select()`可获取已经就绪的通道的数量(阻塞),调用`selectKeys()`返回`SelectionKey`的集合,即已经就绪通道集合,可通过`key.channel()`获取对应通道,**注意处理后必须将这个`key`从集合中移除**.

---

## Java Web部分

1. `Servlet`:

	- 体系结构:`Servlet`<-`GenericSevlet`(`service()`需要被实现)<-**`HttpServlet`**,提供服务时是单例多线程(注意线程安全)

	- 方法(加载和实例化->`init()`->`service()`->`destroy()`):
		
		- `init()`:初始化`Servlet`对象到容器

		- `service()`:处理请求,对于`HttpServlet`先会获取请求的方法然后分派到不同的`doXX()`处理请求(GET,POST,PUT,DELETE等)

		- `destroy()`:生命周期结束时释放资源

	- `HttpServlet`:`GET`参数在URL中,即在头部; `POST`参数在体部,用&连接.

	- `[Http]ServletRequest`:表明客户端的[Http]请求,内容就是客户端发送的Http或者其他协议的报文.

	- `[Http]ServletResponse`:表明返回客户端的[Http]响应,对于非Http默认类型text/plain,对于Http默认类型为text/html.首先它会将数据写到缓冲区,然后再发送(缓冲区满,被刷新或者输出流被关闭).
		
		- Http响应:头部(包含状态码,更多的响应信息)+体部(响应的内容)

		- `redirect`和`forward`:前者创建一个新请求然后重定向,后者保留原请求转发到另一个目标上.

	- `ServletConfig`:初始化`Servlet`对象时会创建该对象,包含了`Servlet`初始化参数信息.(`GenericServlet`实现了该接口)

	- `ServletContext`:`Sevlet`与容器之间直接通信的接口.每个Web应用由唯一的`ServletContext`对象(被该应用所有`Servlet`共享).如可以获取当前Web应用的资源(如URL入口,应用范围内的context-param等),获取服务端文件系统资源(如获取文件系统路径等)

2. JSP

	- 请求&处理过程:客户端发起请求->将JSP编译(仅编译一次,被动编译且可预编译)转化成`Servlet`->调用`_jspservice()`并返回响应给客户端

	- JSP指令:使用`<%@ %>`

		- `page`指令,位于顶端,属性有如`language`(脚本语言),`import`(导入的类库),`contentType`(编码格式),`session`(是否参与会话),`errorPage`(若出错转发到指定的错误页面),`isErrorPage`(是否作为错误页面,若可以则可以使用`exception`变量),`isThreadSafe`(默认线程安全,不要改动)

		- `include`指令,指定`file`属性,静态导入页面,将JSP合并了.(而`<jsp:include>`是动态导入,它临时转发请求到被导入的JSP中,输出的响应结果再返回给原来的JSP中,并结合)

		- `taglib`指令,引入标签库

	- JSP脚本:使用`<% %>`代码被嵌入`jspservice()`方法中.

	- JSP声明:使用`<%! %>`代码被嵌入类中,是全局的.

	- JSP表达式:使用`<%= %>`,等号左边是`out`,将结果输出到页面上.

	- JSP标签:使用`<jsp:xx>`,可以说`include`,`forward`,`useBean`(声明一个Bean),`getProperty`,`setProperty`等

	- 内置对象:

		- `request`&`response`:请求和响应

		- `session`:会话,只有当`page`指令中`session`字段为`true`才能使用(默认为真)

		- `out`:`JspWriter`实例,用于输出响应内容

		- `application`:`ServletContext`实例,`Sevlet`与容器之间直接通信的接口.每个Web应用的所有`Servlet`&`JSP`共享.

		- `config`:`ServletConfig`实例,可用于访问该JSP Servlet配置信息,如初始化参数

		- `pageContext`:`PageContext`实例.可用于获取请求特性,会话特性,访问请求和响应,包含其他文件,转发请求.

		- `page`:代表了该JSP Servlet对象的`this`变量.可强转为`Servlet`,`JspPage`,`HttpJspPage`

		- `exception`:类型为`Throwable`,当page指令的`isErrorPage`为真时可以使用.


3. Session & Cookie

	- Session:会话,用来记录客户端状态,内容保存在服务端.服务端会将Session ID(JSESSIONID)发给客户端然后客户端再次访问的时候将ID给服务端,服务端通过这个ID获取状态信息.

		实现:

		- Cookie:发送Session ID的Cookie,客户端再次请求时将该Cookie发送给服务端,然后服务端再从自己那里获取客户端状态信息.

		- URL重写:将Session ID写到URL地址中然后通过解析方法获取这个ID.可用`response.encodeURL(url)`实现地址重写

		- 表单隐藏字段,较少用(类比csrf字段)

	- Cookie:服务器给客户端发送一块消息,客户端会将其存储,然后再次访问时将Cookie内容放到请求的头部中,以实现HTTP从无状态到有状态.此外Cookie不能跨域(因为有domain字段).字段有:domain,path,content,expire,secure.

	- 区别:前者放在服务端,后者放在客户端;前者较安全,但占服务器性能,后者不安全,但减轻了服务端压力;前者可存任何对象,后者由容量限制(3KB).

4. Filter

	- 生命周期:创建实例->`init()`->`doFilter(req,resp,chain)`->`destroy()`.`Filter`成链,如果放行则使用`chain.doFilter(req,resp)`将请求传入下一个`Filter`中.

	- `FilterConfig`:获取`Filter`初始化参数.

	- 配置:在web.xml中添加`<filter>`和`<filter-mapping>`,并且指定URL或者指定`Servlet`,优先级从上到下,并且优先匹配URL.(或者`@WebFilter`注解)
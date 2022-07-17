---
layout: post
title: "大量CLOSE_WAIT排查"
author: "keys961"
comments: true
catalog: true
tags:
  - C++
  - Network
---

# 1. 症状

客户端大量连接打入服务端后，客户端马上关闭，然后再建立连接时，没有收到服务端任何的相应，最后报错超时。

服务端会有一个判断，当连接数量过多时（`accept()`后的连接数），会主动关闭新`accept()`的连接。

此时客户端发现连接被主动挂断，会主动退出程序。

# 2. 观察到的状态

## 2.1. `netstat`

首先第一个就是查连接状态，发现了大量的`CLOSE_WAIT`连接。

```bash
# netstat -natp | grep 8080 | grep CLOSE_WAIT 
tcp 46 0 127.0.0.1:8080 127.0.0.1:51004 CLOSE_WAIT - 
tcp 46 0 127.0.0.1:8080 127.0.0.1:51000 CLOSE_WAIT - 
tcp 46 0 127.0.0.1:8080 127.0.0.1:50990 CLOSE_WAIT - 
tcp 46 0 127.0.0.1:8080 127.0.0.1:50998 CLOSE_WAIT - 
tcp 46 0 127.0.0.1:8080 127.0.0.1:50996 CLOSE_WAIT - 
tcp 46 0 127.0.0.1:8080 127.0.0.1:50994 CLOSE_WAIT - 
tcp 46 0 127.0.0.1:8080 127.0.0.1:50992 CLOSE_WAIT - 
tcp 46 0 127.0.0.1:8080 127.0.0.1:51002 CLOSE_WAIT - 
```

熟悉四次握手的话，可以知道：

1. 主动端发送一个`FIN`，从`ESTABLISH -> FIN_WAIT_1`，被动端收到后从`ESTABLISH -> CLOSE_WAIT`

2. 被动端发送一个`ACK`，主动端收到后从`FIN_WAIT_1 -> FIN_WAIT_2`

3. 被动端再发送一个`FIN`（调用一次`close()`），从`CLOSE_WAIT -> LAST_ACK`，主动端从`FIN_WAIT_2 -> TIME_WAIT`

4. 主动端发送一个`ACK`，被动端收到后关闭，主动端等待2倍MSL后关闭

可知，被动端第3步没做，即遗留了连接没有调用`close()`，那出现在哪一端？

## 2.2. `lsof`

通过`lsof`查看进程打开的文件描述符，发现服务端没有`CLOSE_WAIT`的连接。

```bash
server 88324 root 3u a_inode 0,12 0 12326 [eventpoll] 
server 88324 root 4u a_inode 0,12 0 12326 [eventfd] 
server 88324 root 6u IPv4 14939805 0t0 TCP localhost:8080 (LISTEN) 
... Other ESTABLISHED connections 
```

难道`CLOSE_WAIT`连接出现在客户端？但客户端已经挂了，不太可能啊，事实上是这样吗？

## 2.3. `ss`

通过`ss`，查看一下accept队列的情况：

```bash
# ss -ntlip '( sport == 8080 )' 

State Recv-Q Send-Q Local Address:Port Peer Address:Port Process 
LISTEN 24 511 127.0.0.1:8080 0.0.0.0:* users:(("server",pid=88324,fd=6)) 
cubic cwnd:10 unacked:8 
```

发现accept队列里有8个连接没处理，数量和`CLOSE_WAIT`连接的数量相同，这就很奇怪了。

这里就有推测，已有的连接在accept队列里，但客户端马上退出，而这些连接一直没有被服务端`accept()`。

## 2.4. `tcpdump`抓包

这里对`CLOSE_WAIT`的连接抓包。

```bash
# 连接建立 
02:10:37.258319 IP localhost.51046 > localhost.8080: Flags [S], seq 68230391, win 65495, options [mss95,sackOK,TS val 2035158581 ecr 0,nop,wscale 7], length 0 
02:10:37.258330 IP localhost.8080 > localhost.51046: Flags [S.], seq 629648772, ack 68230392, win 65483, options [mss 65495,sackOK,TS val 2035158581 ecr 2035158581,nop,wscale 7], length 0 
02:10:37.258338 IP localhost.51046 > localhost.8080: Flags [.], ack 1, win 512, options [nop,nop,TS val 2035158581 ecr 2035158581], length 0 
# 应该是客户端直接意外退出 
02:10:46.733172 IP localhost.51046 > localhost.8080: Flags [F.], seq 1, ack 1, win 512, options [nop,nop,TS val 2035168055 ecr 2035158581], length 0 
02:10:46.733352 IP localhost.8080 > localhost.51046: Flags [.], ack 2, win 512, options [nop,nop,TS val 2035168056 ecr 2035168055], length 0 
```

可以发现，`CLOSE_WAIT`的连接，在客户端退出前，就已经被建立了，并且是由客户端主动发起的。

所以，可以推测，连接的泄露发生在服务端，且泄露的连接保存在了accept队列里，没有被处理。（注意：accept队列保存的是已经建立三次握手的连接）

## 2.5. `gdb`查看进程

可以看到，进程一直卡在`epoll_wait`里没出来，留着accept队列没有处理，符合2.4.的推测。

## 2.6. 主动再建立连接

这里再主动建立连接，此时有1个已经建立的连接。

> 这里的配置是，服务端只允许建立1个连接。测试前，已经建立了1个连接。然后客户端测试程序开始大量连接向服务端建立。

通过`netstat`, `ss`等工具，可以看到：

- `CLOSE_WAIT`的连接变少了1个

- accept队列的数量没少

并且通过打日志，看到已有的1个最早的`CLOSE_WAIT`连接被`accept()`，并且马上被`close()`。

然后退出新建立的连接，可以看到`CLOSE_WAIT`的连接增加了1个，accept队列数量没变，就是刚刚建立的连接。

至此，原因大致清楚了。

# 3. 原因

从上面的探测，可以知道：

- 连接的泄露发生在服务端

- `CLOSE_WAIT`连接留在了accept队列里，没被处理

再查看代码，大概是这样的，且`listen_fd`也通过ET注册在`epoll`中：

```cpp
void accept_new_conn() {
  while(true) {
     // ...
     auto fd = accept(...); 
     if(fd != -1) {
        if(conn_count >= limit) {
           close(fd);
           return; // <--- Bug
        }        
        // handle new connection
     } else {
        if(errno == EWOULDAGAIN || errno == EAGAIN) {
            return; // retry
        }
        // handle error...
     }
  }
}
```

当连接超过数量，主动关闭的时候，就直接返回了，导致遗留已经`ESTABLISHED`的连接在accept队列没处理。

此时客户端退出，由于服务端使用ET，就不会被唤醒再处理accept队列的连接，而此时里面的连接变成了`CLOSE_WAIT`，出现了2.1.的现象。

而新连接来的时候，程序被唤醒，旧的`CLOSE_WAIT`被`accept()`后又被`close()`，此时`conn_count >= limit`依旧成立，又直接返回了，遗留的accept队列的连接又没被处理。所以新连接就卡住了。

# 4. 解决方案

1. `listen_fd`注册`epoll`时，从ET变成LT，从而accept队列非空时，依旧能被唤醒，处理里面的连接。

2. 将上面的`return`换成`continue`，从而能够继续处理accept队列里的连接。

# 5. 总结

还是得熟悉`epoll`编程，特别是ET的处理。

此外TCP连接关闭的流程也得回顾回顾。
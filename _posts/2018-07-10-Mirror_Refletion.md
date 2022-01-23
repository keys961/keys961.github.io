---
layout: post
title: "Leetcode - Mirror Reflection"
author: "keys961"
comments: true
typora-root-url: ./
catalog: true
tags:
  - Algorithm
---

LeetCode上的一题，题目是：

> There is a special square room with mirrors on each of the four walls.  Except for the southwest corner, there are receptors on each of the remaining corners, numbered `0`, `1`, and `2`.
>
> The square room has walls of length `p`, and a laser ray from the southwest corner first meets the east wall at a distance `q` from the `0`th receptor.
>
> Return the number of the receptor that the ray meets first.  (It is guaranteed that the ray will meet a receptor eventually.)

本垃圾数学不太好，所以只想出了暴力遍历的办法。但是涉及浮点数，怕丢精度而造成程序错误。

想不出其它办法，参考了Discussion的思路，感觉非常好。

我们只要往上作一个虚的矩形，然后让反射线路透过这个虚矩形，一直往上延伸，那么上面那个镜像和下面反射线路等效，如下图：

![img](https://s3-lc-upload.s3.amazonaws.com/users/motorix/image_1529877876.png)

上图中0号接收器在右下角处，同样也在虚矩形的右上角处。

所以，先要求出`p`和`q`的最小公倍数`m`。

- 当`m / q`为奇数时，即只发生了偶数次反射，最后落点在右侧，此时需要考虑`p`
  - 当`m / p`为奇数时，答案是`1`
  - 当`m / p`为偶数时，答案是`0`
- 当`m / q`为偶数时，只可能在左侧，且`m / p`也不可能是偶数，所以答案是`2`
- 边界条件：`q = 0 => Answer is 0 `

所以代码如下：

```java
class Solution
{
    public int mirrorReflection(int p, int q) 
    {
        if(q == 0)
            return 0;
        
        int m = findLCM(p, q);
        
        if(m / q % 2 == 0)
            return 2;
        if(m / p % 2 == 0)
            return 0;
        return 1;
    }
    
    private int findLCM(int p, int q)
    {
        return p * q / findGCD(p, q);
    }
    
    private int findGCD(int p, int q)
    {
        if(q != 0)
            return findGCD(q, p % q);
        return p;
    }
}
```


---
layout: post
title: "设计模式"
author: "keys961"
catalog: true
tags:
  - Design Pattern
comments: true
---

​       怠惰地终于稍微刷一遍设计模式一书，代码也略微小小的实现了一下，只实现了非常简单的功能，非常简陋，不过重点还是在各个类和接口的设计上。
这书的确给了新手的我一些设计指导，估计可以减少我写代码时感到无从下手的几率。
但是要深入了解精髓还是得多码代码，多在实战中练习。

​        书上的代码是用C++和Smalltalk，仓库的代码是Java，由于语言的某些限制（主要有单继承、泛型擦除、不支持友元等等），类结构可能会有变化。

​        设计模式共有5 + 7 + 11 = 23个，分为3类，如下所示（附有总结，可能有错）：

- **Creational Patterns**
    - [Abstract Factory](https://github.com/keys961/Design-Pattern/blob/master/src/org/yejt/maze/Abstract%20Factory.md)
    - [Builder](https://github.com/keys961/Design-Pattern/blob/master/src/org/yejt/mazebuilder/Builder.md)
    - [Factory Method](https://github.com/keys961/Design-Pattern/blob/master/src/org/yejt/mazefactory/Factory%20Method.md)
    - [Prototype](https://github.com/keys961/Design-Pattern/blob/master/src/org/yejt/mazeprototype/Prototype.md)
    - [Singleton](https://github.com/keys961/Design-Pattern/blob/master/src/org/yejt/singleton/Singleton.md)
- **Structural Patterns**
    - [Adapter](https://github.com/keys961/Design-Pattern/blob/master/src/org/yejt/adapter/Adapter.md)
    - [Bridge](https://github.com/keys961/Design-Pattern/blob/master/src/org/yejt/bridge/Bridge.md)
    - [Composite](https://github.com/keys961/Design-Pattern/blob/master/src/org/yejt/composition/Composite.md)
    - [Decorator](https://github.com/keys961/Design-Pattern/blob/master/src/org/yejt/decorator/Decorator.md)
    - [Facade](https://github.com/keys961/Design-Pattern/blob/master/src/org/yejt/facade/Facade.md)
    - [Flyweight](https://github.com/keys961/Design-Pattern/blob/master/src/org/yejt/flyweight/Flyweight.md)
    - [Proxy](https://github.com/keys961/Design-Pattern/blob/master/src/org/yejt/proxy/Proxy.md)
- **Behavioral Patterns**
    - [Chain of Responsibility](https://github.com/keys961/Design-Pattern/blob/master/src/org/yejt/chain/ChainOfResponsibility.md)
    - [Command](https://github.com/keys961/Design-Pattern/blob/master/src/org/yejt/command/Command.md)
    - [Interpreter](https://github.com/keys961/Design-Pattern/blob/master/src/org/yejt/interpreter/Interpreter.md)
    - [Iterator](https://github.com/keys961/Design-Pattern/blob/master/src/org/yejt/iterator/Iterator.md)
    - [Mediator](https://github.com/keys961/Design-Pattern/blob/master/src/org/yejt/mediator/Mediator.md)
    - [Memento](https://github.com/keys961/Design-Pattern/blob/master/src/org/yejt/memento/Memento.md)
    - [Observer](https://github.com/keys961/Design-Pattern/blob/master/src/org/yejt/observer/Observer.md)
    - [State](https://github.com/keys961/Design-Pattern/blob/master/src/org/yejt/state/State.md)
    - [Strategy](https://github.com/keys961/Design-Pattern/blob/master/src/org/yejt/strategy/Strategy.md)
    - [Template Method](https://github.com/keys961/Design-Pattern/blob/master/src/org/yejt/template/TemplateMethod.md)
    - [Visitor](https://github.com/keys961/Design-Pattern/blob/master/src/org/yejt/visitor/Visitor.md)

**Codes are rewritten in Java and referenced from:**

- _Design Patterns: Elements of Reusable Object-Oriented Software_
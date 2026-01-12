# PlantUML 测试示例

## 1. 序列图 - 用户登录流程

```plantuml
@startuml
participant 用户
participant 前端
participant 后端
participant 数据库

用户 -> 前端: 输入账号密码
前端 -> 前端: 表单验证
前端 -> 后端: POST /login
后端 -> 数据库: 查询用户信息
数据库 --> 后端: 返回用户数据
后端 -> 后端: 验证密码
后端 --> 前端: 返回 Token
前端 --> 用户: 登录成功
@enduml
```

## 2. 类图 - 电商系统

```plantuml
@startuml
class User {
  -id: Long
  -username: String
  -email: String
  +login()
  +logout()
}

class Order {
  -orderId: Long
  -orderDate: Date
  -totalAmount: BigDecimal
  +createOrder()
  +cancelOrder()
}

class Product {
  -productId: Long
  -name: String
  -price: BigDecimal
  +getDetails()
}

class OrderItem {
  -quantity: int
  -price: BigDecimal
}

User "1" --> "*" Order: 下单
Order "1" --> "*" OrderItem: 包含
OrderItem "*" --> "1" Product: 关联
@enduml
```

## 3. 用例图 - 在线购物系统

```plantuml
@startuml
left to right direction
actor 用户
actor 管理员

rectangle 在线购物系统 {
  usecase "浏览商品" as UC1
  usecase "搜索商品" as UC2
  usecase "加入购物车" as UC3
  usecase "下单" as UC4
  usecase "支付" as UC5
  usecase "管理商品" as UC6
  usecase "查看订单" as UC7
}

用户 --> UC1
用户 --> UC2
用户 --> UC3
用户 --> UC4
用户 --> UC5
用户 --> UC7

管理员 --> UC6
管理员 --> UC7

UC4 ..> UC3 : include
UC4 ..> UC5 : include
@enduml
```

## 4. 活动图 - 订单处理流程

```plantuml
@startuml
start
:接收订单;
:验证库存;
if (库存充足?) then (是)
  :锁定库存;
  :生成订单;
  if (支付成功?) then (是)
    :确认订单;
    :发货;
    :更新库存;
    :订单完成;
  else (否)
    :取消订单;
    :释放库存;
  endif
else (否)
  :通知用户缺货;
endif
stop
@enduml
```

## 5. 状态图 - 订单状态流转

```plantuml
@startuml
[*] --> 待支付 : 创建订单

待支付 --> 已支付 : 支付成功
待支付 --> 已取消 : 超时或取消

已支付 --> 待发货 : 商家确认
已支付 --> 退款中 : 申请退款

待发货 --> 已发货 : 商家发货
待发货 --> 退款中 : 申请退款

已发货 --> 已签收 : 确认收货
已发货 --> 退货中 : 拒收退货

已签收 --> 已完成 : 自动完成
已签收 --> 售后中 : 申请售后

退款中 --> 已退款 : 退款成功
退货中 --> 已退款 : 退货成功
售后中 --> 已完成 : 售后结束

已取消 --> [*]
已退款 --> [*]
已完成 --> [*]
@enduml
```

## 6. 组件图 - 微服务架构

```plantuml
@startuml
package "前端层" {
  [Web应用]
  [移动应用]
}

package "网关层" {
  [API网关]
}

package "服务层" {
  [用户服务]
  [订单服务]
  [商品服务]
  [支付服务]
}

package "数据层" {
  database "用户DB"
  database "订单DB"
  database "商品DB"
}

[Web应用] --> [API网关]
[移动应用] --> [API网关]

[API网关] --> [用户服务]
[API网关] --> [订单服务]
[API网关] --> [商品服务]
[API网关] --> [支付服务]

[用户服务] --> [用户DB]
[订单服务] --> [订单DB]
[商品服务] --> [商品DB]
@enduml
```

## 7. 部署图 - 系统部署架构

```plantuml
@startuml
node "Web服务器" {
  [Nginx]
  [静态资源]
}

node "应用服务器集群" {
  [App Server 1]
  [App Server 2]
  [App Server 3]
}

node "数据库服务器" {
  database "MySQL主库" as db1
  database "MySQL从库" as db2
}

node "缓存服务器" {
  [Redis集群]
}

cloud "CDN" {
  [全球节点]
}

[用户] --> [CDN]
[CDN] --> [Nginx]
[Nginx] --> [App Server 1]
[Nginx] --> [App Server 2]
[Nginx] --> [App Server 3]

[App Server 1] --> db1
[App Server 2] --> db1
[App Server 3] --> db1

db1 --> db2 : 主从复制

[App Server 1] --> [Redis集群]
[App Server 2] --> [Redis集群]
[App Server 3] --> [Redis集群]
@enduml
```

## 8. 时序图 - 复杂支付流程（带分组）

```plantuml
@startuml
participant 用户 as U
participant 商户系统 as M
participant 支付网关 as P
participant 银行 as B
participant 风控系统 as R

autonumber

== 支付请求阶段 ==
U -> M: 提交订单
activate M
M -> M: 生成订单号
M -> R: 风控检查
activate R
R --> M: 检查通过
deactivate R

M -> P: 创建支付请求
activate P
P -> P: 生成支付流水号

== 支付处理阶段 ==
P --> U: 返回支付页面
deactivate P
U -> P: 输入支付信息
activate P
P -> B: 请求扣款
activate B

alt 余额充足
  B -> B: 扣款成功
  B --> P: 扣款成功通知
  P -> M: 支付成功回调
  M -> M: 更新订单状态
  M --> U: 支付成功
else 余额不足
  B --> P: 扣款失败
  P --> U: 支付失败
  deactivate B
end

deactivate P
deactivate M

== 异步通知阶段 ==
P -> M: 异步通知（最多3次）
activate M
M --> P: 确认收到
deactivate M
@enduml
```

## 9. 对象图 - 订单实例关系

```plantuml
@startuml
object "订单001" as order1 {
  订单号 = "ORD20260109001"
  总金额 = 299.00
  状态 = 已支付
  创建时间 = 2026-01-09 10:00
}

object "商品A" as prod1 {
  商品名称 = "无线鼠标"
  价格 = 99.00
  库存 = 50
}

object "商品B" as prod2 {
  商品名称 = "机械键盘"
  价格 = 200.00
  库存 = 30
}

object "订单项1" as item1 {
  数量 = 2
  小计 = 198.00
}

object "订单项2" as item2 {
  数量 = 1
  小计 = 200.00
}

object "用户张三" as user1 {
  用户ID = 10001
  姓名 = 张三
  等级 = VIP
}

user1 --> order1
order1 --> item1
order1 --> item2
item1 --> prod1
item2 --> prod2
@enduml
```

## 10. 包图 - 模块依赖关系

```plantuml
@startuml
package "表现层" {
  package "Web控制器" {
    [UserController]
    [OrderController]
    [ProductController]
  }
  package "API接口" {
    [UserAPI]
    [OrderAPI]
  }
}

package "业务逻辑层" {
  package "服务层" {
    [UserService]
    [OrderService]
    [ProductService]
  }
  package "业务规则" {
    [PriceCalculator]
    [InventoryManager]
  }
}

package "数据访问层" {
  package "数据仓储" {
    [UserRepository]
    [OrderRepository]
    [ProductRepository]
  }
  package "数据映射" {
    [UserMapper]
    [OrderMapper]
  }
}

package "基础设施层" {
  [缓存管理]
  [日志服务]
  [消息队列]
}

[UserController] ..> [UserService]
[OrderController] ..> [OrderService]
[ProductController] ..> [ProductService]

[UserService] ..> [UserRepository]
[OrderService] ..> [OrderRepository]
[ProductService] ..> [ProductRepository]

[OrderService] ..> [PriceCalculator]
[OrderService] ..> [InventoryManager]

[UserRepository] ..> [UserMapper]
[OrderRepository] ..> [OrderMapper]

[UserService] ..> [缓存管理]
[OrderService] ..> [日志服务]
[ProductService] ..> [消息队列]
@enduml
```

## 11. 特殊字符测试 - 中文标点和符号

```plantuml
@startuml
class "用户管理类" as User {
  + 用户名：String
  + 邮箱：String
  + 注册时间：DateTime
  --
  + 登录（）：Boolean
  + 注销（）：void
  + 修改密码（旧密码、新密码）：Boolean
}

class "订单类【核心】" as Order {
  # 订单号：String
  # 金额：Decimal
  # 状态：枚举
  --
  + 创建订单（商品列表）
  + 取消订单（原因）
  + 计算总价（）：Decimal
}

note right of User
  用户权限说明：
  1、普通用户
  2、VIP用户
  3、管理员
end note

note left of Order
  订单状态：
  • 待支付
  • 已支付
  • 已完成
  • 已取消
end note

User "1" -- "*" Order : 下单 >
@enduml
```

## 12. 时序图 - 分布式事务（Saga模式）

```plantuml
@startuml
participant "订单服务" as O
participant "库存服务" as I
participant "支付服务" as P
participant "积分服务" as S
participant "事务协调器" as C

autonumber

O -> C: 发起Saga事务
activate C

C -> O: 执行：创建订单
activate O
O --> C: 订单创建成功
deactivate O

C -> I: 执行：扣减库存
activate I
I --> C: 库存扣减成功
deactivate I

C -> P: 执行：处理支付
activate P

alt 支付成功
  P --> C: 支付成功
  deactivate P
  
  C -> S: 执行：增加积分
  activate S
  S --> C: 积分增加成功
  deactivate S
  
  C -> O: 事务完成通知
  deactivate C

else 支付失败
  P --> C: 支付失败
  deactivate P
  
  note over C: 开始补偿事务
  
  C -> I: 补偿：恢复库存
  activate I
  I --> C: 库存恢复成功
  deactivate I
  
  C -> O: 补偿：取消订单
  activate O
  O --> C: 订单取消成功
  deactivate O
  
  C -> O: 事务回滚通知
  deactivate C
end
@enduml
```

## 13. 类图 - 设计模式示例（观察者模式）

```plantuml
@startuml
interface Observable {
  + attach(observer: Observer): void
  + detach(observer: Observer): void
  + notify(): void
}

interface Observer {
  + update(subject: Observable): void
}

class ConcreteObservable implements Observable {
  - observers: List<Observer>
  - state: int
  + getState(): int
  + setState(state: int): void
}

class ConcreteObserverA implements Observer {
  - observableState: int
}

class ConcreteObserverB implements Observer {
  - observableState: int
}

Observable <.. Observer
ConcreteObservable --> Observer : notifies
@enduml
```

## 14. 活动图 - 用户注册流程（含泳道）

```plantuml
@startuml
|用户|
start
:输入注册信息;
:提交表单;

|系统|
:接收注册请求;
:验证数据格式;

if (格式正确?) then (是)
  :检查用户名;
  if (用户名已存在?) then (是)
    |用户|
    :显示用户名已存在;
    stop
  else (否)
    |系统|
    :检查邮箱;
    if (邮箱已注册?) then (是)
      |用户|
      :显示邮箱已注册;
      stop
    else (否)
      |系统|
      :创建用户记录;
      :发送验证邮件;
      
      |邮件服务|
      :发送邮件;
      
      |用户|
      :收到验证邮件;
      :点击验证链接;
      
      |系统|
      :激活账户;
      :显示注册成功;
      stop
    endif
  endif
else (否)
  |用户|
  :显示格式错误;
  stop
endif
@enduml
```

## 15. 简单测试 - 最小化示例

```plantuml
@startuml
A -> B: 消息
B --> A: 响应
@enduml
```

## 16. 复杂测试 - 多层嵌套状态图

```plantuml
@startuml
state "系统运行" as running {
  state "正常模式" as normal {
    state "空闲" as idle
    state "工作中" as working
    idle --> working : 接收任务
    working --> idle : 任务完成
  }
  
  state "维护模式" as maintenance {
    state "备份数据" as backup
    state "更新系统" as update
    backup --> update : 备份完成
    update --> [*] : 更新完成
  }
  
  normal --> maintenance : 进入维护
  maintenance --> normal : 维护完成
}

state "系统故障" as error {
  state "诊断中" as diagnose
  state "修复中" as repair
  diagnose --> repair : 定位问题
  repair --> [*] : 修复完成
}

[*] --> running
running --> error : 发生故障
error --> running : 恢复正常
running --> [*] : 关闭系统
@enduml
```

---

## 测试说明

### 基础功能测试
将上述任意代码块复制到金山文档中，UML Render 扩展应该能够：
1. 自动识别 PlantUML 代码（包含 `@startuml` 或 `participant`、`class` 等关键字）
2. 调用 PlantUML 服务器渲染为图片
3. 在代码块下方显示渲染后的 UML 图表
4. 支持点击放大和复制到剪贴板

### 测试重点

#### 1. 类型覆盖测试
- 示例 1-6：常见图表类型
- 示例 7-14：更复杂的图表类型
- 示例 15：极简示例
- 示例 16：复杂嵌套示例

#### 2. 特殊字符测试（示例 11）
测试中文标点和特殊符号：
- 全角标点：：、。【】（）
- 中文符号：•
- 数学符号：>

#### 3. 性能测试
- 单个复杂图表渲染时间
- 多个图表同时渲染
- 页面滚动时的响应速度

#### 4. 边界测试
- 示例 15：最简单的图表
- 示例 16：高度复杂的嵌套结构
- 示例 8、12：带大量注释和分组

### 调试建议

测试过程中：
1. 打开浏览器控制台（F12）查看日志
2. 关注识别阶段的日志（是否找到关键字）
3. 关注编码阶段的日志（编码是否成功）
4. 关注渲染阶段的日志（图片是否加载成功）
5. 如果图片加载失败，复制 URL 直接访问查看错误信息

# NIHPLOD 官网改版计划书

> 版本：1.0  
> 日期：2024年12月  
> 状态：📝 规划中

📎 **相关文档**：[PRD](./NIHPLOD-PRD.md) | [UX](./NIHPLOD-UX.md) | [技术栈](./NIHPLOD-TechStack.md) | [API](./NIHPLOD-API.md) | [数据库](./NIHPLOD-Database.md)

---

## 一、项目背景

### 1.1 改版目标

当前 NIHPLOD 官网为品牌展示网站，仅提供第三方购买链接（天猫、京东、小红书等）。为提升用户体验、增强用户粘性、建立私域流量，计划进行以下改版：

1. **支持官网直接购买** - 建立自有电商能力，减少对第三方平台依赖
2. **用户账号系统** - 建立用户体系，为后续运营提供基础
3. **AI 护肤顾问追问功能** - 增强 AI 顾问交互性，提升用户参与度
4. **积分/点数体系** - 通过购买奖励机制，提升复购率

### 1.2 现状分析

| 模块 | 现状 | 目标状态 |
|------|------|----------|
| 用户系统 | 仅有管理员账号 | 完整的 C 端用户体系 |
| 购买方式 | 第三方外链（天猫、京东等） | 官网直购 + 第三方外链并存 |
| AI 顾问 | 单次问答 → 结果页 | 支持追问对话 |
| 用户激励 | 无 | 点数系统（购买奖励 + 消耗追问） |

---

## 二、改版内容总览

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           改版架构图                                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌──────────────┐     ┌──────────────┐     ┌──────────────┐           │
│   │   Phase 1    │     │   Phase 2    │     │   Phase 3    │           │
│   │  用户基础系统  │ ──▶ │ 点数+AI追问  │ ──▶ │  购物核心    │           │
│   └──────────────┘     └──────────────┘     └──────────────┘           │
│          │                    │                    │                    │
│          ▼                    ▼                    ▼                    │
│   • 注册/登录            • 点数系统           • 购物车                  │
│   • 微信授权             • AI追问功能         • 订单系统                 │
│   • 个人中心             • 对话历史           • 库存管理                 │
│   • 地址管理             • 点数规则           • 购买得点数               │
│                                                    │                    │
│                                                    ▼                    │
│                                            ┌──────────────┐            │
│                                            │   Phase 4    │            │
│                                            │  支付与履约   │            │
│                                            └──────────────┘            │
│                                                    │                    │
│                                                    ▼                    │
│                                            • 支付集成                   │
│                                            • 物流对接                   │
│                                            • 售后服务                   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 功能优先级

| 优先级 | 功能 | 说明 |
|--------|------|------|
| P0 | 用户注册/登录 | 所有功能的基础 |
| P0 | 点数系统 | AI 追问的前置条件 |
| P0 | AI 追问功能 | 核心差异化功能 |
| P1 | 购物车 + 订单 | 官网直购核心 |
| P1 | 支付集成 | 交易闭环必需 |
| P2 | 物流对接 | 提升履约体验 |
| P2 | 售后服务 | 完善购物流程 |

---

## 三、Phase 1：用户基础系统

### 3.1 功能清单

| 模块 | 功能 | 优先级 | 说明 |
|------|------|--------|------|
| **注册/登录** | 手机号+验证码 | P0 | 国内用户主要方式 |
| | 微信授权登录 | P1 | 需微信开放平台配置 |
| | 登录态管理 | P0 | JWT + HttpOnly Cookie |
| **个人中心** | 基本信息 | P0 | 头像、昵称、手机号 |
| | 信息编辑 | P1 | 修改昵称、头像 |
| | 点数余额 | P0 | 展示及变动记录入口 |
| **地址管理** | 地址 CRUD | P0 | 新增/编辑/删除/设默认 |
| | 省市区选择 | P0 | 三级联动组件 |

### 3.2 页面设计

```
/login                    # 登录页（手机号 + 微信）
/user                     # 个人中心首页
/user/profile             # 个人资料编辑
/user/addresses           # 收货地址管理
/user/points              # 点数明细
/user/orders              # 订单列表（Phase 3）
/user/conversations       # AI 对话历史（Phase 2）
```

### 3.3 API 设计

```
# 认证相关
POST   /api/auth/send-code        # 发送短信验证码
POST   /api/auth/login            # 手机号登录/注册
POST   /api/auth/wechat           # 微信授权登录
POST   /api/auth/logout           # 退出登录
GET    /api/auth/me               # 获取当前用户

# 用户信息
PUT    /api/user/profile          # 更新个人资料
POST   /api/user/avatar           # 上传头像

# 地址管理
GET    /api/user/addresses        # 地址列表
POST   /api/user/addresses        # 新增地址
PUT    /api/user/addresses/:id    # 更新地址
DELETE /api/user/addresses/:id    # 删除地址
PUT    /api/user/addresses/:id/default  # 设为默认
```

---

## 四、Phase 2：点数系统 + AI 追问

### 4.1 点数规则设计

#### 获取点数

| 场景 | 点数 | 条件 | 说明 |
|------|------|------|------|
| 新用户注册 | +10 | 首次注册 | 注册奖励 |
| 完成首次问卷 | +5 | 首次完成 AI 诊断 | 引导完成诊断 |
| 购买产品 | +消费额×1% | 订单完成 | 每 100 元得 1 点 |
| 分享诊断结果 | +2 | 每日上限 1 次 | 鼓励传播 |

#### 消耗点数

| 场景 | 点数 | 说明 |
|------|------|------|
| AI 追问 | -2/次 | 每次追问消耗 |
| 深度分析报告 | -5/次 | 可选增值功能（预留） |

### 4.2 AI 追问功能设计

```
┌─────────────────────────────────────────────────────────────┐
│                   AI 护肤顾问 - 结果页                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  📊 您的肌肤分析报告                                          │
│  ├─ 肤质：混合偏油                                           │
│  ├─ 主要关注：毛孔粗大、T区出油                               │
│  └─ 推荐产品：云朵洁面慕斯、修护紧致精华...                    │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│  💬 追问 AI 顾问                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 👤: 我的T区出油严重，有什么针对性建议吗？             │    │
│  │ 🤖: 针对T区出油，我建议您：                          │    │
│  │     1. 早晚使用云朵洁面慕斯，重点按摩T区             │    │
│  │     2. 每周使用1-2次匀衡磨砂膏深层清洁               │    │
│  │     3. 日间使用轻透防晒霜，避免厚重产品...           │    │
│  │                                                      │    │
│  │ 👤: 这款精华和面霜可以一起用吗？                     │    │
│  │ 🤖: 完全可以搭配使用！建议护肤顺序为：              │    │
│  │     洁面 → 精华 → 面霜 → 防晒（日间）              │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌─────────────────────────────────────┬─────────────┐      │
│  │ 输入您的护肤问题...                  │  发送 💎2   │      │
│  └─────────────────────────────────────┴─────────────┘      │
│                                                              │
│  💎 剩余点数: 18          [购买产品获取更多点数 →]            │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 🔒 登录后可使用追问功能              [立即登录]      │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 4.3 API 设计

```
# 点数相关
GET    /api/user/points              # 点数余额及统计
GET    /api/user/points/records      # 点数变动记录

# AI 追问相关
POST   /api/advisor/conversation           # 创建对话
POST   /api/advisor/conversation/:id/chat  # 发送追问
GET    /api/advisor/conversations          # 对话历史列表
GET    /api/advisor/conversation/:id       # 对话详情
```

### 4.4 AI 追问 Prompt 设计

```markdown
## 系统提示词

你是 NIHPLOD（旎柏）的专业护肤顾问，正在与用户进行追问对话。

### 用户背景
- 肤质类型：{skinProfile.typeLabel}
- 主要关注：{skinProfile.concerns}
- 肌肤年龄：{skinProfile.skinAge}
- 推荐产品：{recommendedProducts}

### 回答规则
1. 回答专业、简洁，控制在 150 字以内
2. 优先推荐 NIHPLOD 产品，说明使用方法
3. 如问题超出护肤范畴，礼貌引导回护肤话题
4. 语气温暖贴心，像一位专业的闺蜜
5. 可适当引用品牌理念："每一次护肤，都是爱的传递"

### NIHPLOD 产品线
- 云朵洁面慕斯（温和清洁）
- 匀衡磨砂膏（深层清洁，每周1-2次）
- 臻萃修护面膜（密集修护，每周2-3次）
- 修护紧致精华（抗老紧致）
- 逆龄面霜（滋养保湿）
- 轻透防晒霜（日间防护）
- 臻萃护理油（加强滋养）
```

---

## 五、Phase 3：购物核心系统

### 5.1 功能清单

| 模块 | 功能 | 优先级 | 说明 |
|------|------|--------|------|
| **购物车** | 添加商品 | P0 | 产品页/推荐页添加 |
| | 修改数量 | P0 | 增减、直接输入 |
| | 删除商品 | P0 | 单个/批量删除 |
| | 金额计算 | P0 | 实时合计 |
| **库存** | 库存字段 | P0 | Product 模型扩展 |
| | 库存校验 | P0 | 下单时校验 |
| | 库存扣减 | P0 | 支付成功后扣减 |
| **订单** | 创建订单 | P0 | 购物车 → 订单 |
| | 订单列表 | P0 | 用户订单历史 |
| | 订单详情 | P0 | 商品、物流、状态 |
| | 取消订单 | P1 | 未支付可取消 |

### 5.2 订单状态流转

```
┌──────────┐    支付成功    ┌──────────┐    发货     ┌──────────┐
│  PENDING │ ────────────▶ │   PAID   │ ─────────▶ │ SHIPPED  │
│  待支付   │               │  已支付   │            │  已发货   │
└──────────┘               └──────────┘            └──────────┘
     │                                                   │
     │ 超时/取消                                          │ 签收
     ▼                                                   ▼
┌──────────┐                                       ┌──────────┐
│CANCELLED │                                       │DELIVERED │
│  已取消   │                                       │  已签收   │
└──────────┘                                       └──────────┘
                                                        │
                                                        │ 确认/超时
                                                        ▼
                                                  ┌──────────┐
                                                  │COMPLETED │
                                                  │  已完成   │
                                                  └──────────┘
```

### 5.3 购买获得点数逻辑

```typescript
/**
 * 订单完成后奖励点数
 * 规则：每消费 100 元获得 1 点
 */
async function rewardPointsForOrder(orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });

  // 计算奖励点数（向下取整）
  const points = Math.floor(Number(order.payAmount) / 100);

  if (points > 0) {
    // 更新用户点数
    const user = await prisma.user.update({
      where: { id: order.userId },
      data: {
        points: { increment: points },
        totalPoints: { increment: points },
      },
    });

    // 记录点数变动
    await prisma.pointRecord.create({
      data: {
        userId: order.userId,
        type: 'PURCHASE_REWARD',
        amount: points,
        balance: user.points,
        description: `订单 ${order.orderNo} 消费奖励`,
        relatedId: order.id,
      },
    });
  }
}
```

### 5.4 API 设计

```
# 购物车
GET    /api/cart                  # 获取购物车
POST   /api/cart                  # 添加商品
PUT    /api/cart/:id              # 更新数量
DELETE /api/cart/:id              # 删除商品
DELETE /api/cart                  # 清空购物车

# 订单
POST   /api/orders                # 创建订单
GET    /api/orders                # 订单列表
GET    /api/orders/:id            # 订单详情
PUT    /api/orders/:id/cancel     # 取消订单
PUT    /api/orders/:id/confirm    # 确认收货

# 管理端
GET    /api/admin/orders          # 订单管理列表
PUT    /api/admin/orders/:id/ship # 发货
```

---

## 六、Phase 4：支付与履约

### 6.1 支付集成

| 支付方式 | 场景 | 接入方式 | 优先级 |
|----------|------|----------|--------|
| 微信支付 | H5/公众号 | JSAPI 支付 | P0 |
| 微信支付 | 小程序 | 小程序支付 | P1 |
| 支付宝 | H5 | 手机网站支付 | P1 |

### 6.2 物流对接

建议使用 **快递100 API**：

| 功能 | 说明 |
|------|------|
| 智能识别 | 自动识别快递公司 |
| 轨迹查询 | 实时物流信息 |
| 订阅推送 | 物流状态变更通知 |

### 6.3 售后服务（预留）

| 功能 | 说明 | 优先级 |
|------|------|--------|
| 退款申请 | 未发货订单申请退款 | P1 |
| 退货退款 | 已收货申请退货 | P2 |
| 售后记录 | 售后流程追踪 | P2 |

---

## 七、数据库设计

### 7.1 新增模型概览

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           数据模型关系图                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌──────────┐         ┌──────────────┐         ┌──────────────┐       │
│   │   User   │────────▶│   Address    │         │   Product    │       │
│   │  用户    │ 1    n  │   收货地址    │         │    产品      │       │
│   └──────────┘         └──────────────┘         └──────────────┘       │
│        │                                              │                 │
│        │ 1                                            │                 │
│        │                                              │                 │
│        ▼ n                                            │                 │
│   ┌──────────────┐                                    │                 │
│   │ PointRecord  │                                    │                 │
│   │  点数记录    │                                    │                 │
│   └──────────────┘                                    │                 │
│        │                                              │                 │
│        │                                              │                 │
│   ┌────┴────┐                                         │                 │
│   │         │                                         │                 │
│   ▼         ▼                                         ▼                 │
│ ┌────────────────────┐    ┌──────────┐    ┌──────────────────┐         │
│ │AdvisorConversation │    │   Order  │◀───│    OrderItem     │         │
│ │    AI对话          │    │   订单   │ 1 n│    订单项        │         │
│ └────────────────────┘    └──────────┘    └──────────────────┘         │
│          │                     │                                        │
│          │ 1                   │                                        │
│          ▼ n                   │                                        │
│ ┌────────────────────┐        │                                        │
│ │ConversationMessage │        │                                        │
│ │    对话消息        │         │                                        │
│ └────────────────────┘        │                                        │
│                               │                                         │
│   ┌──────────┐                │                                         │
│   │ CartItem │◀───────────────┘                                        │
│   │  购物车  │                                                          │
│   └──────────┘                                                          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 7.2 详细 Schema 定义

```prisma
// ============================================
// 用户系统
// ============================================

model User {
  id            String    @id @default(cuid())
  phone         String    @unique              // 手机号（唯一）
  phoneVerified Boolean   @default(false)      // 手机验证状态
  nickname      String?                        // 昵称
  avatar        String?                        // 头像 URL

  // 微信登录
  wechatOpenId  String?   @unique              // 微信 OpenID
  wechatUnionId String?                        // 微信 UnionID

  // 点数
  points        Int       @default(0)          // 当前点数
  totalPoints   Int       @default(0)          // 累计获得

  // 关联
  addresses     Address[]
  orders        Order[]
  cartItems     CartItem[]
  pointRecords  PointRecord[]
  conversations AdvisorConversation[]

  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  @@index([phone])
  @@index([wechatOpenId])
}

model Address {
  id          String   @id @default(cuid())
  userId      String
  name        String                           // 收件人
  phone       String                           // 联系电话
  province    String                           // 省
  city        String                           // 市
  district    String                           // 区
  detail      String                           // 详细地址
  postalCode  String?                          // 邮编
  isDefault   Boolean  @default(false)

  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([userId])
}

model SmsCode {
  id        String   @id @default(cuid())
  phone     String
  code      String
  type      String   @default("login")         // login | bind | reset
  used      Boolean  @default(false)
  expiresAt DateTime
  createdAt DateTime @default(now())

  @@index([phone, type])
  @@index([expiresAt])
}

// ============================================
// 点数系统
// ============================================

model PointRecord {
  id          String    @id @default(cuid())
  userId      String
  type        PointType
  amount      Int                              // 正数增加，负数减少
  balance     Int                              // 变动后余额
  description String
  relatedId   String?                          // 关联订单/对话ID

  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  createdAt   DateTime  @default(now())

  @@index([userId, createdAt(sort: Desc)])
  @@index([type])
}

enum PointType {
  REGISTER_BONUS        // 注册奖励
  QUESTIONNAIRE_BONUS   // 完成问卷
  PURCHASE_REWARD       // 购买奖励
  SHARE_REWARD          // 分享奖励
  AI_CHAT_CONSUME       // AI追问消耗
  ADMIN_ADJUST          // 管理员调整
}

// ============================================
// AI 对话系统
// ============================================

model AdvisorConversation {
  id              String    @id @default(cuid())
  userId          String
  sessionId       String?                      // 关联原始 AdvisorSession
  analysisResult  Json?                        // 分析结果快照
  messageCount    Int       @default(0)
  pointsConsumed  Int       @default(0)

  user            User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  messages        ConversationMessage[]

  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@index([userId, createdAt(sort: Desc)])
}

model ConversationMessage {
  id             String   @id @default(cuid())
  conversationId String
  role           String                        // user | assistant
  content        String   @db.Text
  pointsCost     Int      @default(0)

  conversation   AdvisorConversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  createdAt      DateTime @default(now())

  @@index([conversationId, createdAt])
}

// ============================================
// 购物车
// ============================================

model CartItem {
  id        String   @id @default(cuid())
  userId    String
  productId String
  quantity  Int      @default(1)

  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  product   Product  @relation(fields: [productId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([userId, productId])
  @@index([userId])
}

// ============================================
// 订单系统
// ============================================

model Order {
  id             String      @id @default(cuid())
  orderNo        String      @unique           // 订单号
  userId         String

  // 金额
  totalAmount    Decimal     @db.Decimal(10, 2)
  shippingFee    Decimal     @default(0) @db.Decimal(10, 2)
  discountAmount Decimal     @default(0) @db.Decimal(10, 2)
  payAmount      Decimal     @db.Decimal(10, 2)

  // 收货信息快照
  recipientName    String
  recipientPhone   String
  recipientAddress String    @db.Text

  // 状态
  status         OrderStatus @default(PENDING)

  // 支付
  paymentMethod  String?                       // wechat | alipay
  paymentTime    DateTime?
  paymentNo      String?

  // 物流
  shippingCompany String?
  trackingNo      String?
  shippedAt       DateTime?
  receivedAt      DateTime?

  // 点数
  pointsEarned   Int         @default(0)

  // 备注
  remark         String?     @db.Text
  adminNote      String?     @db.Text

  user           User        @relation(fields: [userId], references: [id])
  items          OrderItem[]

  createdAt      DateTime    @default(now())
  updatedAt      DateTime    @updatedAt

  @@index([userId, createdAt(sort: Desc)])
  @@index([status])
  @@index([orderNo])
}

model OrderItem {
  id           String   @id @default(cuid())
  orderId      String
  productId    String
  productName  String                          // 快照
  productImage String?
  price        Decimal  @db.Decimal(10, 2)
  quantity     Int
  subtotal     Decimal  @db.Decimal(10, 2)

  order        Order    @relation(fields: [orderId], references: [id], onDelete: Cascade)

  @@index([orderId])
}

enum OrderStatus {
  PENDING      // 待支付
  PAID         // 已支付
  PROCESSING   // 处理中
  SHIPPED      // 已发货
  DELIVERED    // 已签收
  COMPLETED    // 已完成
  CANCELLED    // 已取消
  REFUNDING    // 退款中
  REFUNDED     // 已退款
}

// ============================================
// Product 模型扩展（新增字段）
// ============================================

// 在现有 Product 模型中添加：
// stock       Int      @default(0)            // 库存
// salesCount  Int      @default(0)            // 销量
// cartItems   CartItem[]                      // 关联购物车
```

---

## 八、实施计划

### 8.1 时间线总览

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              实施时间线                                       │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   Week 1-2      Week 3       Week 4-5      Week 6      Week 7-8      Week 9  │
│      │            │             │            │            │            │      │
│      ▼            ▼             ▼            ▼            ▼            ▼      │
│  ┌───────┐   ┌───────┐    ┌─────────┐   ┌───────┐   ┌─────────┐   ┌───────┐ │
│  │ 用户  │   │ 地址  │    │ 点数 +  │   │ 购物  │   │  订单   │   │ 支付  │ │
│  │ 注册  │   │ 管理  │    │ AI追问  │   │  车   │   │  系统   │   │ 集成  │ │
│  │ 登录  │   │       │    │         │   │       │   │         │   │       │ │
│  └───────┘   └───────┘    └─────────┘   └───────┘   └─────────┘   └───────┘ │
│      │            │             │            │            │            │      │
│      └────────────┴─────────────┴────────────┴────────────┴────────────┘      │
│                                                                              │
│        Phase 1                   Phase 2           Phase 3        Phase 4    │
│      用户基础系统              点数+AI追问         购物核心      支付履约    │
│                                                                              │
│   ════════════════════════════════════════════════════════════════════════   │
│                                                                              │
│   ▓▓▓▓▓▓▓▓▓▓▓▓ MVP 里程碑（5周）                                            │
│   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ 1.0 版本（8周）                             │
│   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ 完整版本（10周）                   │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 8.2 详细工时估算

| 阶段 | 模块 | 预估工时 | 里程碑 | 依赖项 |
|------|------|----------|--------|--------|
| **Phase 1** | | | | |
| | 数据库设计 & 迁移 | 1 天 | | |
| | 短信验证码服务 | 1-2 天 | | 短信 API |
| | 手机号注册/登录 | 3-4 天 | | |
| | 微信授权登录 | 2-3 天 | | 微信开放平台 |
| | 个人中心页面 | 2-3 天 | | |
| | 地址管理 | 3-4 天 | **用户系统完成** | |
| **Phase 2** | | | | |
| | 点数系统后端 | 2-3 天 | | Phase 1 |
| | 点数页面 | 1-2 天 | | |
| | AI 追问 API | 3-4 天 | | |
| | 追问 UI 组件 | 2-3 天 | | |
| | 对话历史 | 2 天 | **MVP 完成** | |
| **Phase 3** | | | | |
| | Product 库存扩展 | 1 天 | | |
| | 购物车功能 | 4-5 天 | | Phase 1 |
| | 订单创建 | 3-4 天 | | |
| | 订单管理 | 3-4 天 | | |
| | 购买得点数 | 1 天 | **1.0 版本** | Phase 2 |
| **Phase 4** | | | | |
| | 微信支付集成 | 5-7 天 | | 支付资质 |
| | 支付宝集成 | 3-4 天 | | 支付资质 |
| | 物流 API 对接 | 2-3 天 | | 快递100 |
| | 售后功能 | 5-7 天 | **完整版本** | |

### 8.3 里程碑交付物

#### MVP（约 5 周）
- ✅ 用户注册/登录（手机号 + 微信）
- ✅ 个人中心基础页面
- ✅ 点数系统
- ✅ AI 追问功能
- ✅ 对话历史记录

#### 1.0 版本（+3 周）
- ✅ 收货地址管理
- ✅ 购物车功能
- ✅ 订单系统（创建、列表、详情）
- ✅ 购买获得点数

#### 完整版本（+2 周）
- ✅ 微信/支付宝支付
- ✅ 物流查询
- ✅ 售后服务

---

## 九、前置准备事项

### 9.1 技术准备

| 事项 | 说明 | 负责 | 状态 |
|------|------|------|------|
| 短信服务开通 | 阿里云/腾讯云短信 | 开发 | ⬜ 待开通 |
| 短信签名申请 | 「NIHPLOD」或「旎柏」 | 运营 | ⬜ 待申请 |
| 短信模板审核 | 验证码模板 | 运营 | ⬜ 待审核 |
| 微信开放平台 | 注册 & 认证 | 运营 | ⬜ 待注册 |
| 微信 AppID/Secret | 获取凭证 | 开发 | ⬜ 待获取 |

### 9.2 业务准备

| 事项 | 说明 | 负责 | 状态 |
|------|------|------|------|
| 支付商户申请 | 微信支付/支付宝商户 | 财务 | ⬜ 待申请 |
| ICP 备案确认 | 确认支持交易类型 | 运营 | ⬜ 待确认 |
| 物流合作商 | 确定快递合作方 | 运营 | ⬜ 待确定 |
| 仓储发货 | 确认发货能力 | 运营 | ⬜ 待确认 |
| 客服支持 | 订单咨询处理 | 运营 | ⬜ 待规划 |

### 9.3 成本预估

| 项目 | 单价 | 预估用量 | 月成本 |
|------|------|----------|--------|
| 短信验证码 | ¥0.04/条 | 1000 条/月 | ¥40 |
| 微信支付手续费 | 0.6% | ¥50,000 交易额 | ¥300 |
| AI API 调用 | ¥0.01/次 | 5000 次/月 | ¥50 |
| 服务器增配 | - | - | ¥200 |
| **合计** | | | **约 ¥600/月** |

---

## 十、风险与应对

| 风险 | 影响 | 概率 | 应对措施 |
|------|------|------|----------|
| 支付资质审批延迟 | 无法上线交易功能 | 中 | 提前申请；预留备选方案（有赞等） |
| 短信模板审核失败 | 无法发送验证码 | 低 | 准备多套模板；使用通用模板 |
| AI 追问滥用 | 成本超支 | 中 | 点数限制 + 速率限制 + 内容审核 |
| 库存超卖 | 用户投诉 | 低 | 库存预占机制 + 支付超时释放 |
| 微信审核不通过 | 影响微信登录 | 低 | 先上线手机号登录；微信作为补充 |

---

## 十一、后续规划（远期）

以下功能暂不纳入本次改版，作为远期规划：

| 功能 | 说明 | 优先级 |
|------|------|--------|
| 优惠券系统 | 满减券、折扣券发放与核销 | P3 |
| 会员等级 | 消费累计升级，享受专属权益 | P3 |
| 积分商城 | 点数兑换礼品/优惠券 | P3 |
| 小程序 | 微信小程序版本 | P3 |
| 拼团/秒杀 | 营销活动玩法 | P4 |
| 分销系统 | 用户推广返佣 | P4 |

---

## 附录

### A. 相关文档链接

- [产品需求文档 (PRD)](./NIHPLOD-PRD.md)
- [用户体验设计 (UX)](./NIHPLOD-UX.md)
- [技术栈说明](./NIHPLOD-TechStack.md)
- [API 接口文档](./NIHPLOD-API.md)
- [数据库设计](./NIHPLOD-Database.md)

### B. 参考资料

- [阿里云短信服务](https://www.aliyun.com/product/sms)
- [微信开放平台](https://open.weixin.qq.com/)
- [微信支付开发文档](https://pay.weixin.qq.com/wiki/doc/api/index.html)
- [快递100 API](https://api.kuaidi100.com/)

---

**文档结束**

> 最后更新：2024年12月
> 如有疑问，请联系产品团队
```


# NIHPLOD 官方网站产品需求文档 (PRD)

> 版本：1.0
> 日期：2025年
> 状态：草案

📎 **相关文档**：[UX 设计文档](./NIHPLOD-UX.md)

---

## 一、项目概述

### 1.1 项目背景
NIHPLOD（旎柏）是由艺术品收藏家大卫·纳迈德（David Nahmad）与生物学家斯蒂芬·诺肯博士（Dr. J. Stefan Rokem）于2008年联合创立的摩纳哥高端护肤品牌，总部位于摩纳哥。品牌名称源自将"海豚DOLPHIN"一词颠倒而来，寓意通过前沿生物技术帮助人们实现肌肤的"时间逆转"。品牌以生物科技为核心，结合真脂质体靶向技术，主营面霜、精华露、面膜等多品类护肤品，主张精简护肤的保养理念。品牌希望打造一个简洁、精美、不花哨的官方网站，同时融入创新的AI护肤顾问功能。

### 1.2 项目目标
- 建立高端小众奢侈护肤品牌的线上形象
- 传递"家庭温馨、爱的呵护"品牌情感
- 通过AI护肤问答提升用户参与度和转化率
- 提供沉浸式的品牌体验

### 1.3 功能边界说明
> ⚠️ **重要说明**：本网站为品牌展示网站，**仅提供外部购买链接**，不提供站内下单、购物车、支付等电商功能。用户如需购买产品，将通过外链跳转至第三方销售平台（如天猫、京东等）完成交易。

### 1.4 核心差异化
| 元素 | 描述 |
|------|------|
| **情感主张** | 丈夫为妻子做SPA的温馨场景，传递爱与呵护 |
| **技术亮点** | AI智能护肤顾问，个性化产品推荐 |
| **视觉风格** | 简约奢华、温暖而不失高级感 |

---

## 二、品牌定位与调性

### 2.1 品牌关键词
```
奢华 · 温馨 · 科技 · 纯净 · 仪式感 · 家庭 · 爱
```

### 2.2 品牌故事核心
> "每一次护肤，都是爱的传递。NIHPLOD相信，最奢华的护肤体验，
> 不仅来自珍贵的成分与尖端的科技，更来自那双为你轻柔按摩的手。"

### 2.3 目标用户画像

| 属性 | 描述 |
|------|------|
| **年龄** | 28-45岁 |
| **性别** | 女性为主，男性为购买决策者之一 |
| **收入** | 高收入家庭 |
| **特征** | 注重生活品质、追求有效护肤、重视家庭关系 |
| **场景** | 居家护肤仪式、伴侣共同护肤时光 |

---

## 三、网站架构

### 3.1 整体结构图

```
┌─────────────────────────────────────────────────────────┐
│                      首页 HOME                           │
│                   （双入口选择）                          │
│                                                          │
│    ┌──────────────────┐    ┌──────────────────┐         │
│    │                  │    │                  │         │
│    │   探索 NIHPLOD   │    │   AI 护肤顾问    │         │
│    │   EXPLORE        │    │   SKIN ADVISOR   │         │
│    │                  │    │                  │         │
│    └────────┬─────────┘    └────────┬─────────┘         │
│             │                       │                    │
└─────────────┼───────────────────────┼────────────────────┘
              │                       │
              ▼                       ▼
┌─────────────────────────┐  ┌─────────────────────────────┐
│     品牌内容页面         │  │      AI SKIN ADVISOR        │
│                         │  │     （AI护肤问答）           │
│                         │  │                             │
│  • 品牌故事 Story       │  │  • 问答流程 (5-7个问题)      │
│  • 产品系列 Products    │  │  • AI分析结果               │
│  • 护肤仪式 Ritual      │  │  • 个性化推荐               │
│  • 联系我们 Contact     │  │  • 跳转外部购买链接          │
│                         │  │                             │
└─────────────────────────┘  └─────────────────────────────┘
```

### 3.2 页面清单

| 页面 | 路径 | 优先级 | 描述 |
|------|------|--------|------|
| 首页 | `/` | P0 | 双入口选择（探索品牌 / AI顾问） |
| 品牌故事 | `/story` | P1 | 品牌理念与历史 |
| 产品系列 | `/products` | P0 | 产品展示 |
| 产品详情 | `/products/:id` | P0 | 单品详情（模态框） |
| 护肤仪式 | `/ritual` | P1 | SPA教程 |
| AI护肤顾问 | `/advisor` | P0 | 问答流程 |
| 联系我们 | `/contact` | P2 | 联系信息 |
| 招聘页面 | `/careers` | P2 | 职位列表与申请 |

---

## 四、功能需求

### 4.1 首页
- 双入口选择：探索品牌 / AI护肤顾问
- 品牌信息展示
- 顶部导航菜单
- 语言切换

### 4.2 品牌故事页
- 品牌起源与理念
- 创始人介绍
- 核心技术介绍（真脂质体靶向技术）

### 4.3 产品系列页
- 产品分类展示
- 产品列表
- 筛选功能

### 4.4 产品详情页
- 产品图片展示
- 产品描述
- 成分说明
- 使用方法
- 外部购买链接

### 4.5 护肤仪式页
- SPA教程内容
- 视频/图片指导
- 步骤说明

### 4.6 AI护肤顾问
- 6个问题的问答流程
- AI分析结果
- 个性化产品推荐
- 护肤建议

#### 问题清单

| # | 问题 | 选项 | 目的 |
|---|------|------|------|
| 1 | 你的肌肤类型是？ | 干性 / 油性 / 混合性 / 敏感性 / 不确定 | 基础分类 |
| 2 | 你最关注的肌肤问题是？ | 细纹抗老 / 暗沉提亮 / 补水保湿 / 毛孔粗大 / 敏感泛红 | 核心诉求 |
| 3 | 你每天的睡眠时长大约是？ | <6小时 / 6-7小时 / 7-8小时 / >8小时 | 生活习惯 |
| 4 | 你的工作环境是？ | 长期面对电脑 / 经常户外 / 空调房间 / 混合环境 | 环境因素 |
| 5 | 你目前的护肤步骤有几步？ | 1-2步 / 3-4步 / 5步以上 / 不固定 | 护肤习惯 |
| 6 | 你期望的护肤体验是？ | 高效简约 / 享受仪式感 / 与伴侣一起 | 场景偏好 |

### 4.7 联系我们页
- 联系信息
- 社交媒体链接
- 联系表单（可选）

### 4.8 招聘页面
- 品牌文化介绍
- 开放职位列表
- 职位详情
- 简历投递方式

#### 职位信息字段
| 字段 | 说明 |
|------|------|
| 职位名称 | 岗位标题 |
| 工作地点 | 上海 / 摩纳哥 等 |
| 工作类型 | 全职 / 兼职 / 实习 |
| 职位描述 | 岗位职责说明 |
| 任职要求 | 学历、经验、技能要求 |
| 薪资范围 | 可选显示 |
| 申请方式 | 邮箱投递 / 在线表单 |

---

## 五、技术方案建议

### 5.1 技术栈推荐

| 层面 | 推荐方案 | 说明 |
|------|----------|------|
| 前端框架 | Next.js 14 (App Router) | React 生态，SSR/SSG 支持 |
| 样式方案 | Tailwind CSS | 原子化 CSS，快速开发 |
| 动画库 | Framer Motion | React 动画首选 |
| AI集成 | OpenAI API / Claude API | 护肤顾问功能 |
| **CMS** | **自建 (Next.js + Prisma + SQLite/PostgreSQL)** | 完全可控 |
| 数据库 | SQLite (开发) / PostgreSQL (生产) | 轻量 → 可扩展 |
| 文件存储 | 本地 / 阿里云 OSS / AWS S3 | 图片视频存储 |
| 部署 | Vercel (前端) + Railway/自有服务器 (后端) | 分离部署 |
| 分析 | Google Analytics 4 | 用户行为分析 |

---

## 六、自建 CMS 系统设计

### 6.1 CMS 功能模块

```
┌─────────────────────────────────────────────────────────────┐
│                    NIHPLOD CMS 管理后台                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   产品管理   │  │   内容管理   │  │   媒体库    │         │
│  │  Products   │  │   Content   │  │   Media    │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │  AI问答配置  │  │   用户数据   │  │   系统设置   │         │
│  │   Advisor   │  │   Users     │  │  Settings  │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 数据模型设计

#### 产品 (Product)
```typescript
model Product {
  id          String   @id @default(cuid())
  name        String   // 产品名称
  nameEn      String   // 英文名称
  slug        String   @unique // URL标识
  description String   // 产品描述
  price       Decimal  // 参考价格（仅供展示）
  purchaseUrl String?  // 外部购买链接（如天猫、京东等）
  category    Category @relation
  images      Image[]  // 产品图片
  ingredients String?  // 成分说明
  usage       String?  // 使用方法
  benefits    String[] // 功效标签
  order       Int      @default(0) // 排序
  featured    Boolean  @default(false) // 是否推荐
  published   Boolean  @default(false) // 是否发布
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

#### 产品分类 (Category)
```typescript
model Category {
  id       String    @id @default(cuid())
  name     String    // 分类名称
  nameEn   String    // 英文名称
  slug     String    @unique
  products Product[]
  order    Int       @default(0)
}
```

#### 页面内容 (Page)
```typescript
model Page {
  id        String   @id @default(cuid())
  title     String   // 页面标题
  slug      String   @unique // home, story, ritual, contact
  content   Json     // 页面内容（结构化JSON）
  seo       Json?    // SEO配置
  published Boolean  @default(false)
  updatedAt DateTime @updatedAt
}
```

#### 媒体文件 (Media)
```typescript
model Media {
  id        String   @id @default(cuid())
  filename  String   // 文件名
  url       String   // 文件URL
  type      String   // image/video
  size      Int      // 文件大小
  width     Int?     // 图片宽度
  height    Int?     // 图片高度
  alt       String?  // 替代文本
  createdAt DateTime @default(now())
}
```

#### AI问答配置 (AdvisorQuestion)
```typescript
model AdvisorQuestion {
  id       String   @id @default(cuid())
  question String   // 问题内容
  type     String   // single/multiple 单选/多选
  options  Json     // 选项数组
  order    Int      // 排序
  active   Boolean  @default(true)
}
```

#### AI产品推荐规则 (RecommendationRule)
```typescript
model RecommendationRule {
  id         String   @id @default(cuid())
  conditions Json     // 条件组合
  products   String[] // 推荐产品ID
  priority   Int      // 优先级
  message    String?  // 推荐语
}
```

### 6.3 API 接口设计

#### 公开 API（前端网站调用）
```
GET  /api/products          - 获取产品列表
GET  /api/products/:slug    - 获取产品详情
GET  /api/pages/:slug       - 获取页面内容
GET  /api/categories        - 获取分类列表
POST /api/advisor/analyze   - AI护肤分析
```

#### 管理 API（CMS后台调用，需认证）
```
# 认证
POST /api/admin/login       - 管理员登录
POST /api/admin/logout      - 退出登录

# 产品管理
GET    /api/admin/products
POST   /api/admin/products
PUT    /api/admin/products/:id
DELETE /api/admin/products/:id

# 内容管理
GET    /api/admin/pages
PUT    /api/admin/pages/:slug

# 媒体管理
GET    /api/admin/media
POST   /api/admin/media/upload
DELETE /api/admin/media/:id

# AI配置
GET    /api/admin/advisor/questions
PUT    /api/admin/advisor/questions
GET    /api/admin/advisor/rules
PUT    /api/admin/advisor/rules

# 系统设置
GET    /api/admin/settings
PUT    /api/admin/settings
```

### 6.4 技术实现方案

```
项目结构：
nihplod-website/
├── app/                      # Next.js App Router
│   ├── (website)/           # 前台网站
│   │   ├── page.tsx         # Landing Page
│   │   ├── home/
│   │   ├── products/
│   │   ├── story/
│   │   ├── ritual/
│   │   ├── advisor/
│   │   └── contact/
│   │
│   ├── (admin)/             # CMS后台
│   │   ├── admin/
│   │   │   ├── page.tsx     # 仪表盘
│   │   │   ├── products/
│   │   │   ├── pages/
│   │   │   ├── media/
│   │   │   ├── advisor/
│   │   │   └── settings/
│   │   └── login/
│   │
│   └── api/                 # API路由
│       ├── products/
│       ├── pages/
│       ├── advisor/
│       └── admin/
│
├── components/              # 组件
│   ├── website/            # 前台组件
│   └── admin/              # 后台组件
│
├── lib/                    # 工具库
│   ├── prisma.ts          # 数据库连接
│   ├── auth.ts            # 认证逻辑
│   └── ai.ts              # AI接口
│
├── prisma/
│   └── schema.prisma      # 数据模型
│
└── public/
    └── uploads/           # 上传文件
```

### 6.5 安全设计

| 安全措施 | 实现方式 |
|----------|----------|
| 管理员认证 | JWT Token + HttpOnly Cookie |
| 密码存储 | bcrypt 加密 |
| API 保护 | 中间件验证 Token |
| 文件上传 | 类型/大小限制，重命名存储 |
| SQL 注入 | Prisma ORM 参数化查询 |
| XSS 防护 | React 自动转义 + CSP |
| CSRF 防护 | SameSite Cookie |

---

## 七、AI护肤顾问技术实现

```
用户回答 → 数据结构化 → AI Prompt → 生成建议 → 产品匹配
    │                         │              │
    ▼                         ▼              ▼
{                      系统Prompt:        产品数据库
  skinType: "混合",    "你是NIHPLOD的     匹配算法
  concern: "抗老",     专业护肤顾问..."
  sleep: "6-7h",
  ...
}
```

### 7.1 Prompt 设计示例

```
系统提示词：
你是NIHPLOD的专业护肤顾问，一个来自摩纳哥的高端护肤品牌。
请根据用户的回答，提供：
1. 肌肤状态分析（2-3句话）
2. 生活习惯建议（1-2条）
3. 推荐的NIHPLOD产品组合（2-3款）
4. 每日护肤步骤建议
5. 一句温馨的护肤寄语（融入"爱与呵护"的品牌理念）

语气要求：专业但温暖，像一位贴心的朋友

用户信息：
- 肌肤类型：{skinType}
- 主要关注：{concern}
- 睡眠时长：{sleep}
- 工作环境：{environment}
- 护肤习惯：{routine}
- 期望体验：{preference}
```

---

## 八、项目里程碑

| 阶段 | 内容 | 时间 |
|------|------|------|
| Phase 1 | 项目初始化 + 数据库设计 | Week 1 |
| Phase 2 | CMS 后台开发（产品/内容/媒体管理） | Week 2-3 |
| Phase 3 | 前台网站开发（Landing + 主页 + 产品页） | Week 4-5 |
| Phase 4 | AI护肤顾问功能 | Week 6 |
| Phase 5 | 测试与优化 | Week 7 |
| Phase 6 | 上线部署 | Week 8 |

---

## 九、附录

### 9.1 竞品参考
- Aesop (aesop.com) - 极简美学
- Nécessaire (necessaire.com) - 科学感
- Le Labo (lelabofragrances.com) - 小众奢华
- Byredo (byredo.com) - 北欧极简

### 9.2 素材需求清单

| 类型 | 内容 | 数量 |
|------|------|------|
| 视频 | 丈夫为妻子做SPA的品牌视频 | 1-2条 |
| 图片 | 产品静物图（白底） | 每款3-5张 |
| 图片 | 场景图（温馨家庭护肤） | 5-10张 |
| 图片 | 成分/科技示意图 | 3-5张 |
| 文案 | 品牌故事文案 | 1套 |
| 文案 | 产品描述文案 | 每款1套 |

---

**文档结束**

> 如有疑问，请联系产品团队


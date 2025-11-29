# NIHPLOD 数据库设计文档

> 版本：1.0
> 日期：2025年12月
> 数据库：PostgreSQL
> ORM：Prisma

---

## 一、数据库架构概览

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           NIHPLOD Database                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐      │
│   │  Admin   │     │ Category │────▶│ Product  │◀────│  Media   │      │
│   │  用户    │     │   分类   │     │   产品   │     │   媒体   │      │
│   └──────────┘     └──────────┘     └──────────┘     └──────────┘      │
│                                           │                              │
│                                           ▼                              │
│   ┌──────────┐     ┌──────────┐     ┌──────────┐                        │
│   │   Page   │     │ Question │────▶│   Rule   │                        │
│   │   页面   │     │ AI问题   │     │ 推荐规则 │                        │
│   └──────────┘     └──────────┘     └──────────┘                        │
│                                                                          │
│   ┌──────────┐                                                          │
│   │  Config  │                                                          │
│   │ 系统配置 │                                                          │
│   └──────────┘                                                          │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 二、数据表详细设计

### 2.1 Admin（管理员）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | String | PK, CUID | 主键 |
| username | String | Unique, Not Null | 用户名 |
| password | String | Not Null | 密码（bcrypt 加密） |
| email | String | Unique | 邮箱 |
| role | Enum | Default: ADMIN | 角色 |
| lastLoginAt | DateTime | | 最后登录时间 |
| createdAt | DateTime | Default: now() | 创建时间 |
| updatedAt | DateTime | Auto | 更新时间 |

```prisma
model Admin {
  id          String    @id @default(cuid())
  username    String    @unique
  password    String
  email       String?   @unique
  role        AdminRole @default(ADMIN)
  lastLoginAt DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
}

enum AdminRole {
  SUPER_ADMIN
  ADMIN
  EDITOR
}
```

---

### 2.2 Category（产品分类）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | String | PK, CUID | 主键 |
| name | String | Not Null | 分类名称 |
| slug | String | Unique, Not Null | URL 标识 |
| description | String | | 分类描述 |
| image | String | | 分类图片 |
| order | Int | Default: 0 | 排序 |
| createdAt | DateTime | Default: now() | 创建时间 |
| updatedAt | DateTime | Auto | 更新时间 |

```prisma
model Category {
  id          String    @id @default(cuid())
  name        String
  slug        String    @unique
  description String?
  image       String?
  order       Int       @default(0)
  products    Product[]
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
}
```

---

### 2.3 Product（产品）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | String | PK, CUID | 主键 |
| name | String | Not Null | 产品名称 |
| slug | String | Unique, Not Null | URL 标识 |
| description | String | | 简短描述 |
| fullDescription | Text | | 完整描述 |
| price | Decimal | Not Null | 价格 |
| categoryId | String | FK | 分类 ID |
| ingredients | Text | | 成分说明 |
| usage | Text | | 使用方法 |
| benefits | Json | | 功效列表 |
| volume | String | | 规格容量 |
| purchaseLinks | Json | | 购买链接 |
| featured | Boolean | Default: false | 是否精选 |
| published | Boolean | Default: false | 是否发布 |
| order | Int | Default: 0 | 排序 |
| seo | Json | | SEO 配置 |
| createdAt | DateTime | Default: now() | 创建时间 |
| updatedAt | DateTime | Auto | 更新时间 |

```prisma
model Product {
  id              String    @id @default(cuid())
  name            String
  slug            String    @unique
  description     String?
  fullDescription String?   @db.Text
  price           Decimal   @db.Decimal(10, 2)
  categoryId      String?
  category        Category? @relation(fields: [categoryId], references: [id])
  images          ProductImage[]
  ingredients     String?   @db.Text
  usage           String?   @db.Text
  benefits        Json?     // ["深层保湿", "提亮肤色"]
  volume          String?
  purchaseLinks   Json?     // [{ platform, url, icon }]
  featured        Boolean   @default(false)
  published       Boolean   @default(false)
  order           Int       @default(0)
  seo             Json?     // { title, description }
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@index([categoryId])
  @@index([published, featured])
  @@index([slug])
}
```

---

### 2.4 ProductImage（产品图片关联）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | String | PK, CUID | 主键 |
| productId | String | FK, Not Null | 产品 ID |
| mediaId | String | FK, Not Null | 媒体 ID |
| order | Int | Default: 0 | 排序 |
| isPrimary | Boolean | Default: false | 是否主图 |

```prisma
model ProductImage {
  id        String  @id @default(cuid())
  productId String
  product   Product @relation(fields: [productId], references: [id], onDelete: Cascade)
  mediaId   String
  media     Media   @relation(fields: [mediaId], references: [id])
  order     Int     @default(0)
  isPrimary Boolean @default(false)

  @@unique([productId, mediaId])
  @@index([productId])
}
```

---

### 2.5 Media（媒体文件）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | String | PK, CUID | 主键 |
| filename | String | Not Null | 存储文件名 |
| originalName | String | Not Null | 原始文件名 |
| url | String | Not Null | 访问路径 |
| type | Enum | Not Null | 类型 |
| mimeType | String | Not Null | MIME 类型 |
| size | Int | Not Null | 文件大小(bytes) |
| width | Int | | 图片宽度 |
| height | Int | | 图片高度 |
| folder | String | Default: "media" | 所属文件夹 |
| alt | String | | Alt 文本 |
| createdAt | DateTime | Default: now() | 创建时间 |

```prisma
model Media {
  id           String         @id @default(cuid())
  filename     String
  originalName String
  url          String
  type         MediaType
  mimeType     String
  size         Int
  width        Int?
  height       Int?
  folder       String         @default("media")
  alt          String?
  products     ProductImage[]
  createdAt    DateTime       @default(now())

  @@index([type])
  @@index([folder])
}

enum MediaType {
  IMAGE
  VIDEO
}
```

---

### 2.6 Page（页面内容）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | String | PK, CUID | 主键 |
| slug | String | Unique, Not Null | 页面标识 |
| title | String | Not Null | 页面标题 |
| sections | Json | | 页面区块内容 |
| seo | Json | | SEO 配置 |
| updatedAt | DateTime | Auto | 更新时间 |

```prisma
model Page {
  id        String   @id @default(cuid())
  slug      String   @unique  // home, story, ritual, contact, landing
  title     String
  sections  Json?    // [{ id, type, order, content }]
  seo       Json?    // { title, description, keywords }
  updatedAt DateTime @updatedAt
}
```

**sections 结构示例：**
```json
[
  {
    "id": "sec1",
    "type": "hero",
    "order": 0,
    "content": {
      "title": "为挚爱，臻选护肤",
      "subtitle": "源自摩纳哥的奢护体验",
      "image": "/uploads/pages/hero.jpg",
      "cta": { "text": "探索产品", "link": "/products" }
    }
  }
]
```

---

### 2.7 AdvisorQuestion（AI 顾问问题）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | String | PK, CUID | 主键 |
| order | Int | Not Null | 问题顺序 |
| question | String | Not Null | 问题内容 |
| description | String | | 问题描述 |
| type | Enum | Default: SINGLE | 问题类型 |
| options | Json | Not Null | 选项列表 |
| isActive | Boolean | Default: true | 是否启用 |
| createdAt | DateTime | Default: now() | 创建时间 |
| updatedAt | DateTime | Auto | 更新时间 |

```prisma
model AdvisorQuestion {
  id          String       @id @default(cuid())
  order       Int
  question    String
  description String?
  type        QuestionType @default(SINGLE)
  options     Json         // [{ id, text, value, icon? }]
  isActive    Boolean      @default(true)
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt

  @@index([order])
  @@index([isActive])
}

enum QuestionType {
  SINGLE    // 单选
  MULTIPLE  // 多选
}
```

---

### 2.8 AdvisorRule（推荐规则）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | String | PK, CUID | 主键 |
| name | String | Not Null | 规则名称 |
| conditions | Json | Not Null | 条件配置 |
| productIds | String[] | Not Null | 推荐产品ID |
| priority | Int | Default: 0 | 优先级 |
| isActive | Boolean | Default: true | 是否启用 |
| createdAt | DateTime | Default: now() | 创建时间 |
| updatedAt | DateTime | Auto | 更新时间 |

```prisma
model AdvisorRule {
  id         String   @id @default(cuid())
  name       String
  conditions Json     // [{ questionId, operator, value }]
  productIds String[]
  priority   Int      @default(0)
  isActive   Boolean  @default(true)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@index([priority])
  @@index([isActive])
}
```

**conditions 结构示例：**
```json
[
  { "questionId": "q1", "operator": "equals", "value": "dry" },
  { "questionId": "q2", "operator": "in", "value": ["hydrating", "anti-aging"] }
]
```

---

### 2.9 Config（系统配置）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | String | PK, CUID | 主键 |
| key | String | Unique, Not Null | 配置键 |
| value | Json | Not Null | 配置值 |
| updatedAt | DateTime | Auto | 更新时间 |

```prisma
model Config {
  id        String   @id @default(cuid())
  key       String   @unique  // site, navigation, ai
  value     Json
  updatedAt DateTime @updatedAt
}
```

**配置项示例：**
```json
// key: "site"
{
  "name": "NIHPLOD",
  "tagline": "为挚爱，臻选护肤",
  "logo": "/images/logo.svg",
  "contact": {
    "email": "contact@nihplod.cn",
    "phone": "+86 xxx xxxx xxxx"
  },
  "social": {
    "weibo": "https://weibo.com/nihplod",
    "wechat": "nihplod_official"
  }
}

// key: "ai"
{
  "provider": "qwen",
  "model": "qwen-turbo",
  "systemPrompt": "你是 NIHPLOD 护肤顾问..."
}
```

---

## 三、完整 Prisma Schema

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ==================== 枚举类型 ====================

enum AdminRole {
  SUPER_ADMIN
  ADMIN
  EDITOR
}

enum MediaType {
  IMAGE
  VIDEO
}

enum QuestionType {
  SINGLE
  MULTIPLE
}

// ==================== 数据模型 ====================

model Admin {
  id          String    @id @default(cuid())
  username    String    @unique
  password    String
  email       String?   @unique
  role        AdminRole @default(ADMIN)
  lastLoginAt DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
}

model Category {
  id          String    @id @default(cuid())
  name        String
  slug        String    @unique
  description String?
  image       String?
  order       Int       @default(0)
  products    Product[]
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
}

model Product {
  id              String         @id @default(cuid())
  name            String
  slug            String         @unique
  description     String?
  fullDescription String?        @db.Text
  price           Decimal        @db.Decimal(10, 2)
  categoryId      String?
  category        Category?      @relation(fields: [categoryId], references: [id])
  images          ProductImage[]
  ingredients     String?        @db.Text
  usage           String?        @db.Text
  benefits        Json?
  volume          String?
  purchaseLinks   Json?
  featured        Boolean        @default(false)
  published       Boolean        @default(false)
  order           Int            @default(0)
  seo             Json?
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt

  @@index([categoryId])
  @@index([published, featured])
  @@index([slug])
}

model ProductImage {
  id        String  @id @default(cuid())
  productId String
  product   Product @relation(fields: [productId], references: [id], onDelete: Cascade)
  mediaId   String
  media     Media   @relation(fields: [mediaId], references: [id])
  order     Int     @default(0)
  isPrimary Boolean @default(false)

  @@unique([productId, mediaId])
  @@index([productId])
}

model Media {
  id           String         @id @default(cuid())
  filename     String
  originalName String
  url          String
  type         MediaType
  mimeType     String
  size         Int
  width        Int?
  height       Int?
  folder       String         @default("media")
  alt          String?
  products     ProductImage[]
  createdAt    DateTime       @default(now())

  @@index([type])
  @@index([folder])
}

model Page {
  id        String   @id @default(cuid())
  slug      String   @unique
  title     String
  sections  Json?
  seo       Json?
  updatedAt DateTime @updatedAt
}

model AdvisorQuestion {
  id          String       @id @default(cuid())
  order       Int
  question    String
  description String?
  type        QuestionType @default(SINGLE)
  options     Json
  isActive    Boolean      @default(true)
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt

  @@index([order])
  @@index([isActive])
}

model AdvisorRule {
  id         String   @id @default(cuid())
  name       String
  conditions Json
  productIds String[]
  priority   Int      @default(0)
  isActive   Boolean  @default(true)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@index([priority])
  @@index([isActive])
}

model Config {
  id        String   @id @default(cuid())
  key       String   @unique
  value     Json
  updatedAt DateTime @updatedAt
}
```

---

## 四、表关系图（ER Diagram）

```
┌─────────────────┐
│     Admin       │
├─────────────────┤
│ id (PK)         │
│ username        │
│ password        │
│ email           │
│ role            │
└─────────────────┘

┌─────────────────┐         ┌─────────────────┐
│    Category     │         │     Product     │
├─────────────────┤         ├─────────────────┤
│ id (PK)         │◀───┐    │ id (PK)         │
│ name            │    │    │ name            │
│ slug            │    └────│ categoryId (FK) │
│ description     │         │ slug            │
│ order           │         │ price           │
└─────────────────┘         │ published       │
                            │ featured        │
                            └────────┬────────┘
                                     │
                                     │ 1:N
                                     ▼
┌─────────────────┐         ┌─────────────────┐
│     Media       │         │  ProductImage   │
├─────────────────┤         ├─────────────────┤
│ id (PK)         │◀────────│ mediaId (FK)    │
│ filename        │         │ productId (FK)  │
│ url             │         │ order           │
│ type            │         │ isPrimary       │
│ folder          │         └─────────────────┘
└─────────────────┘

┌─────────────────┐         ┌─────────────────┐
│ AdvisorQuestion │         │   AdvisorRule   │
├─────────────────┤         ├─────────────────┤
│ id (PK)         │         │ id (PK)         │
│ order           │         │ name            │
│ question        │         │ conditions      │
│ options (JSON)  │         │ productIds      │
│ isActive        │         │ priority        │
└─────────────────┘         └─────────────────┘

┌─────────────────┐         ┌─────────────────┐
│      Page       │         │     Config      │
├─────────────────┤         ├─────────────────┤
│ id (PK)         │         │ id (PK)         │
│ slug            │         │ key             │
│ title           │         │ value (JSON)    │
│ sections (JSON) │         └─────────────────┘
└─────────────────┘
```

---

## 五、索引设计

| 表 | 索引 | 类型 | 说明 |
|-----|------|------|------|
| Admin | username | Unique | 用户名唯一 |
| Admin | email | Unique | 邮箱唯一 |
| Category | slug | Unique | URL 标识唯一 |
| Product | slug | Unique | URL 标识唯一 |
| Product | categoryId | Index | 分类查询 |
| Product | published, featured | Composite | 发布状态筛选 |
| ProductImage | productId | Index | 产品图片查询 |
| ProductImage | productId, mediaId | Unique | 防止重复关联 |
| Media | type | Index | 类型筛选 |
| Media | folder | Index | 文件夹筛选 |
| Page | slug | Unique | 页面标识唯一 |
| AdvisorQuestion | order | Index | 排序查询 |
| AdvisorQuestion | isActive | Index | 状态筛选 |
| AdvisorRule | priority | Index | 优先级排序 |
| AdvisorRule | isActive | Index | 状态筛选 |
| Config | key | Unique | 配置键唯一 |

---

## 六、初始化数据

### 6.1 默认管理员

```sql
-- 密码: admin123 (bcrypt 加密)
INSERT INTO "Admin" (id, username, password, role, "createdAt", "updatedAt")
VALUES (
  'admin_default',
  'admin',
  '$2b$10$...',  -- bcrypt hash of 'admin123'
  'SUPER_ADMIN',
  NOW(),
  NOW()
);
```

### 6.2 默认页面

```sql
INSERT INTO "Page" (id, slug, title, sections, "updatedAt")
VALUES
  ('page_home', 'home', '首页', '[]', NOW()),
  ('page_story', 'story', '品牌故事', '[]', NOW()),
  ('page_ritual', 'ritual', '护肤仪式', '[]', NOW()),
  ('page_contact', 'contact', '联系我们', '[]', NOW()),
  ('page_landing', 'landing', 'Landing Page', '[]', NOW());
```

### 6.3 默认 AI 问题

```sql
INSERT INTO "AdvisorQuestion" (id, "order", question, description, type, options, "isActive", "createdAt", "updatedAt")
VALUES
  ('q1', 1, '你的肌肤类型是？', '了解你的基础肤质', 'SINGLE',
   '[{"id":"o1","text":"干性","value":"dry","icon":"💧"},{"id":"o2","text":"油性","value":"oily","icon":"✨"},{"id":"o3","text":"混合性","value":"combination","icon":"🌗"},{"id":"o4","text":"敏感性","value":"sensitive","icon":"🌸"},{"id":"o5","text":"不确定","value":"unknown","icon":"❓"}]',
   true, NOW(), NOW()),
  ('q2', 2, '你最关注的肌肤问题是？', '选择最想改善的问题', 'SINGLE',
   '[{"id":"o6","text":"细纹抗老","value":"anti-aging"},{"id":"o7","text":"暗沉提亮","value":"brightening"},{"id":"o8","text":"补水保湿","value":"hydrating"},{"id":"o9","text":"毛孔粗大","value":"pores"},{"id":"o10","text":"敏感泛红","value":"redness"}]',
   true, NOW(), NOW()),
  ('q3', 3, '你每天的睡眠时长大约是？', '了解你的作息习惯', 'SINGLE',
   '[{"id":"o11","text":"<6小时","value":"less-6"},{"id":"o12","text":"6-7小时","value":"6-7"},{"id":"o13","text":"7-8小时","value":"7-8"},{"id":"o14","text":">8小时","value":"more-8"}]',
   true, NOW(), NOW()),
  ('q4', 4, '你的工作环境是？', '了解环境因素', 'SINGLE',
   '[{"id":"o15","text":"长期面对电脑","value":"computer"},{"id":"o16","text":"经常户外","value":"outdoor"},{"id":"o17","text":"空调房间","value":"aircond"},{"id":"o18","text":"混合环境","value":"mixed"}]',
   true, NOW(), NOW()),
  ('q5', 5, '你目前的护肤步骤有几步？', '了解护肤习惯', 'SINGLE',
   '[{"id":"o19","text":"1-2步","value":"1-2"},{"id":"o20","text":"3-4步","value":"3-4"},{"id":"o21","text":"5步以上","value":"5+"},{"id":"o22","text":"不固定","value":"irregular"}]',
   true, NOW(), NOW()),
  ('q6', 6, '你期望的护肤体验是？', '了解场景偏好', 'SINGLE',
   '[{"id":"o23","text":"高效简约","value":"efficient"},{"id":"o24","text":"享受仪式感","value":"ritual"},{"id":"o25","text":"与伴侣一起","value":"together"}]',
   true, NOW(), NOW());
```

### 6.4 默认配置

```sql
INSERT INTO "Config" (id, key, value, "updatedAt")
VALUES
  ('config_site', 'site', '{"name":"NIHPLOD","tagline":"为挚爱，臻选护肤","logo":"/images/logo.svg","contact":{"email":"contact@nihplod.cn"},"social":{}}', NOW()),
  ('config_nav', 'navigation', '{"main":[{"label":"首页","href":"/home"},{"label":"产品","href":"/products"},{"label":"品牌故事","href":"/story"},{"label":"护肤仪式","href":"/ritual"},{"label":"联系我们","href":"/contact"}]}', NOW()),
  ('config_ai', 'ai', '{"provider":"qwen","model":"qwen-turbo","systemPrompt":"你是 NIHPLOD 品牌的专业护肤顾问..."}', NOW());
```

---

## 七、数据库操作命令

### Prisma 常用命令

```bash
# 生成 Prisma Client
npx prisma generate

# 创建迁移
npx prisma migrate dev --name init

# 应用迁移（生产环境）
npx prisma migrate deploy

# 重置数据库
npx prisma migrate reset

# 打开 Prisma Studio（数据库 GUI）
npx prisma studio

# 运行种子数据
npx prisma db seed
```

### 种子脚本配置

```json
// package.json
{
  "prisma": {
    "seed": "ts-node --compiler-options {\"module\":\"CommonJS\"} prisma/seed.ts"
  }
}
```

---

## 八、备份与恢复

### PostgreSQL 备份

```bash
# 备份数据库
pg_dump -U nihplod -d nihplod -F c -f backup_$(date +%Y%m%d).dump

# 恢复数据库
pg_restore -U nihplod -d nihplod -c backup_20250101.dump
```

### 自动备份脚本

```bash
#!/bin/bash
# /scripts/backup.sh

BACKUP_DIR="/var/backups/nihplod"
DATE=$(date +%Y%m%d_%H%M%S)
FILENAME="nihplod_${DATE}.dump"

pg_dump -U nihplod -d nihplod -F c -f "${BACKUP_DIR}/${FILENAME}"

# 保留最近 7 天的备份
find ${BACKUP_DIR} -name "*.dump" -mtime +7 -delete
```

### Cron 定时备份

```bash
# 每天凌晨 3 点备份
0 3 * * * /scripts/backup.sh
```

---

**文档状态：✅ 已确定**


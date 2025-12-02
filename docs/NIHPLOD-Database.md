# NIHPLOD 数据库设计文档

> 版本：1.0
> 日期：2025年12月
> 状态：草案

📎 **相关文档**：[技术栈文档](./NIHPLOD-TechStack.md) | [API 文档](./NIHPLOD-API.md)

---

## 一、数据库选型

| 项目 | 选择 |
|------|------|
| 数据库 | PostgreSQL |
| ORM | Prisma |

---

## 二、数据模型

### 2.1 产品 (Product)

```prisma
model Product {
  id          String   @id @default(cuid())
  name        String   // 产品名称
  nameEn      String   // 英文名称
  slug        String   @unique // URL标识
  description String   // 产品描述
  price       Decimal  // 参考价格（仅供展示）
  purchaseUrl String?  // 外部购买链接（如天猫、京东等）
  categoryId  String
  category    Category @relation(fields: [categoryId], references: [id])
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

---

### 2.2 产品分类 (Category)

```prisma
model Category {
  id       String    @id @default(cuid())
  name     String    // 分类名称
  nameEn   String    // 英文名称
  slug     String    @unique
  products Product[]
  order    Int       @default(0)
}
```

---

### 2.3 产品图片 (Image)

```prisma
model Image {
  id        String   @id @default(cuid())
  url       String   // 图片URL
  alt       String?  // 替代文本
  order     Int      @default(0)
  productId String
  product   Product  @relation(fields: [productId], references: [id], onDelete: Cascade)
}
```

---

### 2.4 页面内容 (Page)

```prisma
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

---

### 2.5 媒体文件 (Media)

```prisma
model Media {
  id        String   @id @default(cuid())
  filename  String   // 文件名
  url       String   // 文件URL
  type      String   // image/video
  size      Int      // 文件大小（字节）
  width     Int?     // 图片宽度
  height    Int?     // 图片高度
  alt       String?  // 替代文本
  createdAt DateTime @default(now())
}
```

---

### 2.6 AI 问答配置 (AdvisorQuestion)

```prisma
model AdvisorQuestion {
  id       String  @id @default(cuid())
  question String  // 问题内容
  type     String  // single/multiple 单选/多选
  options  Json    // 选项数组 [{ value: "dry", label: "干性" }, ...]
  order    Int     // 排序
  active   Boolean @default(true)
}
```

---

### 2.7 AI 推荐规则 (RecommendationRule)

```prisma
model RecommendationRule {
  id         String   @id @default(cuid())
  conditions Json     // 条件组合 { skinType: ["dry"], concerns: ["aging"] }
  productIds String[] // 推荐产品ID列表
  priority   Int      // 优先级（数字越大优先级越高）
  message    String?  // 推荐语
}
```

---

### 2.8 管理员 (Admin)

```prisma
model Admin {
  id        String   @id @default(cuid())
  email     String   @unique
  password  String   // bcrypt 加密
  name      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

---

### 2.9 系统设置 (Setting)

```prisma
model Setting {
  id    String @id @default(cuid())
  key   String @unique // site_name, ai_provider, etc.
  value Json   // 设置值
}
```

---

## 三、ER 关系图

```
┌──────────────┐       ┌──────────────┐
│   Category   │───────│   Product    │
│              │ 1   n │              │
└──────────────┘       └──────┬───────┘
                              │
                              │ 1
                              │
                              │ n
                       ┌──────┴───────┐
                       │    Image     │
                       │              │
                       └──────────────┘

┌──────────────┐       ┌──────────────┐
│     Page     │       │    Media     │
│              │       │              │
└──────────────┘       └──────────────┘

┌──────────────┐       ┌──────────────┐
│AdvisorQuestion│      │Recommendation│
│              │       │    Rule      │
└──────────────┘       └──────────────┘

┌──────────────┐       ┌──────────────┐
│    Admin     │       │   Setting    │
│              │       │              │
└──────────────┘       └──────────────┘
```

---

## 四、初始数据

### 4.1 分类初始数据

```json
[
  { "name": "面霜", "nameEn": "Cream", "slug": "cream", "order": 1 },
  { "name": "精华", "nameEn": "Essence", "slug": "essence", "order": 2 },
  { "name": "洁面", "nameEn": "Cleanser", "slug": "cleanser", "order": 3 },
  { "name": "面膜", "nameEn": "Mask", "slug": "mask", "order": 4 },
  { "name": "防护", "nameEn": "Protection", "slug": "protection", "order": 5 },
  { "name": "套装", "nameEn": "Set", "slug": "set", "order": 6 }
]
```

### 4.2 页面初始数据

```json
[
  { "title": "首页", "slug": "home" },
  { "title": "品牌故事", "slug": "story" },
  { "title": "护肤仪式", "slug": "ritual" },
  { "title": "联系我们", "slug": "contact" },
  { "title": "加入我们", "slug": "careers" }
]
```

### 4.3 默认管理员

```json
{
  "email": "admin@nihplod.cn",
  "password": "<bcrypt hash>",
  "name": "Admin"
}
```

---


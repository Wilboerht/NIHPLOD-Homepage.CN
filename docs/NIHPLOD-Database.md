# NIHPLOD 数据库设计文档

> 版本：1.6
> 日期：2025年12月
> 状态：✅ 已审核

📎 **相关文档**：[PRD](./NIHPLOD-PRD.md) | [UX](./NIHPLOD-UX.md) | [技术栈](./NIHPLOD-TechStack.md) | [API](./NIHPLOD-API.md) | [开发计划](./NIHPLOD-DevPlan.md)

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
  capacity    String?  // 规格/容量（如 "30ml"、"50g"）
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
  slug      String   @unique // home, story, ritual, contact, careers
  content   Json     // 页面内容（结构化JSON）
  seo       Json?    // SEO配置
  published Boolean  @default(false)
  updatedAt DateTime @updatedAt
}
```

#### SEO JSON 结构

```json
{
  "title": "品牌故事 - NIHPLOD 旎柏",
  "description": "源自摩纳哥的高端护肤品牌，探索NIHPLOD的品牌故事与理念",
  "keywords": "NIHPLOD, 旎柏, 摩纳哥, 高端护肤",
  "og": {
    "title": "品牌故事 - NIHPLOD 旎柏",
    "description": "源自摩纳哥的高端护肤品牌",
    "image": "/uploads/og-story.jpg",
    "type": "website"
  }
}
```

> **Open Graph 说明**：`og` 字段用于社交媒体分享时的预览卡片（微信、微博等）。

#### 各页面 content JSON 结构

**首页 (home)**:
```json
{
  "hero": {
    "title": "NIHPLOD",
    "subtitle": "MONACO",
    "chineseName": "旎柏",
    "tagline": [
      "海豚的肌肤拥有每两小时自我更新的神奇能力。",
      "这种「逆转时光」的动物本能，是我们灵感的来源。"
    ]
  },
  "buttons": {
    "explore": { "text": "探索品牌", "textEn": "EXPLORE", "link": "/story" },
    "advisor": { "text": "AI护肤顾问", "textEn": "SKIN ADVISOR", "link": "/advisor" }
  },
  "backgroundColors": ["#F5F3EA", "#F9F5E7", "#EAE8DF", "#E9E5D5", "#E2E0D7", "#EBE8DB", "#E2E0D7", "#D8D5CA"]
}
```

**品牌故事 (story)**:
```json
{
  "hero": {
    "title": "NIHPLOD",
    "subtitle": "MONACO",
    "heading": "关于旎柏",
    "tagline": "海豚的肌肤拥有每两小时自我更新的神奇能力，这种「逆转时光」的动物本能是我们灵感来源"
  },
  "backgroundImage": "/uploads/story-bg.jpg",
  "sections": [
    {
      "id": "brand-story",
      "icon": "🐬",
      "title": "品牌故事",
      "content": "NIHPLOD诞生于2008年..."
    },
    {
      "id": "mission",
      "icon": "👔",
      "title": "公司使命",
      "content": "..."
    },
    {
      "id": "philosophy",
      "icon": "💡",
      "title": "经营理念",
      "content": "..."
    },
    {
      "id": "media",
      "icon": "📰",
      "title": "媒体报道",
      "content": "..."
    },
    {
      "id": "awards",
      "icon": "🏆",
      "title": "荣获奖项",
      "content": "..."
    }
  ]
}
```

**护肤仪式 (ritual)**:
```json
{
  "hero": {
    "title": "护肤仪式",
    "titleEn": "SKINCARE RITUAL",
    "tagline": "每一次护肤，都是与自己对话的珍贵时光"
  },
  "backgroundImage": "/uploads/ritual-bg.jpg",
  "video": {
    "url": "/uploads/ritual-video.mp4",
    "duration": "5分钟",
    "poster": "/uploads/ritual-poster.jpg"
  },
  "morningRitual": {
    "title": "晨间仪式",
    "titleEn": "MORNING RITUAL",
    "steps": [
      { "order": 1, "name": "洁面", "nameEn": "CLEANSE", "description": "...", "productSlug": "foam-cleanser" },
      { "order": 2, "name": "精华", "nameEn": "SERUM", "description": "...", "productSlug": "vital-serum" },
      { "order": 3, "name": "面霜", "nameEn": "CREAM", "description": "...", "productSlug": "face-cream" },
      { "order": 4, "name": "防晒", "nameEn": "SUNSCREEN", "description": "...", "productSlug": "sunscreen" }
    ]
  },
  "eveningRitual": {
    "title": "晚间仪式",
    "titleEn": "EVENING RITUAL",
    "steps": [
      { "order": 1, "name": "卸妆", "nameEn": "REMOVE", "description": "...", "productSlug": null },
      { "order": 2, "name": "洁面", "nameEn": "CLEANSE", "description": "...", "productSlug": "foam-cleanser" },
      { "order": 3, "name": "精华", "nameEn": "SERUM", "description": "...", "productSlug": "vital-serum" },
      { "order": 4, "name": "面霜", "nameEn": "CREAM", "description": "...", "productSlug": "face-cream" }
    ]
  },
  "coupleSpa": {
    "title": "双人SPA",
    "titleEn": "COUPLE SPA",
    "description": "与伴侣一起，享受护肤的亲密时光",
    "guideUrl": "/ritual/couple-guide"
  }
}
```

**联系我们 (contact)**:
```json
{
  "hero": {
    "title": "联系我们",
    "titleEn": "CONTACT US",
    "tagline": "期待与您的每一次相遇"
  },
  "backgroundImage": "/uploads/contact-bg.jpg",
  "form": {
    "title": "在线留言",
    "subtitle": "请留下您的信息，我们会尽快与您联系",
    "fields": {
      "name": { "label": "您的姓名", "placeholder": "请输入姓名" },
      "email": { "label": "联系邮箱", "placeholder": "请输入邮箱地址" },
      "content": { "label": "留言内容", "placeholder": "请输入您想咨询的内容..." }
    },
    "submitText": "提交留言",
    "successMessage": "感谢您的留言，我们会尽快回复您"
  }
}
```

**招聘页面 (careers)**:
```json
{
  "hero": {
    "title": "加入我们",
    "titleEn": "JOIN OUR TEAM",
    "tagline": "与我们一起，探索护肤科学与自然之美的无限可能"
  },
  "backgroundImage": "/uploads/careers-bg.jpg",
  "culture": [
    { "icon": "🔬", "title": "创新", "description": "追求卓越" },
    { "icon": "🌿", "title": "自然", "description": "环保理念" },
    { "icon": "💝", "title": "关怀", "description": "团队协作" }
  ],
  "applyEmail": "careers@nihplod.com"
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
  id        String  @id @default(cuid())
  question  String  // 问题内容
  fieldName String  // API字段名 (skinType, concern, sleep, environment, routine, preference)
  type      String  // single/multiple 单选/多选
  options   Json    // 选项数组 [{ value: "dry", label: "干性" }, ...]
  order     Int     // 排序
  active    Boolean @default(true)
}
```

> **fieldName 对应关系**：
> | 问题 | fieldName | 说明 |
> |------|-----------|------|
> | 肌肤类型 | skinType | 干性/油性/混合/敏感/不确定 |
> | 肌肤困扰 | concern | 抗老/暗沉/保湿/毛孔/敏感 |
> | 睡眠时长 | sleep | 睡眠质量 |
> | 工作环境 | environment | 办公/户外/空调 |
> | 护肤步骤 | routine | 护肤习惯 |
> | 护肤偏好 | preference | 简约/仪式感/伴侣 |

---

### 2.7 AI 推荐规则 (RecommendationRule)

```prisma
model RecommendationRule {
  id         String   @id @default(cuid())
  conditions Json     // 条件组合 { skinType: ["dry"], concern: ["aging"] }
  productIds String[] // 推荐产品ID列表
  priority   Int      // 优先级（数字越大优先级越高）
  message    String?  // 推荐语
}
```

> **conditions 示例**：
> ```json
> {
>   "skinType": ["dry", "combination"],
>   "concern": ["aging", "hydration"]
> }
> ```
> 表示：肌肤类型为干性或混合性，且关注抗老或保湿的用户

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

### 2.10 联系留言 (ContactMessage)

```prisma
model ContactMessage {
  id        String   @id @default(cuid())
  name      String   // 姓名
  email     String   // 邮箱
  content   String   // 留言内容
  read      Boolean  @default(false) // 是否已读
  createdAt DateTime @default(now())
}
```

---

### 2.11 招聘职位 (Job)

```prisma
model Job {
  id           String   @id @default(cuid())
  title        String   // 职位名称
  titleEn      String   // 英文名称
  location     String   // 工作地点（上海/摩纳哥）
  type         String   // 全职/兼职/实习
  description  String   // 职位描述（富文本）
  requirements String   // 任职要求（富文本）
  salary       String?  // 薪资范围（可选显示）
  order        Int      @default(0) // 排序
  published    Boolean  @default(false) // 是否发布
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
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

┌──────────────┐       ┌──────────────┐
│ContactMessage│       │     Job      │
│   (留言)     │       │   (职位)     │
└──────────────┘       └──────────────┘
```

---

## 四、初始数据

### 4.1 分类初始数据

```json
[
  { "name": "泡沫洁面", "nameEn": "Foam Cleanser", "slug": "foam-cleanser", "order": 1 },
  { "name": "面部磨砂", "nameEn": "Face Scrub", "slug": "face-scrub", "order": 2 },
  { "name": "面膜", "nameEn": "Face Mask", "slug": "face-mask", "order": 3 },
  { "name": "精华", "nameEn": "Serum", "slug": "serum", "order": 4 },
  { "name": "面霜", "nameEn": "Face Cream", "slug": "face-cream", "order": 5 },
  { "name": "护手霜", "nameEn": "Hand Cream", "slug": "hand-cream", "order": 6 },
  { "name": "防晒", "nameEn": "Sunscreen", "slug": "sunscreen", "order": 7 },
  { "name": "身体乳", "nameEn": "Body Lotion", "slug": "body-lotion", "order": 8 },
  { "name": "护理油", "nameEn": "Treatment Oil", "slug": "treatment-oil", "order": 9 },
  { "name": "礼盒系列", "nameEn": "Gift Box Series", "slug": "gift-box", "order": 10 }
]
```

### 4.2 页面初始数据

```json
[
  { "title": "首页", "slug": "home" },
  { "title": "品牌故事", "slug": "story" },
  { "title": "产品系列", "slug": "products" },
  { "title": "护肤仪式", "slug": "ritual" },
  { "title": "联系我们", "slug": "contact" },
  { "title": "加入我们", "slug": "careers" },
  { "title": "隐私政策", "slug": "privacy" }
]
```

**隐私政策页 (privacy) content JSON 结构**:
```json
{
  "hero": {
    "title": "隐私政策",
    "titleEn": "PRIVACY POLICY",
    "tagline": "我们重视您的隐私保护"
  },
  "backgroundImage": "/uploads/privacy-bg.jpg",
  "lastUpdated": "2025年12月",
  "sections": [
    {
      "id": "collection",
      "title": "一、信息收集",
      "content": "我们通过联系表单收集以下信息：\n• 您的姓名\n• 您的邮箱地址\n• 您的留言内容"
    },
    {
      "id": "usage",
      "title": "二、信息使用",
      "content": "收集的信息仅用于：\n• 回复您的咨询\n• 改进我们的服务"
    },
    {
      "id": "protection",
      "title": "三、信息保护",
      "content": "我们采取以下措施保护您的信息：\n• 数据加密存储\n• 严格的访问控制\n• 定期安全审计"
    },
    {
      "id": "sharing",
      "title": "四、第三方共享",
      "content": "我们不会将您的个人信息出售、出租或以其他方式与第三方共享。"
    },
    {
      "id": "cookies",
      "title": "五、Cookie 政策",
      "content": "我们使用 Umami 进行匿名统计分析，该服务不收集个人身份信息，不使用 Cookie 追踪用户。"
    },
    {
      "id": "rights",
      "title": "六、您的权利",
      "content": "您有权：\n• 查询我们持有的您的个人信息\n• 要求更正不准确的信息\n• 要求删除您的个人信息\n\n如需行使这些权利，请通过联系表单与我们联系。"
    },
    {
      "id": "contact",
      "title": "七、联系我们",
      "content": "如您对本隐私政策有任何疑问，请通过联系我们页面的留言表单与我们取得联系。"
    },
    {
      "id": "updates",
      "title": "八、政策更新",
      "content": "我们可能会不时更新本隐私政策。更新后的政策将在本页面发布，并注明最后更新日期。"
    }
  ]
}
```

**产品系列页 (products) content JSON 结构**:
```json
{
  "hero": {
    "title": "产品系列",
    "titleEn": "PRODUCTS",
    "tagline": "源自海洋的馈赠，融合真脂质体靶向技术"
  },
  "backgroundImage": "/uploads/products-bg.jpg",
  "filterLabel": {
    "all": "全部",
    "allEn": "All"
  },
  "defaultFilter": "all"
}
```

> **筛选逻辑说明**：
> - 默认加载时 `defaultFilter: "all"` 显示全部产品
> - 分类按 Category.order 字段升序排列
> - 产品按 Product.order 字段升序排列

### 4.3 默认管理员

```json
{
  "email": "admin@nihplod.cn",
  "password": "<bcrypt hash>",
  "name": "Admin"
}
```

### 4.4 系统设置项

```json
[
  { "key": "site_name", "value": "NIHPLOD 旎柏" },
  { "key": "site_description", "value": "源自摩纳哥的高端护肤品牌" },
  { "key": "notification_email", "value": "contact@nihplod.cn" },
  { "key": "ai_provider", "value": "openai" },
  { "key": "ai_api_key", "value": "sk-xxx..." },
  { "key": "ai_model", "value": "gpt-4o" },
  { "key": "ai_system_prompt", "value": "你是NIHPLOD的专业护肤顾问..." },
  { "key": "social_wechat_qrcode", "value": "/uploads/wechat-qr.jpg" },
  { "key": "social_weibo", "value": "https://weibo.com/nihplod" },
  { "key": "social_xiaohongshu", "value": "https://xiaohongshu.com/..." },
  { "key": "social_douyin", "value": "https://douyin.com/..." },
  { "key": "social_instagram", "value": "https://instagram.com/nihplod" }
]
```

> ⚠️ **说明**：`notification_email` 用于接收留言通知邮件，不对外展示。联系方式仅通过留言表单沟通。

---

## 五、SEO 与搜索引擎优化

### 5.1 sitemap.xml

> Next.js 14 App Router 支持自动生成 sitemap，在 `app/sitemap.ts` 中配置：

```typescript
// app/sitemap.ts
import { MetadataRoute } from 'next';
import { prisma } from '@/lib/prisma';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://nihplod.cn';

  // 静态页面
  const staticPages = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: 'weekly', priority: 1.0 },
    { url: `${baseUrl}/story`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/products`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.9 },
    { url: `${baseUrl}/ritual`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${baseUrl}/advisor`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/contact`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.5 },
    { url: `${baseUrl}/careers`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.6 },
  ];

  // 动态产品页面
  const products = await prisma.product.findMany({ where: { published: true }, select: { slug: true, updatedAt: true } });
  const productPages = products.map((product) => ({
    url: `${baseUrl}/products/${product.slug}`,
    lastModified: product.updatedAt,
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }));

  return [...staticPages, ...productPages];
}
```

### 5.2 robots.txt

```
# app/robots.ts
import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin/', '/api/admin/'],
    },
    sitemap: 'https://nihplod.cn/sitemap.xml',
  };
}
```

### 5.3 结构化数据 (Schema.org)

#### 组织信息 (首页)
```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "NIHPLOD 旎柏",
  "url": "https://nihplod.cn",
  "logo": "https://nihplod.cn/logo.png",
  "description": "源自摩纳哥的高端护肤品牌",
  "foundingDate": "2008",
  "sameAs": [
    "https://weibo.com/nihplod",
    "https://instagram.com/nihplod"
  ]
}
```

#### 产品信息 (产品详情页)
```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "焕活精华液",
  "image": "https://nihplod.cn/uploads/serum.jpg",
  "description": "深层滋养，逆转时光",
  "brand": {
    "@type": "Brand",
    "name": "NIHPLOD"
  },
  "offers": {
    "@type": "Offer",
    "price": "1280",
    "priceCurrency": "CNY",
    "availability": "https://schema.org/InStock"
  }
}
```

---


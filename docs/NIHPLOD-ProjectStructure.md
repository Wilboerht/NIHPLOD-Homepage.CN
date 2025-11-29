# NIHPLOD 项目结构文档

> 版本：1.0
> 日期：2025年12月
> 状态：✅ 已确定

---

## 一、项目根目录结构

```
nihplod-website/
├── app/                      # Next.js App Router 页面
├── components/               # React 组件
├── lib/                      # 工具函数和库
├── hooks/                    # 自定义 React Hooks
├── types/                    # TypeScript 类型定义
├── styles/                   # 全局样式
├── public/                   # 静态资源
├── prisma/                   # 数据库 Schema 和迁移
├── config/                   # 配置文件
├── .env                      # 环境变量（本地）
├── .env.production           # 环境变量（生产）
├── next.config.js            # Next.js 配置
├── tailwind.config.ts        # Tailwind 配置
├── tsconfig.json             # TypeScript 配置
├── ecosystem.config.js       # PM2 配置
├── package.json              # 依赖管理
└── README.md                 # 项目说明
```

---

## 二、App 目录结构（路由）

```
app/
├── (site)/                   # 前台网站路由组
│   ├── layout.tsx            # 前台布局
│   ├── page.tsx              # Landing Page（双入口选择页）
│   ├── home/
│   │   └── page.tsx          # 主网站首页
│   ├── products/
│   │   ├── page.tsx          # 产品列表页
│   │   └── [slug]/
│   │       └── page.tsx      # 产品详情页
│   ├── story/
│   │   └── page.tsx          # 品牌故事页
│   ├── ritual/
│   │   └── page.tsx          # 护肤仪式页
│   └── contact/
│       └── page.tsx          # 联系我们页
│
├── advisor/                  # AI 护肤顾问（独立路由）
│   ├── layout.tsx            # 顾问专属布局
│   ├── page.tsx              # 问答流程页
│   └── result/
│       └── page.tsx          # 结果推荐页
│
├── admin/                    # CMS 后台路由组
│   ├── layout.tsx            # 后台布局
│   ├── page.tsx              # 后台首页（Dashboard）
│   ├── login/
│   │   └── page.tsx          # 登录页
│   ├── products/
│   │   ├── page.tsx          # 产品管理列表
│   │   ├── new/
│   │   │   └── page.tsx      # 新增产品
│   │   └── [id]/
│   │       └── page.tsx      # 编辑产品
│   ├── pages/
│   │   ├── page.tsx          # 页面内容管理
│   │   └── [slug]/
│   │       └── page.tsx      # 编辑页面内容
│   ├── media/
│   │   └── page.tsx          # 媒体库管理
│   ├── advisor/
│   │   └── page.tsx          # AI 顾问配置
│   └── settings/
│       └── page.tsx          # 系统设置
│
├── api/                      # API 路由
│   ├── auth/
│   │   ├── login/
│   │   │   └── route.ts      # 登录 API
│   │   └── logout/
│   │       └── route.ts      # 登出 API
│   ├── products/
│   │   ├── route.ts          # 产品 CRUD
│   │   └── [id]/
│   │       └── route.ts      # 单个产品操作
│   ├── pages/
│   │   └── route.ts          # 页面内容 CRUD
│   ├── media/
│   │   ├── route.ts          # 媒体列表
│   │   └── upload/
│   │       └── route.ts      # 文件上传
│   ├── advisor/
│   │   ├── questions/
│   │   │   └── route.ts      # 问题配置
│   │   └── recommend/
│   │       └── route.ts      # AI 推荐
│   └── analytics/
│       └── route.ts          # 统计数据
│
├── layout.tsx                # 根布局
├── globals.css               # 全局样式
├── not-found.tsx             # 404 页面
└── error.tsx                 # 错误页面
```

---

## 三、Components 目录结构

```
components/
├── ui/                       # 基础 UI 组件
│   ├── Button.tsx
│   ├── Input.tsx
│   ├── Modal.tsx
│   ├── Card.tsx
│   ├── Loading.tsx
│   ├── Toast.tsx
│   └── index.ts              # 统一导出
│
├── layout/                   # 布局组件
│   ├── Header.tsx            # 前台头部导航
│   ├── Footer.tsx            # 前台底部
│   ├── AdminSidebar.tsx      # 后台侧边栏
│   ├── AdminHeader.tsx       # 后台头部
│   └── index.ts
│
├── landing/                  # Landing Page 组件
│   ├── SplitScreen.tsx       # 双入口分屏
│   ├── BrandEntry.tsx        # 品牌入口卡片
│   └── AdvisorEntry.tsx      # AI 顾问入口卡片
│
├── home/                     # 首页组件
│   ├── Hero.tsx              # Hero 区域
│   ├── Philosophy.tsx        # 品牌理念
│   ├── FeaturedProducts.tsx  # 精选产品
│   ├── RitualPreview.tsx     # 护肤仪式预览
│   └── Testimonials.tsx      # 用户评价
│
├── product/                  # 产品相关组件
│   ├── ProductCard.tsx       # 产品卡片
│   ├── ProductGrid.tsx       # 产品网格
│   ├── ProductDetail.tsx     # 产品详情
│   ├── ProductGallery.tsx    # 产品图片画廊
│   └── BuyButton.tsx         # 购买按钮（跳转第三方）
│
├── advisor/                  # AI 顾问组件
│   ├── QuestionCard.tsx      # 问题卡片
│   ├── OptionButton.tsx      # 选项按钮
│   ├── ProgressBar.tsx       # 进度条
│   ├── ResultCard.tsx        # 结果卡片
│   └── RecommendedProduct.tsx # 推荐产品
│
├── animation/                # 动画组件
│   ├── FadeIn.tsx            # 渐入动画
│   ├── SlideUp.tsx           # 上滑动画
│   ├── TextReveal.tsx        # 文字揭示
│   ├── ImageReveal.tsx       # 图片揭示
│   ├── Parallax.tsx          # 视差滚动
│   ├── PageTransition.tsx    # 页面转场
│   └── index.ts
│
├── admin/                    # 后台管理组件
│   ├── DataTable.tsx         # 数据表格
│   ├── FormField.tsx         # 表单字段
│   ├── ImageUploader.tsx     # 图片上传器
│   ├── RichEditor.tsx        # 富文本编辑器
│   ├── StatsCard.tsx         # 统计卡片
│   └── index.ts
│
└── shared/                   # 共享组件
    ├── Logo.tsx              # 品牌 Logo
    ├── Divider.tsx           # 分隔线
    ├── SectionTitle.tsx      # 章节标题
    └── index.ts
```

---

## 四、Lib 目录结构

```
lib/
├── db.ts                     # Prisma 客户端实例
├── auth.ts                   # JWT 认证工具
├── api.ts                    # API 请求封装
├── ai.ts                     # AI 服务封装（可配置多服务商）
├── upload.ts                 # 文件上传工具
├── utils.ts                  # 通用工具函数
├── constants.ts              # 常量定义
├── validations.ts            # Zod 验证 Schema
└── animations.ts             # 动画预设配置
```

---

## 五、其他目录结构

### Hooks
```
hooks/
├── useAuth.ts                # 认证状态 Hook
├── useProducts.ts            # 产品数据 Hook
├── useMediaUpload.ts         # 媒体上传 Hook
├── useScrollAnimation.ts     # 滚动动画 Hook
└── useAdvisor.ts             # AI 顾问流程 Hook
```

### Types
```
types/
├── product.ts                # 产品类型
├── page.ts                   # 页面内容类型
├── media.ts                  # 媒体类型
├── advisor.ts                # AI 顾问类型
├── api.ts                    # API 响应类型
└── index.ts                  # 统一导出
```

### Prisma
```
prisma/
├── schema.prisma             # 数据库 Schema
├── migrations/               # 迁移文件
└── seed.ts                   # 种子数据
```

### Public
```
public/
├── uploads/                  # 用户上传文件（CMS）
│   ├── products/             # 产品图片
│   ├── pages/                # 页面素材
│   └── media/                # 其他媒体
├── fonts/                    # 自定义字体
├── images/                   # 静态图片（代码引用）
│   └── placeholder/          # 占位图
├── favicon.ico               # 网站图标
└── robots.txt                # SEO 爬虫配置
```

### Config
```
config/
├── site.ts                   # 网站基础配置
├── navigation.ts             # 导航菜单配置
└── seo.ts                    # SEO 默认配置
```

---

## 六、命名规范

### 文件命名

| 类型 | 规范 | 示例 |
|------|------|------|
| **组件** | PascalCase | `ProductCard.tsx` |
| **页面** | 小写 | `page.tsx` |
| **工具函数** | camelCase | `formatPrice.ts` |
| **类型定义** | camelCase | `product.ts` |
| **常量** | camelCase | `constants.ts` |
| **Hooks** | camelCase + use前缀 | `useAuth.ts` |

### 组件命名

```tsx
// ✅ 正确
export function ProductCard() { ... }
export default function HomePage() { ... }

// ❌ 错误
export function productCard() { ... }
export default function home_page() { ... }
```

### 类型命名

```tsx
// ✅ 正确
interface Product { ... }
type ProductStatus = 'draft' | 'published'

// ❌ 错误
interface IProduct { ... }  // 不使用 I 前缀
type productStatus = ...    // 类型用 PascalCase
```

---

## 七、模块依赖关系

```
┌─────────────────────────────────────────────────────────────────┐
│                          app/ (页面)                             │
│    ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│    │  (site)  │  │ advisor  │  │  admin   │  │   api    │      │
│    └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘      │
│         │             │             │             │             │
└─────────│─────────────│─────────────│─────────────│─────────────┘
          │             │             │             │
          ▼             ▼             ▼             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      components/ (组件)                          │
│    ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐       │
│    │  ui  │ │layout│ │ home │ │product│ │advisor│ │ admin│       │
│    └──┬───┘ └──┬───┘ └──┬───┘ └──┬───┘ └──┬───┘ └──┬───┘       │
└───────│────────│────────│────────│────────│────────│────────────┘
        │        │        │        │        │        │
        ▼        ▼        ▼        ▼        ▼        ▼
┌─────────────────────────────────────────────────────────────────┐
│                    lib/ + hooks/ + types/                        │
│         ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐                 │
│         │ db  │ │ auth│ │ api │ │ ai  │ │utils│                 │
│         └──┬──┘ └─────┘ └─────┘ └─────┘ └─────┘                 │
└────────────│────────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      prisma/ (数据库)                            │
│                    ┌─────────────────┐                          │
│                    │  PostgreSQL     │                          │
│                    └─────────────────┘                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## 八、环境变量

```env
# .env.example

# 数据库
DATABASE_URL="postgresql://user:password@localhost:5432/nihplod"

# 应用
PORT=3100
NEXT_PUBLIC_SITE_URL="https://nihplod.cn"

# JWT 认证
JWT_SECRET="your-super-secret-key-here"

# AI 服务（可配置）
AI_PROVIDER="qwen"  # openai / claude / qwen / wenxin
AI_API_KEY="your-api-key"
AI_MODEL="qwen-turbo"

# Umami 分析（可选）
NEXT_PUBLIC_UMAMI_WEBSITE_ID="your-website-id"
NEXT_PUBLIC_UMAMI_URL="https://analytics.nihplod.cn"
```

---

**文档状态：✅ 已确定**


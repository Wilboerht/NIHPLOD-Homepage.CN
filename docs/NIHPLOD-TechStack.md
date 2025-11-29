# NIHPLOD 技术栈选择文档

> 版本：1.0
> 日期：2025年12月
> 状态：✅ 已确定

---

## 一、最终技术选型

```
┌─────────────────────────────────────────────────────────────────┐
│                   NIHPLOD 技术架构（已确定）                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   前端框架      Next.js 14 (App Router) + React 18 + TypeScript │
│                                                                 │
│   样式方案      Tailwind CSS                                    │
│                                                                 │
│   动画方案      Framer Motion + GSAP (ScrollTrigger)            │
│                                                                 │
│   后端/API      Next.js API Routes (全栈方案)                   │
│                                                                 │
│   数据库        Prisma ORM + PostgreSQL                         │
│                                                                 │
│   CMS          自建 (集成在 Next.js 项目中)                      │
│                                                                 │
│   认证          自建 JWT (仅CMS后台)                             │
│                                                                 │
│   文件存储      本地存储 (Nginx 静态服务)                        │
│                                                                 │
│   网站分析      Umami (自托管 Docker)                            │
│                                                                 │
│   AI服务        可配置 (OpenAI / Claude / 通义千问)              │
│                                                                 │
│   进程管理      PM2                                             │
│                                                                 │
│   Web服务器     Nginx (反向代理 + SSL + 静态文件)                │
│                                                                 │
│   SSL证书       Let's Encrypt (免费自动续期)                     │
│                                                                 │
│   部署环境      自有服务器                                       │
│                                                                 │
│   域名          nihplod.cn                                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 技术选型总览表

| 层面 | 技术 | 状态 |
|------|------|------|
| 前端框架 | Next.js 14 (App Router) | ✅ 确定 |
| 语言 | TypeScript | ✅ 确定 |
| 样式 | Tailwind CSS | ✅ 确定 |
| 动画 | Framer Motion + GSAP | ✅ 确定 |
| 数据库 | PostgreSQL + Prisma | ✅ 确定 |
| CMS | 自建 | ✅ 确定 |
| 认证 | 自建 JWT | ✅ 确定 |
| 文件存储 | 本地存储 | ✅ 确定 |
| 网站分析 | Umami (自托管) | ✅ 确定 |
| AI服务 | 可配置 | ⏳ API Key 待定 |
| 进程管理 | PM2 | ✅ 确定 |
| Web服务器 | Nginx | ✅ 确定 |
| SSL | Let's Encrypt | ✅ 确定 |
| 部署 | 自有服务器 | ✅ 确定 |

---

## 二、前端框架选型

### 对比分析

| 框架 | Next.js 14 | Nuxt.js 3 | Astro | 纯 React + Vite |
|------|------------|-----------|-------|-----------------|
| **语言** | React/TypeScript | Vue/TypeScript | 多框架 | React/TypeScript |
| **SSR/SSG** | ✅ 完整支持 | ✅ 完整支持 | ✅ 静态优先 | ❌ 需额外配置 |
| **API路由** | ✅ 内置 | ✅ 内置 | ⚠️ 有限 | ❌ 需独立后端 |
| **生态系统** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **学习曲线** | 中等 | 中等 | 简单 | 简单 |
| **SEO** | ✅ 优秀 | ✅ 优秀 | ✅ 优秀 | ⚠️ 需处理 |
| **性能** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **适合CMS** | ✅ 非常适合 | ✅ 适合 | ⚠️ 一般 | ❌ 需额外工作 |

### ✅ 确定：Next.js 14 (App Router)

**理由：**
- 全栈方案，前端+后端+API一体化
- React生态最成熟，组件库丰富
- App Router 支持 React Server Components，性能极佳
- 内置图片优化、字体优化
- 可通过 PM2 + Nginx 部署到自有服务器

---

## 三、样式方案选型

### 对比分析

| 方案 | Tailwind CSS | CSS Modules | Styled Components | Sass/SCSS |
|------|--------------|-------------|-------------------|-----------|
| **开发速度** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| **包体积** | 小（purge后） | 最小 | 较大 | 小 |
| **可维护性** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| **设计系统** | ✅ 内置 | ❌ 需自建 | ⚠️ 需配置 | ❌ 需自建 |
| **响应式** | ✅ 极简单 | ⚠️ 手写 | ⚠️ 手写 | ⚠️ 手写 |
| **暗色模式** | ✅ 内置 | ❌ 需自建 | ⚠️ 需配置 | ❌ 需自建 |

### ✅ 确定：Tailwind CSS

**理由：**
- 原子化CSS，开发效率极高
- 内置设计系统（颜色、间距、响应式断点）
- 与 Next.js 完美集成
- 生产构建自动 tree-shaking，体积小

**配置品牌色：**
```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        'brand-gold': '#C9A86C',
        'brand-warm': '#FAF8F5',
        'brand-charcoal': '#2C2C2C',
        'brand-pink': '#F5E6E0',
        'brand-beige': '#E8E2D9',
      }
    }
  }
}
```

---

## 四、动画库选型

### 对比分析

| 库 | Framer Motion | GSAP | React Spring | CSS Animation |
|----|---------------|------|--------------|---------------|
| **易用性** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| **React集成** | ✅ 原生 | ⚠️ 需封装 | ✅ 原生 | ✅ 原生 |
| **功能丰富度** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| **复杂动画** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| **滚动动画** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| **手势支持** | ✅ 内置 | ❌ 需插件 | ⚠️ 有限 | ❌ |

### ✅ 确定：Framer Motion + GSAP (ScrollTrigger)

**组合使用理由：**
- **Framer Motion**：处理组件动画、页面过渡、交互反馈
- **GSAP ScrollTrigger**：处理高级滚动动画、视差效果、时间轴动画

---

### 🎨 动画设计规范（高端奢侈品调性）

#### 核心原则

| 原则 | 说明 | 示例 |
|------|------|------|
| **克制** | 动画是点睛之笔，不是主角 | 避免过度弹跳、闪烁 |
| **优雅** | 缓慢、从容、有呼吸感 | 使用 ease-out，时长 0.6-1.2s |
| **精致** | 细节处见功力 | 文字逐字显现、图片渐显 |
| **连贯** | 动画之间有节奏韵律 | 使用 stagger 错落动画 |

#### 缓动曲线（Easing）

```javascript
// 高端品牌常用缓动 - 从容优雅
const easings = {
  // 主要缓动 - 柔和减速，奢侈品标配
  elegantOut: [0.16, 1, 0.3, 1],

  // 入场动画 - 优雅进入
  smoothReveal: [0.25, 0.46, 0.45, 0.94],

  // 强调动画 - 轻微回弹，精致感
  subtleBounce: [0.34, 1.56, 0.64, 1],

  // 页面过渡 - 从容不迫
  pageTransition: [0.76, 0, 0.24, 1],
}
```

#### 时长规范

| 动画类型 | 时长 | 说明 |
|----------|------|------|
| 微交互（按钮hover） | 0.2-0.3s | 即时反馈，不拖沓 |
| 元素入场 | 0.6-0.8s | 从容显现 |
| 页面过渡 | 0.8-1.2s | 优雅转场 |
| 大图展开 | 1.0-1.5s | 仪式感 |
| 文字逐行显现 | 0.4s/行 + 0.1s stagger | 阅读节奏 |

#### 高端动画效果示例

**1. 优雅入场 - 文字渐显上浮**
```jsx
<motion.h1
  initial={{ opacity: 0, y: 40 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{
    duration: 0.8,
    ease: [0.16, 1, 0.3, 1]
  }}
>
  NIHPLOD
</motion.h1>
```

**2. 图片揭幕效果 - Reveal Animation**
```jsx
<motion.div className="overflow-hidden">
  <motion.img
    initial={{ scale: 1.2, opacity: 0 }}
    whileInView={{ scale: 1, opacity: 1 }}
    transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
    viewport={{ once: true }}
  />
</motion.div>
```

**3. 错落入场 - Stagger Effect**
```jsx
const container = {
  animate: { transition: { staggerChildren: 0.1 } }
}
const item = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.6 } }
}

<motion.ul variants={container} initial="initial" animate="animate">
  {products.map(p => (
    <motion.li key={p.id} variants={item}>{p.name}</motion.li>
  ))}
</motion.ul>
```

**4. 视差滚动 - GSAP ScrollTrigger**
```jsx
useEffect(() => {
  gsap.to('.hero-image', {
    yPercent: -20,
    ease: 'none',
    scrollTrigger: {
      trigger: '.hero',
      start: 'top top',
      end: 'bottom top',
      scrub: true
    }
  })
}, [])
```

**5. 分割线展开 - Line Reveal**
```jsx
<motion.div
  className="h-[1px] bg-brand-gold"
  initial={{ scaleX: 0, originX: 0 }}
  whileInView={{ scaleX: 1 }}
  transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
/>
```

**6. 页面过渡 - 优雅转场**
```jsx
// 页面退出：当前页面优雅淡出上移
const pageExit = {
  opacity: 0,
  y: -20,
  transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] }
}

// 页面进入：新页面从下方淡入
const pageEnter = {
  initial: { opacity: 0, y: 40 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.2 }
}
```

#### 禁止使用的动画

| ❌ 避免 | 原因 |
|--------|------|
| 弹性过度的 bounce | 不符合高端调性 |
| 快速闪烁 | 廉价感 |
| 3D翻转 | 过于花哨 |
| 随机方向入场 | 缺乏秩序感 |
| 过多同时动画 | 视觉混乱 |

#### 参考品牌动画

| 品牌 | 动画特点 | 学习要点 |
|------|----------|----------|
| **Aesop** | 极简、缓慢淡入 | 克制美学 |
| **Byredo** | 干净过渡、文字动画 | 节奏把控 |
| **Le Labo** | 打字机效果、精致 | 细节处理 |
| **Prada** | 大图视差、沉稳 | 高级质感 |

---

## 五、数据库选型

### 对比分析

| 数据库 | SQLite | PostgreSQL | MySQL | MongoDB |
|--------|--------|------------|-------|---------|
| **类型** | 关系型(文件) | 关系型 | 关系型 | 文档型 |
| **部署难度** | ⭐ 极简单 | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| **性能** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **并发** | ⚠️ 有限 | ✅ 优秀 | ✅ 优秀 | ✅ 优秀 |
| **成本** | 免费 | 免费/付费 | 免费/付费 | 免费/付费 |
| **适合场景** | 小型站点 | 中大型生产 | 中大型生产 | 灵活schema |
| **Prisma支持** | ✅ | ✅ | ✅ | ✅ |
| **自有服务器** | ✅ 零配置 | 需安装服务 | 需安装服务 | 需安装服务 |

### ✅ 确定：PostgreSQL

**理由：**
- **高并发支持**：适合生产环境
- **数据类型丰富**：JSON、数组等原生支持
- **稳定可靠**：企业级数据库
- **Prisma 完美支持**：开发体验一致
- **自有服务器**：可直接安装运行

**Prisma 配置：**
```prisma
// prisma/schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

**环境变量：**
```env
# .env
DATABASE_URL="postgresql://user:password@localhost:5432/nihplod?schema=public"
```

**服务器安装（Ubuntu）：**
```bash
# 安装 PostgreSQL
sudo apt install postgresql postgresql-contrib

# 创建数据库和用户
sudo -u postgres psql
CREATE USER nihplod WITH PASSWORD 'your_password';
CREATE DATABASE nihplod OWNER nihplod;
\q
```

**备份策略：**
```bash
# 定时备份数据库
pg_dump -U nihplod nihplod > backups/nihplod_$(date +%Y%m%d).sql
```

---

## 六、认证方案选型

### 对比分析

| 方案 | 自建 JWT | NextAuth.js | Clerk | Auth0 |
|------|----------|-------------|-------|-------|
| **复杂度** | 中等 | 简单 | 极简单 | 简单 |
| **自定义** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| **成本** | 免费 | 免费 | 免费/付费 | 免费/付费 |
| **数据控制** | ✅ 完全 | ✅ 完全 | ⚠️ 第三方 | ⚠️ 第三方 |
| **自有服务器** | ✅ 完美 | ✅ 支持 | ⚠️ 需网络 | ⚠️ 需网络 |

### ✅ 确定：自建 JWT（仅 CMS 后台）

**说明：**
- 前台网站不需要用户登录
- 仅 CMS 后台需要管理员认证

**实现方案：**
- 邮箱 + 密码登录
- bcrypt 密码加密
- JWT Token 存储在 HttpOnly Cookie
- 完全自主可控，无需依赖第三方服务

---

## 七、文件存储选型

### 对比分析（自有服务器场景）

| 方案 | 本地存储 | 阿里云 OSS | Cloudflare R2 |
|------|----------|------------|---------------|
| **成本** | 免费 | 按量付费 | 10GB免费 |
| **配置复杂度** | 零配置 | 中等 | 简单 |
| **自有服务器适配** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| **CDN** | Nginx 配置 | ✅ 内置 | ✅ 全球 |
| **图片优化** | Next.js内置 | ✅ 有 | ❌ |
| **备份** | 手动/脚本 | 自动 | 自动 |

### ✅ 确定：本地存储 + Nginx

**理由：**
- 自有服务器，本地存储最简单直接
- 存储量不大，无需额外云服务
- 零成本
- 通过 Nginx 提供静态文件服务，性能足够

**目录结构：**
```
nihplod-website/
└── public/
    └── uploads/          # CMS 上传的文件
        ├── products/     # 产品图片
        ├── pages/        # 页面素材
        └── media/        # 其他媒体
```

**Nginx 配置：**
```nginx
# 静态文件服务，30天缓存
location /uploads {
    alias /var/www/nihplod/public/uploads;
    expires 30d;
    add_header Cache-Control "public, immutable";
}
```

### 图片优化策略

使用 **Next.js Image** 组件内置优化：

```jsx
import Image from 'next/image'

<Image
  src="/uploads/products/serum.jpg"
  alt="精华液"
  width={800}
  height={600}
  quality={85}
  placeholder="blur"
/>
```

**优势：**
- 自动 WebP/AVIF 转换
- 自动响应式尺寸
- 懒加载
- 模糊占位符
- 无需额外服务

---

## 八、AI 服务选型

### 对比分析

| 服务 | OpenAI GPT-4 | Claude 3 | 通义千问 | 文心一言 |
|------|--------------|----------|----------|----------|
| **能力** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **中文** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **价格** | 较贵 | 中等 | 便宜 | 便宜 |
| **国内访问** | ❌ 需代理 | ❌ 需代理 | ✅ 直连 | ✅ 直连 |
| **API稳定** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |

### ⏳ 待定：设计为可配置

**说明：**
- API Key 由用户后期提供
- 代码设计为可配置，支持多种 AI 服务商
- 通过环境变量切换

**推荐选择：**
| 场景 | 推荐 | 理由 |
|------|------|------|
| **国内用户为主** | 通义千问 | 直连、便宜、中文好 |
| **追求最佳效果** | Claude 3.5 Sonnet | 理解力强、回复自然 |
| **全球用户** | OpenAI GPT-4o | 生态成熟 |

**环境变量配置：**
```env
# .env
AI_PROVIDER=qwen  # openai / claude / qwen / wenxin
AI_API_KEY=your-api-key
AI_MODEL=qwen-turbo
```

---

## 九、网站分析选型

### ✅ 确定：Umami（自托管）

**简介：**
Umami 是一款轻量级、开源、隐私友好的网站分析工具，可完全自托管。

**选择理由：**
| 特点 | 说明 |
|------|------|
| **轻量级** | 追踪脚本仅 ~2KB |
| **隐私友好** | 无 Cookie、符合 GDPR |
| **自托管** | 数据完全在自己服务器 |
| **PostgreSQL** | 与项目数据库一致 |
| **界面美观** | 现代化仪表盘 |
| **开源免费** | MIT 协议 |

**功能覆盖：**
| 功能 | 支持 |
|------|------|
| 页面访问量 (PV) | ✅ |
| 独立访客 (UV) | ✅ |
| 实时访客 | ✅ |
| 页面分析 | ✅ |
| 来源/引荐 | ✅ |
| 地理位置/国家/城市 | ✅ |
| 设备/浏览器/系统 | ✅ |
| 自定义事件追踪 | ✅ |
| 多网站支持 | ✅ |

**部署方式（Docker）：**
```bash
# 创建 Umami 数据库
sudo -u postgres psql
CREATE DATABASE umami;
GRANT ALL PRIVILEGES ON DATABASE umami TO nihplod;
\q

# Docker 部署（端口可配置）
docker run -d --name umami \
  --restart always \
  -p 3101:3000 \
  -e DATABASE_URL=postgresql://nihplod:password@localhost:5432/umami \
  ghcr.io/umami-software/umami:postgresql-latest
```

**Nginx 配置（可选子域名）：**
```nginx
# analytics.nihplod.cn
server {
    listen 443 ssl http2;
    server_name analytics.nihplod.cn;

    ssl_certificate /etc/letsencrypt/live/nihplod.cn/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/nihplod.cn/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3101;  # 对应 Docker 映射端口
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

**前端集成：**
```tsx
// app/layout.tsx
import Script from 'next/script'

export default function RootLayout({ children }) {
  return (
    <html>
      <head>
        <Script
          src="https://analytics.nihplod.cn/script.js"
          data-website-id="your-website-id"
          strategy="afterInteractive"
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
```

**自定义事件追踪示例：**
```tsx
// 追踪产品点击
const handleProductClick = (productName: string) => {
  // Umami 自动注入 window.umami
  window.umami?.track('product_click', { product: productName })
}

// 追踪 AI 顾问完成
const handleAdvisorComplete = () => {
  window.umami?.track('advisor_complete')
}
```

---

## 十、部署方案

### ✅ 确定：自有服务器 + PM2 + Nginx

**部署架构：**
```
┌──────────────────────────────────────────────────────────────────────┐
│                           自有服务器                                  │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   ┌─────────────┐      ┌─────────────────────┐  ┌─────────────────┐ │
│   │   Nginx     │      │    Next.js App      │  │     Umami       │ │
│   │  :80/:443   │─────▶│  (PM2 管理, :3100)  │  │  (Docker,:3101) │ │
│   │             │      │                     │  │                 │ │
│   │ - SSL终端   │      │ ┌───────┐ ┌──────┐ │  │  网站分析        │ │
│   │ - 反向代理  │─────▶│ │ 前台  │ │ CMS │ │  │  访客统计        │ │
│   │ - 静态文件  │      │ └───────┘ └──────┘ │  │  地理位置        │ │
│   │ - Gzip压缩  │      │                     │  │                 │ │
│   └─────────────┘      │ ┌───────┐ ┌──────┐ │  └────────┬────────┘ │
│          │             │ │ API   │ │Prisma│ │           │          │
│          │             │ └───────┘ └──────┘ │           │          │
│          ▼             └─────────┬───────────┘           │          │
│   ┌─────────────┐                │                       │          │
│   │  /uploads   │                │                       │          │
│   │  静态文件    │                ▼                       ▼          │
│   │  (图片/视频) │         ┌─────────────────────────────────┐      │
│   └─────────────┘         │         PostgreSQL :5432         │      │
│                           │   nihplod (主站) + umami (分析)   │      │
│                           └─────────────────────────────────┘      │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

**端口配置：**
```env
# .env.production
PORT=3100                    # Next.js 端口（避免与其他项目冲突）
UMAMI_PORT=3101              # Umami 端口
```

> 💡 建议使用 3100+ 端口段，避免与常见服务冲突

**部署步骤：**
```bash
# 1. 构建项目
npm run build

# 2. 使用 PM2 启动（指定端口）
pm2 start npm --name "nihplod" -- start -- -p 3100

# 或者使用 ecosystem 配置文件
pm2 start ecosystem.config.js

# 3. 设置开机自启
pm2 save
pm2 startup
```

**PM2 配置文件（推荐）：**
```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'nihplod',
    script: 'npm',
    args: 'start',
    env: {
      PORT: 3100,
      NODE_ENV: 'production'
    }
  }]
}
```

**Nginx 配置示例：**
```nginx
server {
    listen 80;
    server_name nihplod.cn www.nihplod.cn;
    return 301 https://nihplod.cn$request_uri;
}

server {
    listen 443 ssl http2;
    server_name nihplod.cn www.nihplod.cn;

    ssl_certificate /etc/letsencrypt/live/nihplod.cn/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/nihplod.cn/privkey.pem;

    # 静态文件
    location /uploads {
        alias /var/www/nihplod/public/uploads;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # Next.js 反向代理（端口可配置）
    location / {
        proxy_pass http://127.0.0.1:3100;  # 对应 .env 中的 PORT
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

**SSL 证书（Let's Encrypt）：**
```bash
# 安装 certbot
apt install certbot python3-certbot-nginx

# 获取证书
certbot --nginx -d nihplod.cn -d www.nihplod.cn
```

---

## 十、最终确定方案

### 🏆 NIHPLOD 技术栈（已确定）

```
┌─────────────────────────────────────────────────────────────────┐
│                   NIHPLOD 技术栈（已确定）                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   前端框架      Next.js 14 (App Router) + TypeScript            │
│                                                                 │
│   样式方案      Tailwind CSS                                    │
│                                                                 │
│   动画方案      Framer Motion + GSAP (ScrollTrigger)            │
│                                                                 │
│   数据库        Prisma ORM + PostgreSQL                         │
│                                                                 │
│   CMS          自建 (集成在 Next.js 项目中)                      │
│                                                                 │
│   认证          自建 JWT (仅CMS后台)                             │
│                                                                 │
│   文件存储      本地存储 (Nginx 静态服务)                        │
│                                                                 │
│   网站分析      Umami (自托管 Docker)                            │
│                                                                 │
│   AI服务        可配置 (OpenAI / Claude / 通义千问)              │
│                                                                 │
│   进程管理      PM2                                             │
│                                                                 │
│   Web服务器     Nginx (反向代理 + SSL + 静态文件)                │
│                                                                 │
│   SSL证书       Let's Encrypt (免费自动续期)                     │
│                                                                 │
│   部署环境      自有服务器                                       │
│                                                                 │
│   域名          nihplod.cn                                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 📦 核心依赖包

```json
{
  "dependencies": {
    "next": "^14.0.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "@prisma/client": "^5.0.0",
    "framer-motion": "^11.0.0",
    "gsap": "^3.12.0",
    "tailwindcss": "^3.4.0",
    "bcryptjs": "^2.4.3",
    "jose": "^5.0.0",
    "zod": "^3.22.0",
    "lucide-react": "^0.300.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "prisma": "^5.0.0",
    "@types/react": "^18.2.0",
    "@types/node": "^20.0.0",
    "@types/bcryptjs": "^2.4.0"
  }
}
```

---

## 十一、成本估算

### 开发阶段（免费）
| 项目 | 服务 | 费用 |
|------|------|------|
| 代码托管 | GitHub / Gitee | 免费 |
| 数据库 | PostgreSQL 本地 | 免费 |
| 文件存储 | 本地 | 免费 |
| AI测试 | 各平台免费额度 | 免费 |

### 生产阶段（预估月费）
| 项目 | 服务 | 费用/月 |
|------|------|---------|
| 服务器 | 自有服务器 | 已有 |
| 数据库 | PostgreSQL（服务器自建） | 免费 |
| 文件存储 | 本地存储 | 免费 |
| SSL证书 | Let's Encrypt | 免费 |
| AI调用 | 待定 | 按量付费 |
| 域名 | nihplod.cn | 已有 |
| **合计** | | **仅 AI 调用费用** |

---

**文档状态：✅ 已确定**


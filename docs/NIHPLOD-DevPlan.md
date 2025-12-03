# NIHPLOD 官网 AI 辅助开发计划

> 版本：1.6
> 日期：2025年12月
> 状态：✅ 已审核
> 开发模式：AI Vibe Coding（人机结对编程）

📎 **相关文档**：[PRD](./NIHPLOD-PRD.md) | [UX](./NIHPLOD-UX.md) | [技术栈](./NIHPLOD-TechStack.md) | [API](./NIHPLOD-API.md) | [数据库](./NIHPLOD-Database.md)

---

## 一、开发计划总览

### 1.1 项目信息

| 项目 | 说明 |
|------|------|
| **项目名称** | NIHPLOD 官方网站 |
| **技术栈** | Next.js 14 + TypeScript + Tailwind CSS + Prisma + PostgreSQL |
| **预计工期** | 6-8 周 |
| **开发模式** | AI 辅助 Vibe Coding |

### 1.2 阶段划分

> 📝 注：本计划将 PRD 中的 Phase 5（测试）和 Phase 6（部署）合并为一个收尾阶段

```
┌─────────────────────────────────────────────────────────────────────┐
│                        开发阶段总览                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Phase 1          Phase 2          Phase 3          Phase 4        │
│  基础设施          CMS后台          前台页面          AI功能         │
│  ────────         ────────         ────────         ────────        │
│  Week 1           Week 2-3         Week 4-5         Week 6          │
│                                                                     │
│  • 项目初始化      • 产品管理        • 首页           • 问答流程      │
│  • 数据库设计      • 内容管理        • 品牌故事        • AI分析       │
│  • 认证系统        • 媒体库          • 产品页面        • 结果推荐      │
│                   • AI配置          • 其他页面                       │
│                                                                     │
│                                                     Phase 5         │
│                                                     测试与部署       │
│                                                     ────────        │
│                                                     Week 7-8        │
│                                                                     │
│                                                     • 响应式优化    │
│                                                     • 功能测试      │
│                                                     • 性能优化      │
│                                                     • 部署上线      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 二、Phase 1：基础设施搭建 (Week 1)

### 2.1 项目初始化

**目标**：搭建 Next.js 14 项目基础框架

#### 任务清单

| # | 任务 | 优先级 | AI 辅助度 | 预计耗时 |
|---|------|--------|-----------|----------|
| 1.1.1 | 创建 Next.js 14 项目 (App Router + TypeScript) | P0 | ⭐⭐⭐ | 15min |
| 1.1.2 | 配置 Tailwind CSS + 品牌设计系统 | P0 | ⭐⭐⭐ | 30min |
| 1.1.3 | 安装配置 Framer Motion + GSAP + React Bits | P1 | ⭐⭐⭐ | 20min |
| 1.1.4 | 配置 ESLint + Prettier | P1 | ⭐⭐⭐ | 20min |
| 1.1.5 | 创建项目目录结构 | P0 | ⭐⭐ | 15min |
| 1.1.6 | 配置环境变量 (.env.local) | P0 | ⭐⭐ | 10min |
| 1.1.7 | 安装 Zod + 创建验证 Schema | P0 | ⭐⭐⭐ | 30min |
| 1.1.8 | 配置 nodemailer 邮件服务 | P1 | ⭐⭐⭐ | 20min |

---

#### 1.1.1 创建 Next.js 14 项目

**子任务**：

| 步骤 | 操作 | 命令/文件 | 验收标准 |
|------|------|-----------|----------|
| 1 | 执行创建命令 | `npx create-next-app@14 . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"` | 项目成功初始化 |
| 2 | 验证 App Router 启用 | 检查 `src/app/` 目录存在 | 目录结构正确 |
| 3 | 测试开发服务器 | `npm run dev` | localhost:3000 可访问 |
| 4 | 清理默认内容 | 删除 `src/app/page.tsx` 默认内容 | 页面显示空白或自定义内容 |

**输出文件**：
- `package.json` - 项目配置
- `tsconfig.json` - TypeScript 配置
- `next.config.js` - Next.js 配置
- `src/app/layout.tsx` - 根布局
- `src/app/page.tsx` - 首页

---

#### 1.1.2 配置 Tailwind CSS + 品牌设计系统

**子任务**：

| 步骤 | 操作 | 文件 | 验收标准 |
|------|------|------|----------|
| 1 | 配置品牌色板 | `tailwind.config.ts` | 品牌色可通过 `bg-brand-gold` 等使用 |
| 2 | 配置字体系统 | `tailwind.config.ts` + `src/app/layout.tsx` | 字体正确加载 |
| 3 | 配置间距系统 | `tailwind.config.ts` | 间距符合 8px 基础单位 |
| 4 | 创建全局样式 | `src/app/globals.css` | 基础样式生效 |
| 5 | 安装字体包 | `npm install @fontsource/playfair-display` | 字体可用 |

**Tailwind 配置详情**：

```typescript
// tailwind.config.ts
const config = {
  theme: {
    extend: {
      colors: {
        brand: {
          gold: '#C9A86C',      // 品牌金 - Logo、按钮、强调
          cream: '#FAF8F5',     // 暖白 - 主背景
          charcoal: '#2C2C2C',  // 深炭灰 - 主文字
          blush: '#F5E6E0',     // 柔粉 - 辅助背景
          beige: '#E8E2D9',     // 米色 - 分隔、边框
        },
      },
      fontFamily: {
        serif: ['Playfair Display', 'Source Serif Pro', 'serif'],
        sans: ['Helvetica Neue', 'Source Han Sans', 'PingFang SC', 'sans-serif'],
      },
      spacing: {
        'xs': '8px',
        's': '16px',
        'm': '24px',
        'l': '48px',
        'xl': '80px',
        'xxl': '120px',
      },
    },
  },
};
```

---

#### 1.1.3 安装配置 Framer Motion + GSAP + React Bits

**子任务**：

| 步骤 | 操作 | 命令/文件 | 验收标准 |
|------|------|-----------|----------|
| 1 | 安装 Framer Motion | `npm install framer-motion` | 无报错 |
| 2 | 安装 GSAP | `npm install gsap` | 无报错 |
| 3 | 创建动画配置文件 | `src/lib/animations.ts` | 导出通用动画配置 |
| 4 | 创建 MotionProvider | `src/components/providers/MotionProvider.tsx` | LazyMotion 配置完成 |
| 5 | 测试基础动画 | 创建测试组件 | 淡入动画正常 |

**动画配置文件**：

```typescript
// src/lib/animations.ts
export const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 },
  transition: { duration: 0.5, ease: 'easeOut' },
};

export const staggerContainer = {
  animate: { transition: { staggerChildren: 0.1 } },
};

// GSAP ScrollTrigger 预设
export const scrollFadeIn = {
  opacity: 0,
  y: 50,
  duration: 0.8,
  ease: 'power2.out',
};
```

---

#### 1.1.4 配置 ESLint + Prettier

**子任务**：

| 步骤 | 操作 | 文件 | 验收标准 |
|------|------|------|----------|
| 1 | 安装 Prettier | `npm install -D prettier eslint-config-prettier` | 无报错 |
| 2 | 创建 Prettier 配置 | `.prettierrc` | 配置文件存在 |
| 3 | 创建忽略文件 | `.prettierignore` | 忽略 node_modules 等 |
| 4 | 更新 ESLint 配置 | `.eslintrc.json` | 集成 Prettier |
| 5 | 添加 lint 脚本 | `package.json` | `npm run lint` 可用 |
| 6 | 测试格式化 | `npm run format` | 代码格式化成功 |

**Prettier 配置**：

```json
// .prettierrc
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100,
  "plugins": ["prettier-plugin-tailwindcss"]
}
```

**package.json 脚本**：

```json
{
  "scripts": {
    "format": "prettier --write \"src/**/*.{ts,tsx,css}\"",
    "format:check": "prettier --check \"src/**/*.{ts,tsx,css}\""
  }
}
```

---

#### 1.1.5 创建项目目录结构

**子任务**：

| 步骤 | 操作 | 验收标准 |
|------|------|----------|
| 1 | 创建前台路由组 | `src/app/(website)/` 目录存在 |
| 2 | 创建后台路由组 | `src/app/(admin)/` 目录存在 |
| 3 | 创建 API 路由 | `src/app/api/` 目录存在 |
| 4 | 创建组件目录 | `src/components/website/` + `src/components/admin/` |
| 5 | 创建 UI 组件目录 | `src/components/ui/` 目录存在 |
| 6 | 创建工具库目录 | `src/lib/` 目录存在 |
| 7 | 创建类型定义目录 | `src/types/` 目录存在 |
| 8 | 创建 hooks 目录 | `src/hooks/` 目录存在 |
| 9 | 创建上传目录 | `public/uploads/` 目录存在 |

**完整目录结构**：

```
src/
├── app/
│   ├── (website)/           # 前台网站路由组
│   │   ├── layout.tsx       # 前台布局（导航+页脚）
│   │   ├── page.tsx         # 首页
│   │   ├── story/
│   │   ├── products/
│   │   ├── ritual/
│   │   ├── advisor/
│   │   ├── contact/
│   │   ├── careers/
│   │   └── privacy/
│   │
│   ├── (admin)/             # CMS 后台路由组
│   │   ├── layout.tsx       # 后台布局（侧边栏+Header）
│   │   ├── login/
│   │   └── admin/
│   │       ├── page.tsx     # 仪表盘
│   │       ├── products/
│   │       ├── categories/
│   │       ├── pages/
│   │       ├── media/
│   │       ├── advisor/
│   │       ├── jobs/
│   │       ├── messages/
│   │       └── settings/
│   │
│   ├── api/                 # API 路由
│   │   ├── products/
│   │   ├── categories/
│   │   ├── pages/
│   │   ├── media/
│   │   ├── advisor/
│   │   ├── jobs/
│   │   ├── contact/
│   │   ├── settings/
│   │   └── admin/
│   │
│   ├── layout.tsx           # 根布局
│   ├── globals.css          # 全局样式
│   ├── not-found.tsx        # 404 页面
│   └── error.tsx            # 错误页面
│
├── components/
│   ├── website/             # 前台组件
│   │   ├── Header.tsx
│   │   ├── Footer.tsx
│   │   ├── FloatingCardLayout.tsx
│   │   ├── ProductCard.tsx
│   │   └── ...
│   │
│   ├── admin/               # 后台组件
│   │   ├── Sidebar.tsx
│   │   ├── AdminHeader.tsx
│   │   ├── DataTable.tsx
│   │   └── ...
│   │
│   ├── ui/                  # 通用 UI 组件
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Modal.tsx
│   │   ├── Toast.tsx
│   │   └── ...
│   │
│   └── providers/           # Context Providers
│       ├── MotionProvider.tsx
│       └── ToastProvider.tsx
│
├── lib/                     # 工具库
│   ├── prisma.ts           # Prisma 客户端
│   ├── auth.ts             # 认证逻辑
│   ├── password.ts         # 密码加密
│   ├── jwt.ts              # JWT 工具
│   ├── ai.ts               # AI 接口
│   ├── email.ts            # 邮件发送
│   ├── upload.ts           # 文件上传
│   ├── ratelimit.ts        # 速率限制
│   ├── utils.ts            # 通用工具
│   └── animations.ts       # 动画配置
│
├── hooks/                   # 自定义 Hooks
│   ├── useMediaQuery.ts
│   ├── useScrollPosition.ts
│   └── useDebounce.ts
│
├── types/                   # TypeScript 类型
│   ├── product.ts
│   ├── advisor.ts
│   └── api.ts
│
└── schemas/                 # Zod 验证 Schema
    ├── product.ts
    ├── contact.ts
    └── advisor.ts

public/
├── uploads/                 # 上传文件存储
├── fonts/                   # 自定义字体
└── images/                  # 静态图片
```

---

#### 1.1.6 配置环境变量

**子任务**：

| 步骤 | 操作 | 文件 | 验收标准 |
|------|------|------|----------|
| 1 | 创建环境变量模板 | `.env.example` | 包含所有必需变量 |
| 2 | 创建本地开发配置 | `.env.local` | 本地可正常运行 |
| 3 | 配置 gitignore | `.gitignore` | `.env.local` 被忽略 |
| 4 | 创建环境变量类型 | `src/types/env.d.ts` | TypeScript 识别环境变量 |

**环境变量清单**：

```bash
# .env.example

# ============================================
# 数据库
# ============================================
DATABASE_URL="postgresql://user:password@localhost:5432/nihplod?schema=public"

# ============================================
# JWT 认证
# ============================================
JWT_SECRET="your-super-secret-jwt-key-min-32-chars"
JWT_EXPIRES_IN="7d"

# ============================================
# 站点配置
# ============================================
NEXT_PUBLIC_SITE_URL="http://localhost:3000"
NEXT_PUBLIC_SITE_NAME="NIHPLOD 旎柏"

# ============================================
# 邮件服务 (SMTP)
# ============================================
SMTP_HOST="smtp.example.com"
SMTP_PORT="465"
SMTP_USER="notification@nihplod.cn"
SMTP_PASSWORD="your-smtp-password"
SMTP_FROM="NIHPLOD 网站通知 <notification@nihplod.cn>"
NOTIFICATION_EMAIL="admin@nihplod.cn"

# ============================================
# AI 服务 (可选)
# ============================================
AI_PROVIDER="openai"
AI_API_KEY="sk-your-api-key"
AI_MODEL="gpt-4o"
AI_TIMEOUT="30000"
AI_MAX_TOKENS="1000"
AI_ENABLED="false"

# ============================================
# 安全配置
# ============================================
RATE_LIMIT_MAX="10"
RATE_LIMIT_WINDOW_MS="60000"
```

**TypeScript 类型声明**：

```typescript
// src/types/env.d.ts
namespace NodeJS {
  interface ProcessEnv {
    DATABASE_URL: string;
    JWT_SECRET: string;
    JWT_EXPIRES_IN: string;
    NEXT_PUBLIC_SITE_URL: string;
    NEXT_PUBLIC_SITE_NAME: string;
    SMTP_HOST: string;
    SMTP_PORT: string;
    SMTP_USER: string;
    SMTP_PASSWORD: string;
    SMTP_FROM: string;
    NOTIFICATION_EMAIL: string;
    AI_PROVIDER?: string;
    AI_API_KEY?: string;
    AI_MODEL?: string;
    AI_TIMEOUT?: string;
    AI_MAX_TOKENS?: string;
    AI_ENABLED?: string;
    RATE_LIMIT_MAX?: string;
    RATE_LIMIT_WINDOW_MS?: string;
  }
}
```

---

#### 1.1.7 安装 Zod + 创建验证 Schema

**子任务**：

| 步骤 | 操作 | 文件 | 验收标准 |
|------|------|------|----------|
| 1 | 安装 Zod | `npm install zod` | 无报错 |
| 2 | 创建产品验证 Schema | `src/schemas/product.ts` | 导出 ProductSchema |
| 3 | 创建联系表单 Schema | `src/schemas/contact.ts` | 导出 ContactSchema |
| 4 | 创建 AI 问答 Schema | `src/schemas/advisor.ts` | 导出 AdvisorSchema |
| 5 | 创建通用响应 Schema | `src/schemas/api.ts` | 导出 ApiResponseSchema |
| 6 | 测试验证逻辑 | 单元测试 | 验证通过/失败正确 |

**Schema 示例**：

```typescript
// src/schemas/contact.ts
import { z } from 'zod';

export const ContactFormSchema = z.object({
  name: z.string()
    .min(2, '姓名至少2个字符')
    .max(50, '姓名最多50个字符'),
  email: z.string()
    .email('请输入有效的邮箱地址'),
  content: z.string()
    .min(10, '留言内容至少10个字符')
    .max(1000, '留言内容最多1000个字符'),
  honeypot: z.string().max(0).optional(), // 蜜罐字段
});

export type ContactFormData = z.infer<typeof ContactFormSchema>;
```

```typescript
// src/schemas/advisor.ts
import { z } from 'zod';

export const AdvisorAnswersSchema = z.object({
  skinType: z.enum(['dry', 'oily', 'combination', 'sensitive', 'unknown']),
  concern: z.enum(['aging', 'dull', 'hydration', 'pores', 'sensitive']),
  sleep: z.enum(['less6', '6to7', '7to8', 'more8']),
  environment: z.enum(['computer', 'outdoor', 'aircon', 'mixed']),
  routine: z.enum(['1to2', '3to4', '5plus', 'irregular']),
  preference: z.enum(['simple', 'ritual', 'couple']),
});

export type AdvisorAnswers = z.infer<typeof AdvisorAnswersSchema>;
```

---

#### 1.1.8 配置 nodemailer 邮件服务

**子任务**：

| 步骤 | 操作 | 文件 | 验收标准 |
|------|------|------|----------|
| 1 | 安装 nodemailer | `npm install nodemailer` | 无报错 |
| 2 | 安装类型定义 | `npm install -D @types/nodemailer` | 无报错 |
| 3 | 创建邮件工具 | `src/lib/email.ts` | 导出 sendEmail 函数 |
| 4 | 创建邮件模板 | `src/lib/email-templates.ts` | 导出 HTML 模板 |
| 5 | 测试邮件发送 | 发送测试邮件 | 邮件成功接收 |

**邮件工具实现**：

```typescript
// src/lib/email.ts
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '465'),
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: SendEmailOptions) {
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject,
      html,
    });
    return { success: true };
  } catch (error) {
    console.error('邮件发送失败:', error);
    return { success: false, error };
  }
}

// 发送联系表单通知
export async function sendContactNotification(data: {
  name: string;
  email: string;
  content: string;
}) {
  const html = `
    <h2>新的联系留言</h2>
    <p><strong>姓名：</strong>${data.name}</p>
    <p><strong>邮箱：</strong>${data.email}</p>
    <p><strong>留言内容：</strong></p>
    <p>${data.content}</p>
    <hr>
    <p style="color: #666; font-size: 12px;">
      此邮件由 NIHPLOD 官网自动发送
    </p>
  `;

  return sendEmail({
    to: process.env.NOTIFICATION_EMAIL!,
    subject: `[NIHPLOD] 新留言 - ${data.name}`,
    html,
  });
}
```

---

### Phase 1.1 完成检查清单

| 检查项 | 验收标准 | 状态 |
|--------|----------|------|
| Next.js 项目运行 | `npm run dev` 成功启动 | ⬜ |
| TypeScript 配置 | 无类型错误 | ⬜ |
| Tailwind 品牌色 | `bg-brand-gold` 等可用 | ⬜ |
| Framer Motion | 动画组件可导入 | ⬜ |
| ESLint + Prettier | `npm run lint` 通过 | ⬜ |
| 目录结构 | 所有目录已创建 | ⬜ |
| 环境变量 | `.env.example` 完整 | ⬜ |
| Zod Schema | 验证正常工作 | ⬜ |
| 邮件服务 | 测试邮件发送成功 | ⬜ |

---

### AI Prompt 模板

```markdown
## 任务：初始化 NIHPLOD 项目

请帮我创建一个 Next.js 14 项目，要求如下：

### 技术要求
- Next.js 14 with App Router
- TypeScript
- Tailwind CSS
- 项目名：nihplod-website

### 目录结构
src/
├── app/
│   ├── (website)/      # 前台网站
│   ├── (admin)/        # CMS后台
│   └── api/            # API路由
├── components/
│   ├── website/        # 前台组件
│   ├── admin/          # 后台组件
│   └── ui/             # 通用UI组件
├── lib/                # 工具函数
├── hooks/              # 自定义 Hooks
├── types/              # TypeScript 类型
└── schemas/            # Zod 验证 Schema

### Tailwind 品牌色配置
- brand-gold: #C9A86C（Logo、按钮、强调）
- brand-cream: #FAF8F5（主背景）
- brand-charcoal: #2C2C2C（主文字）
- brand-blush: #F5E6E0（辅助背景）
- brand-beige: #E8E2D9（分隔、边框）

### 字体配置
- 标题：Playfair Display / 思源宋体
- 正文：Helvetica Neue / 思源黑体

### 间距系统（基于 8px）
- xs: 8px, s: 16px, m: 24px, l: 48px, xl: 80px, xxl: 120px

请生成：
1. 初始化命令
2. tailwind.config.ts 完整配置
3. 目录创建脚本
4. 环境变量模板
```

---

### 2.2 数据库设计

**目标**：使用 Prisma 创建数据模型

#### 任务清单

| # | 任务 | 优先级 | AI 辅助度 | 预计耗时 |
|---|------|--------|-----------|----------|
| 1.2.1 | 安装配置 Prisma + PostgreSQL | P0 | ⭐⭐⭐ | 30min |
| 1.2.2 | 创建数据模型 Schema | P0 | ⭐⭐⭐ | 45min |
| 1.2.3 | 生成数据库迁移 | P0 | ⭐⭐ | 15min |
| 1.2.4 | 创建种子数据脚本 | P1 | ⭐⭐⭐ | 30min |

---

#### 1.2.1 安装配置 Prisma + PostgreSQL

**子任务**：

| 步骤 | 操作 | 命令/文件 | 验收标准 |
|------|------|-----------|----------|
| 1 | 安装 Prisma | `npm install prisma @prisma/client` | 无报错 |
| 2 | 初始化 Prisma | `npx prisma init` | 生成 prisma/ 目录 |
| 3 | 配置数据库连接 | `.env.local` 中设置 DATABASE_URL | 格式正确 |
| 4 | 创建 Prisma 客户端单例 | `src/lib/prisma.ts` | 导出 prisma 实例 |
| 5 | 测试数据库连接 | `npx prisma db pull` 或手动测试 | 连接成功 |

**Prisma 客户端单例**：

```typescript
// src/lib/prisma.ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;
```

---

#### 1.2.2 创建数据模型 Schema

**子任务**：

| 步骤 | 操作 | 验收标准 |
|------|------|----------|
| 1 | 创建 Product 模型 | 包含所有字段及关联 |
| 2 | 创建 Category 模型 | 与 Product 一对多关系 |
| 3 | 创建 Image 模型 | 与 Product 多对一关系 |
| 4 | 创建 Page 模型 | JSON 字段正确定义 |
| 5 | 创建 Media 模型 | 文件元数据完整 |
| 6 | 创建 Job 模型 | 职位信息完整 |
| 7 | 创建 ContactMessage 模型 | 联系表单字段 |
| 8 | 创建 AdvisorQuestion 模型 | AI 问题配置 |
| 9 | 创建 RecommendationRule 模型 | AI 推荐规则 |
| 10 | 创建 Admin 模型 | 管理员认证 |
| 11 | 创建 Setting 模型 | 系统设置 |
| 12 | 验证 Schema 语法 | `npx prisma validate` 通过 |

**完整 Schema 定义**：

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ============================================
// 产品相关
// ============================================

model Product {
  id          String   @id @default(cuid())
  name        String   // 产品名称（中文）
  nameEn      String   // 产品名称（英文）
  slug        String   @unique // URL 标识
  description String   @db.Text // 产品描述
  price       Decimal  @db.Decimal(10, 2) // 参考价格
  capacity    String?  // 规格容量
  purchaseUrl String?  // 外部购买链接
  categoryId  String
  category    Category @relation(fields: [categoryId], references: [id])
  images      Image[]  // 产品图片
  ingredients String?  @db.Text // 成分说明
  usage       String?  @db.Text // 使用方法
  benefits    String[] // 功效标签
  order       Int      @default(0) // 排序（数字越小越靠前）
  featured    Boolean  @default(false) // 是否推荐
  published   Boolean  @default(false) // 是否发布
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([categoryId])
  @@index([published, order])
}

model Category {
  id        String    @id @default(cuid())
  name      String    // 分类名称（中文）
  nameEn    String    // 分类名称（英文）
  slug      String    @unique // URL 标识
  order     Int       @default(0) // 排序
  products  Product[] // 关联产品
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
}

model Image {
  id        String   @id @default(cuid())
  url       String   // 图片路径
  alt       String?  // 替代文本
  order     Int      @default(0) // 排序
  productId String
  product   Product  @relation(fields: [productId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())

  @@index([productId])
}

// ============================================
// 内容管理
// ============================================

model Page {
  id        String   @id @default(cuid())
  title     String   // 页面标题
  slug      String   @unique // 页面标识 (home, story, ritual, contact, careers, privacy)
  content   Json     // 页面内容（结构化 JSON）
  seo       Json?    // SEO 配置
  published Boolean  @default(false)
  updatedAt DateTime @updatedAt
}

model Media {
  id        String   @id @default(cuid())
  filename  String   // 原始文件名
  url       String   // 存储路径
  type      String   // MIME 类型
  size      Int      // 文件大小 (bytes)
  width     Int?     // 图片宽度
  height    Int?     // 图片高度
  alt       String?  // 替代文本
  createdAt DateTime @default(now())

  @@index([type])
}

// ============================================
// 职位管理
// ============================================

model Job {
  id           String   @id @default(cuid())
  title        String   // 职位名称（中文）
  titleEn      String   // 职位名称（英文）
  location     String   // 工作地点
  type         String   // 职位类型 (fulltime, parttime, intern)
  description  String   @db.Text // 职责描述
  requirements String   @db.Text // 任职要求
  salary       String?  // 薪资范围（可选）
  order        Int      @default(0) // 排序
  published    Boolean  @default(false)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@index([published, order])
}

// ============================================
// 联系留言
// ============================================

model ContactMessage {
  id        String   @id @default(cuid())
  name      String   // 留言人姓名
  email     String   // 邮箱
  content   String   @db.Text // 留言内容
  read      Boolean  @default(false) // 是否已读
  createdAt DateTime @default(now())

  @@index([read, createdAt(sort: Desc)])
}

// ============================================
// AI 护肤顾问
// ============================================

model AdvisorQuestion {
  id        String   @id @default(cuid())
  question  String   // 问题内容
  fieldName String   // 字段名 (skinType, concern, sleep, environment, routine, preference)
  type      String   @default("single") // 选择类型 (single, multiple)
  options   Json     // 选项列表 [{ value: 'dry', label: '干性肌肤', labelEn: 'Dry' }]
  order     Int      @default(0) // 排序
  active    Boolean  @default(true) // 是否启用
  updatedAt DateTime @updatedAt

  @@unique([fieldName])
  @@index([active, order])
}

model RecommendationRule {
  id         String   @id @default(cuid())
  conditions Json     // 条件组合 { skinType: ['dry'], concern: ['aging'] }
  productIds String[] // 推荐产品 ID 列表
  priority   Int      @default(0) // 优先级（数字越大越优先）
  message    String?  @db.Text // 推荐语
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@index([priority(sort: Desc)])
}

// ============================================
// 系统管理
// ============================================

model Admin {
  id        String   @id @default(cuid())
  email     String   @unique // 登录邮箱
  password  String   // 加密密码
  name      String   // 显示名称
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Setting {
  id        String   @id @default(cuid())
  key       String   @unique // 设置键名
  value     Json     // 设置值
  updatedAt DateTime @updatedAt
}
```

---

#### 1.2.3 生成数据库迁移

**子任务**：

| 步骤 | 操作 | 命令 | 验收标准 |
|------|------|------|----------|
| 1 | 创建初始迁移 | `npx prisma migrate dev --name init` | 迁移文件生成 |
| 2 | 验证数据库表 | `npx prisma studio` | 所有表可见 |
| 3 | 生成 Prisma Client | `npx prisma generate` | 类型定义生成 |

---

#### 1.2.4 创建种子数据脚本

**子任务**：

| 步骤 | 操作 | 文件 | 验收标准 |
|------|------|------|----------|
| 1 | 创建种子脚本 | `prisma/seed.ts` | 脚本可执行 |
| 2 | 配置 package.json | 添加 prisma.seed 配置 | 命令可用 |
| 3 | 安装 tsx | `npm install -D tsx` | 无报错 |
| 4 | 创建管理员账号 | 默认 admin@nihplod.cn | 可登录 |
| 5 | 创建示例分类 | 3-4 个产品分类 | 数据存在 |
| 6 | 创建 AI 问题 | 6 个问题配置 | 数据存在 |
| 7 | 创建默认设置 | 站点设置 | 数据存在 |
| 8 | 运行种子脚本 | `npx prisma db seed` | 数据插入成功 |

**种子脚本示例**：

```typescript
// prisma/seed.ts
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // 1. 创建默认管理员
  const hashedPassword = await bcrypt.hash('admin123456', 12);
  await prisma.admin.upsert({
    where: { email: 'admin@nihplod.cn' },
    update: {},
    create: {
      email: 'admin@nihplod.cn',
      password: hashedPassword,
      name: 'Admin',
    },
  });
  console.log('✅ 管理员账号已创建');

  // 2. 创建产品分类
  const categories = [
    { name: '面霜', nameEn: 'Cream', slug: 'cream', order: 1 },
    { name: '精华', nameEn: 'Serum', slug: 'serum', order: 2 },
    { name: '面膜', nameEn: 'Mask', slug: 'mask', order: 3 },
    { name: '套装', nameEn: 'Set', slug: 'set', order: 4 },
  ];
  for (const cat of categories) {
    await prisma.category.upsert({
      where: { slug: cat.slug },
      update: cat,
      create: cat,
    });
  }
  console.log('✅ 产品分类已创建');

  // 3. 创建 AI 问题
  const questions = [
    {
      fieldName: 'skinType',
      question: '你的肌肤类型是？',
      order: 1,
      options: [
        { value: 'dry', label: '干性肌肤', labelEn: 'Dry' },
        { value: 'oily', label: '油性肌肤', labelEn: 'Oily' },
        { value: 'combination', label: '混合性肌肤', labelEn: 'Combination' },
        { value: 'sensitive', label: '敏感性肌肤', labelEn: 'Sensitive' },
        { value: 'unknown', label: '不太确定', labelEn: 'Not Sure' },
      ],
    },
    {
      fieldName: 'concern',
      question: '你最关注的肌肤问题是？',
      order: 2,
      options: [
        { value: 'aging', label: '细纹抗老', labelEn: 'Anti-aging' },
        { value: 'dull', label: '暗沉提亮', labelEn: 'Brightening' },
        { value: 'hydration', label: '补水保湿', labelEn: 'Hydration' },
        { value: 'pores', label: '毛孔粗大', labelEn: 'Pores' },
        { value: 'sensitive', label: '敏感泛红', labelEn: 'Sensitivity' },
      ],
    },
    // ... 其他 4 个问题
  ];
  for (const q of questions) {
    await prisma.advisorQuestion.upsert({
      where: { fieldName: q.fieldName },
      update: q,
      create: q,
    });
  }
  console.log('✅ AI 问题已创建');

  // 4. 创建默认设置
  const settings = [
    {
      key: 'site',
      value: {
        name: 'NIHPLOD 旎柏',
        description: '源自摩纳哥的高端护肤品牌',
        logo: '/images/logo.svg',
      },
    },
    {
      key: 'social',
      value: {
        wechat_qrcode: '',
        weibo: '',
        xiaohongshu: '',
        douyin: '',
        instagram: '',
      },
    },
    {
      key: 'contact',
      value: {
        email: 'contact@nihplod.cn',
        phone: '',
        address: '',
      },
    },
  ];
  for (const s of settings) {
    await prisma.setting.upsert({
      where: { key: s.key },
      update: { value: s.value },
      create: s,
    });
  }
  console.log('✅ 系统设置已创建');

  console.log('🎉 种子数据初始化完成！');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

**package.json 配置**：

```json
{
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  }
}
```

---

### Phase 1.2 完成检查清单

| 检查项 | 验收标准 | 状态 |
|--------|----------|------|
| Prisma 安装 | `@prisma/client` 可导入 | ⬜ |
| Schema 验证 | `npx prisma validate` 通过 | ⬜ |
| 数据库迁移 | 所有表已创建 | ⬜ |
| Prisma Studio | `npx prisma studio` 可访问 | ⬜ |
| 种子数据 | 管理员账号可登录 | ⬜ |
| TypeScript 类型 | Prisma 类型可用 | ⬜ |

---

### 2.3 认证系统

**目标**：实现 CMS 后台的 JWT 认证

#### 任务清单

| # | 任务 | 优先级 | AI 辅助度 | 预计耗时 |
|---|------|--------|-----------|----------|
| 1.3.1 | 实现密码加密 (bcrypt) | P0 | ⭐⭐⭐ | 15min |
| 1.3.2 | 实现 JWT 生成与验证 | P0 | ⭐⭐⭐ | 30min |
| 1.3.3 | 创建登录 API 路由 | P0 | ⭐⭐⭐ | 30min |
| 1.3.4 | 创建认证中间件 | P0 | ⭐⭐⭐ | 30min |
| 1.3.5 | 创建登录页面 UI | P1 | ⭐⭐⭐ | 45min |

---

#### 1.3.1 实现密码加密

**子任务**：

| 步骤 | 操作 | 文件 | 验收标准 |
|------|------|------|----------|
| 1 | 安装 bcryptjs | `npm install bcryptjs` | 无报错 |
| 2 | 安装类型定义 | `npm install -D @types/bcryptjs` | 无报错 |
| 3 | 创建密码工具 | `src/lib/password.ts` | 导出 hash/verify 函数 |
| 4 | 测试加密验证 | 单元测试 | 加密/验证正确 |

**密码工具实现**：

```typescript
// src/lib/password.ts
import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hashedPassword: string
): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}
```

---

#### 1.3.2 实现 JWT 生成与验证

**子任务**：

| 步骤 | 操作 | 文件 | 验收标准 |
|------|------|------|----------|
| 1 | 安装 jsonwebtoken | `npm install jsonwebtoken` | 无报错 |
| 2 | 安装类型定义 | `npm install -D @types/jsonwebtoken` | 无报错 |
| 3 | 创建 JWT 工具 | `src/lib/jwt.ts` | 导出 sign/verify 函数 |
| 4 | 定义 Token Payload | `src/types/auth.ts` | 类型定义完整 |
| 5 | 测试 Token 流程 | 单元测试 | 生成/验证正确 |

**JWT 工具实现**：

```typescript
// src/lib/jwt.ts
import jwt from 'jsonwebtoken';
import type { AdminPayload } from '@/types/auth';

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export function signToken(payload: AdminPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
}

export function verifyToken(token: string): AdminPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AdminPayload;
  } catch {
    return null;
  }
}
```

```typescript
// src/types/auth.ts
export interface AdminPayload {
  id: string;
  email: string;
  name: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  message?: string;
  admin?: {
    id: string;
    email: string;
    name: string;
  };
}
```

---

#### 1.3.3 创建登录 API 路由

**子任务**：

| 步骤 | 操作 | 文件 | 验收标准 |
|------|------|------|----------|
| 1 | 创建登录验证 Schema | `src/schemas/auth.ts` | Zod Schema 完成 |
| 2 | 创建登录 API | `src/app/api/admin/login/route.ts` | POST 请求可用 |
| 3 | 创建登出 API | `src/app/api/admin/logout/route.ts` | POST 请求可用 |
| 4 | 创建获取当前用户 API | `src/app/api/admin/me/route.ts` | GET 请求可用 |
| 5 | 配置 Cookie 设置 | HttpOnly, Secure, SameSite | 安全配置正确 |
| 6 | 测试登录流程 | Postman/curl | 登录成功返回 Cookie |

**登录 API 实现**：

```typescript
// src/app/api/admin/login/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyPassword } from '@/lib/password';
import { signToken } from '@/lib/jwt';
import { LoginSchema } from '@/schemas/auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // 验证请求数据
    const result = LoginSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { success: false, message: '请求参数错误' },
        { status: 400 }
      );
    }

    const { email, password } = result.data;

    // 查找管理员
    const admin = await prisma.admin.findUnique({
      where: { email },
    });

    if (!admin) {
      return NextResponse.json(
        { success: false, message: '邮箱或密码错误' },
        { status: 401 }
      );
    }

    // 验证密码
    const isValid = await verifyPassword(password, admin.password);
    if (!isValid) {
      return NextResponse.json(
        { success: false, message: '邮箱或密码错误' },
        { status: 401 }
      );
    }

    // 生成 Token
    const token = signToken({
      id: admin.id,
      email: admin.email,
      name: admin.name,
    });

    // 设置 Cookie
    const response = NextResponse.json({
      success: true,
      admin: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
      },
    });

    response.cookies.set('admin_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 7, // 7 天
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('登录失败:', error);
    return NextResponse.json(
      { success: false, message: '服务器错误' },
      { status: 500 }
    );
  }
}
```

---

#### 1.3.4 创建认证中间件

**子任务**：

| 步骤 | 操作 | 文件 | 验收标准 |
|------|------|------|----------|
| 1 | 创建认证验证函数 | `src/lib/auth.ts` | 导出 verifyAuth 函数 |
| 2 | 创建 Next.js Middleware | `src/middleware.ts` | 中间件生效 |
| 3 | 配置保护路由 | `/admin/*` 需要认证 | 未登录跳转登录页 |
| 4 | 创建 withAuth 高阶函数 | `src/lib/auth.ts` | API 保护可用 |
| 5 | 测试认证流程 | 访问保护页面 | 正确重定向 |

**认证工具实现**：

```typescript
// src/lib/auth.ts
import { NextRequest } from 'next/server';
import { verifyToken } from './jwt';
import type { AdminPayload } from '@/types/auth';

export function getTokenFromRequest(request: NextRequest): string | null {
  return request.cookies.get('admin_token')?.value || null;
}

export function verifyAuth(request: NextRequest): AdminPayload | null {
  const token = getTokenFromRequest(request);
  if (!token) return null;
  return verifyToken(token);
}

// API 路由保护装饰器
export function withAuth(
  handler: (request: NextRequest, admin: AdminPayload) => Promise<Response>
) {
  return async (request: NextRequest) => {
    const admin = verifyAuth(request);
    if (!admin) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return handler(request, admin);
  };
}
```

**Next.js Middleware**：

```typescript
// src/middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyToken } from './lib/jwt';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 只保护 /admin 路由（排除登录页）
  if (pathname.startsWith('/admin') && !pathname.startsWith('/login')) {
    const token = request.cookies.get('admin_token')?.value;

    if (!token || !verifyToken(token)) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
```

---

#### 1.3.5 创建登录页面 UI

**子任务**：

| 步骤 | 操作 | 文件 | 验收标准 |
|------|------|------|----------|
| 1 | 创建登录页面布局 | `src/app/(admin)/login/layout.tsx` | 布局正确 |
| 2 | 创建登录表单组件 | `src/app/(admin)/login/page.tsx` | UI 完整 |
| 3 | 实现表单验证 | 前端 Zod 验证 | 错误提示正确 |
| 4 | 实现登录逻辑 | fetch 调用 API | 登录成功跳转 |
| 5 | 添加加载状态 | Loading 状态 | UX 流畅 |
| 6 | 添加错误处理 | 错误提示 | 错误信息友好 |
| 7 | 样式完善 | Tailwind CSS | 符合品牌风格 |

**登录页面视觉规范**：

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                    ┌─────────────────────┐                  │
│                    │                     │                  │
│                    │      NIHPLOD        │   ← Logo         │
│                    │       LOGO          │                  │
│                    │                     │                  │
│                    ├─────────────────────┤                  │
│                    │                     │                  │
│                    │  ┌───────────────┐  │                  │
│                    │  │ 邮箱地址      │  │   ← Input        │
│                    │  └───────────────┘  │                  │
│                    │                     │                  │
│                    │  ┌───────────────┐  │                  │
│                    │  │ 密码          │  │   ← Input        │
│                    │  └───────────────┘  │                  │
│                    │                     │                  │
│                    │  ┌───────────────┐  │                  │
│                    │  │    登 录      │  │   ← Button       │
│                    │  └───────────────┘  │                  │
│                    │                     │                  │
│                    └─────────────────────┘                  │
│                                                             │
│               背景色: #FAF8F5 (brand-cream)                  │
│               卡片: 白色, 圆角 16px, 阴影                     │
│               按钮: #C9A86C (brand-gold)                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

### Phase 1.3 完成检查清单

| 检查项 | 验收标准 | 状态 |
|--------|----------|------|
| 密码加密 | bcrypt hash 成功 | ⬜ |
| JWT 签发 | Token 生成成功 | ⬜ |
| JWT 验证 | Token 验证正确 | ⬜ |
| 登录 API | 登录返回 Token Cookie | ⬜ |
| 登出 API | Cookie 清除成功 | ⬜ |
| 中间件 | 未登录跳转登录页 | ⬜ |
| 登录页面 | UI 符合设计规范 | ⬜ |
| 完整流程 | 登录 → 访问后台 → 登出 | ⬜ |

---

### Phase 1 完成总检查清单

| 阶段 | 检查项 | 状态 |
|------|--------|------|
| **1.1 项目初始化** | Next.js + TypeScript + Tailwind | ⬜ |
| | Framer Motion + GSAP | ⬜ |
| | ESLint + Prettier | ⬜ |
| | 目录结构完整 | ⬜ |
| | 环境变量配置 | ⬜ |
| | Zod Schema | ⬜ |
| | Nodemailer | ⬜ |
| **1.2 数据库设计** | Prisma 安装配置 | ⬜ |
| | Schema 创建验证 | ⬜ |
| | 数据库迁移 | ⬜ |
| | 种子数据 | ⬜ |
| **1.3 认证系统** | 密码加密 | ⬜ |
| | JWT 工具 | ⬜ |
| | 登录 API | ⬜ |
| | 认证中间件 | ⬜ |
| | 登录页面 | ⬜ |

**预计总耗时**：约 8-10 小时（1.5 个工作日）

---

### AI Prompt 模板

```markdown
## 任务：实现 CMS 认证系统

### 需求
1. 管理员登录功能 (邮箱 + 密码)
2. JWT Token 存储在 HttpOnly Cookie
3. 密码使用 bcrypt 加密
4. API 路由保护中间件

### 文件结构
src/
├── lib/
│   ├── auth.ts          # 认证验证函数
│   ├── password.ts      # 密码加密
│   └── jwt.ts           # JWT 工具
├── types/
│   └── auth.ts          # 认证相关类型
├── schemas/
│   └── auth.ts          # 登录验证 Schema
├── middleware.ts        # Next.js 中间件
└── app/
    ├── (admin)/
    │   └── login/
    │       └── page.tsx # 登录页面
    └── api/admin/
        ├── login/route.ts   # 登录接口
        ├── logout/route.ts  # 登出接口
        └── me/route.ts      # 获取当前用户

### 安全要求
- JWT 过期时间：7天
- Cookie: HttpOnly, Secure, SameSite=Strict
- 密码最小长度：8位
- 登录失败返回通用错误信息

### 登录页面设计
- 背景色：#FAF8F5
- 卡片：白色背景，16px 圆角，阴影
- 按钮：#C9A86C 品牌金
- Logo 居中显示

请生成完整的认证系统代码。
```

---

## 三、Phase 2：CMS 后台开发 (Week 2-3)

### 3.1 后台布局与仪表盘

#### 任务清单

| # | 任务 | 优先级 | AI 辅助度 | 预计耗时 |
|---|------|--------|-----------|----------|
| 2.1.1 | 创建后台布局组件 (Sidebar + Header) | P0 | ⭐⭐⭐ | 2h |
| 2.1.2 | 实现仪表盘页面 | P1 | ⭐⭐⭐ | 1.5h |
| 2.1.3 | 创建通用 UI 组件 (Button, Input, Table, Modal) | P0 | ⭐⭐⭐ | 3h |

---

#### 2.1.1 创建后台布局组件

**子任务**：

| 步骤 | 操作 | 文件 | 验收标准 |
|------|------|------|----------|
| 1 | 创建后台布局 | `src/app/(admin)/admin/layout.tsx` | 布局结构正确 |
| 2 | 创建侧边栏组件 | `src/components/admin/Sidebar.tsx` | 导航菜单完整 |
| 3 | 创建顶部栏组件 | `src/components/admin/AdminHeader.tsx` | 面包屑+用户信息 |
| 4 | 实现移动端响应式 | 侧边栏折叠/展开 | 移动端体验良好 |
| 5 | 创建侧边栏状态 Hook | `src/hooks/useSidebar.ts` | 状态管理正常 |
| 6 | 添加登出功能 | 调用登出 API | 退出成功跳转 |

**侧边栏导航配置**：

```typescript
// src/config/admin-nav.ts
import {
  LayoutDashboard,
  Package,
  FolderTree,
  FileText,
  Image,
  Bot,
  Briefcase,
  MessageSquare,
  Settings,
} from 'lucide-react';

export const adminNavItems = [
  { title: '仪表盘', href: '/admin', icon: LayoutDashboard },
  { title: '产品管理', href: '/admin/products', icon: Package },
  { title: '分类管理', href: '/admin/categories', icon: FolderTree },
  { title: '页面内容', href: '/admin/pages', icon: FileText },
  { title: '媒体库', href: '/admin/media', icon: Image },
  { title: 'AI 顾问', href: '/admin/advisor', icon: Bot },
  { title: '职位管理', href: '/admin/jobs', icon: Briefcase },
  { title: '留言管理', href: '/admin/messages', icon: MessageSquare },
  { title: '系统设置', href: '/admin/settings', icon: Settings },
];
```

**布局结构图**：

```
┌────────────────────────────────────────────────────────────────────┐
│  侧边栏 (240px)         │        主内容区                          │
├─────────────────────────┼──────────────────────────────────────────┤
│                         │  ┌────────────────────────────────────┐  │
│  ┌───────────────────┐  │  │ AdminHeader                        │  │
│  │   NIHPLOD Logo    │  │  │ ← 面包屑导航        用户信息 ▼    │  │
│  └───────────────────┘  │  └────────────────────────────────────┘  │
│                         │                                          │
│  ┌───────────────────┐  │  ┌────────────────────────────────────┐  │
│  │ 📊 仪表盘         │  │  │                                    │  │
│  │ 📦 产品管理       │  │  │         页面主内容区域             │  │
│  │ 📁 分类管理       │  │  │           (children)               │  │
│  │ 📄 页面内容       │  │  │                                    │  │
│  │ 🖼️ 媒体库        │  │  │                                    │  │
│  │ 🤖 AI 顾问       │  │  │                                    │  │
│  │ 💼 职位管理       │  │  │                                    │  │
│  │ 💬 留言管理       │  │  │                                    │  │
│  │ ⚙️ 系统设置       │  │  │                                    │  │
│  └───────────────────┘  │  │                                    │  │
│                         │  │                                    │  │
│  ┌───────────────────┐  │  └────────────────────────────────────┘  │
│  │ 🚪 退出登录       │  │                                          │
│  └───────────────────┘  │                                          │
└─────────────────────────┴──────────────────────────────────────────┘

移动端 (<768px): 侧边栏默认隐藏，点击 ☰ 按钮展开覆盖层
```

---

#### 2.1.2 实现仪表盘页面

**子任务**：

| 步骤 | 操作 | 文件 | 验收标准 |
|------|------|------|----------|
| 1 | 创建仪表盘页面 | `src/app/(admin)/admin/page.tsx` | 页面渲染正常 |
| 2 | 创建统计卡片组件 | `src/components/admin/StatsCard.tsx` | 样式正确 |
| 3 | 获取统计数据 API | `src/app/api/admin/stats/route.ts` | 返回数据正确 |
| 4 | 显示产品总数 | 统计卡片 | 数据正确 |
| 5 | 显示未读留言数 | 统计卡片 | 数据正确 |
| 6 | 显示本月访问量 | 统计卡片（预留） | UI 正确 |
| 7 | 最近留言列表 | 最近 5 条 | 列表正确 |

**仪表盘布局**：

```
┌──────────────────────────────────────────────────────────────────┐
│  仪表盘                                                          │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐ │
│  │   产品数    │  │   分类数    │  │  未读留言   │  │  职位数    │ │
│  │     12     │  │     4      │  │     3      │  │     2      │ │
│  └────────────┘  └────────────┘  └────────────┘  └────────────┘ │
│                                                                  │
│  ┌─────────────────────────────────┐  ┌────────────────────────┐│
│  │  最近留言                        │  │  快捷操作              ││
│  │  ───────────────────────────    │  │  ────────────────────  ││
│  │  张三 | 2小时前                  │  │  + 新增产品            ││
│  │  想咨询产品购买...               │  │  + 上传媒体            ││
│  │                                 │  │  + 发布职位            ││
│  │  李四 | 5小时前                  │  │                        ││
│  │  请问有实体店吗...               │  │                        ││
│  └─────────────────────────────────┘  └────────────────────────┘│
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

#### 2.1.3 创建通用 UI 组件

**子任务**：

| 组件 | 文件 | Props | 验收标准 |
|------|------|-------|----------|
| Button | `src/components/ui/Button.tsx` | variant, size, loading, disabled | 样式变体完整 |
| Input | `src/components/ui/Input.tsx` | label, error, type | 表单验证集成 |
| Textarea | `src/components/ui/Textarea.tsx` | label, error, rows | 多行文本 |
| Select | `src/components/ui/Select.tsx` | options, placeholder | 下拉选择 |
| Switch | `src/components/ui/Switch.tsx` | checked, onChange | 开关切换 |
| Modal | `src/components/ui/Modal.tsx` | open, onClose, title | 模态框 |
| ConfirmDialog | `src/components/ui/ConfirmDialog.tsx` | 继承 Modal | 确认对话框 |
| DataTable | `src/components/admin/DataTable.tsx` | columns, data, pagination | 数据表格 |
| Pagination | `src/components/ui/Pagination.tsx` | total, page, onChange | 分页控件 |
| Badge | `src/components/ui/Badge.tsx` | variant | 状态徽章 |
| Skeleton | `src/components/ui/Skeleton.tsx` | className | 骨架屏 |
| Toast | `src/components/ui/Toast.tsx` | type, message | 提示消息 |

**Button 组件接口**：

```typescript
// src/components/ui/Button.tsx
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}
```

**DataTable 组件接口**：

```typescript
// src/components/admin/DataTable.tsx
interface Column<T> {
  key: keyof T | string;
  title: string;
  width?: string;
  render?: (value: any, record: T) => React.ReactNode;
  sortable?: boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    onChange: (page: number) => void;
  };
  rowKey?: keyof T | ((record: T) => string);
  onRowClick?: (record: T) => void;
  emptyText?: string;
}
```

---

### 3.2 产品管理模块

#### 任务清单

| # | 任务 | 优先级 | AI 辅助度 | 预计耗时 |
|---|------|--------|-----------|----------|
| 2.2.1 | 产品列表页 (分页、筛选、排序) | P0 | ⭐⭐⭐ | 2h |
| 2.2.2 | 产品新增/编辑页 | P0 | ⭐⭐⭐ | 3h |
| 2.2.3 | 产品 CRUD API 路由 | P0 | ⭐⭐⭐ | 2h |
| 2.2.4 | 分类管理 CRUD | P0 | ⭐⭐⭐ | 1.5h |
| 2.2.5 | 富文本编辑器集成 | P1 | ⭐⭐ | 1h |
| 2.2.6 | 图片上传与关联 | P0 | ⭐⭐ | 2h |

---

#### 2.2.1 产品列表页

**子任务**：

| 步骤 | 操作 | 文件 | 验收标准 |
|------|------|------|----------|
| 1 | 创建产品列表页 | `src/app/(admin)/admin/products/page.tsx` | 页面渲染正常 |
| 2 | 实现数据加载 | Server Component + Suspense | 数据正确显示 |
| 3 | 添加分页功能 | URL 参数 `?page=1` | 分页正常 |
| 4 | 添加分类筛选 | URL 参数 `?category=xxx` | 筛选生效 |
| 5 | 添加发布状态筛选 | URL 参数 `?status=published` | 筛选生效 |
| 6 | 添加搜索功能 | URL 参数 `?search=xxx` | 搜索生效 |
| 7 | 实现排序拖拽 | 更新 order 字段 | 拖拽保存成功 |
| 8 | 添加批量操作 | 批量删除/发布/取消发布 | 批量操作成功 |
| 9 | 添加快捷操作 | 编辑/删除/发布切换 | 操作成功 |

**列表页功能布局**：

```
┌──────────────────────────────────────────────────────────────────┐
│  产品管理                                          [+ 新增产品]  │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  🔍 搜索产品...          分类: [全部 ▼]    状态: [全部 ▼]        │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│  ☐  │ 图片   │ 产品名称          │ 分类  │ 价格   │ 状态  │ 操作 │
├──────────────────────────────────────────────────────────────────┤
│  ☐  │ [img]  │ 焕活精华露         │ 精华  │ ¥1280 │ 已发布 │ ⋮   │
│  ☐  │ [img]  │ 修护面霜           │ 面霜  │ ¥1680 │ 草稿  │ ⋮   │
│  ☐  │ [img]  │ 水润面膜           │ 面膜  │ ¥680  │ 已发布 │ ⋮   │
├──────────────────────────────────────────────────────────────────┤
│  已选择 2 项  [发布] [取消发布] [删除]     ◀ 1 2 3 ... 10 ▶      │
└──────────────────────────────────────────────────────────────────┘
```

---

#### 2.2.2 产品新增/编辑页

**子任务**：

| 步骤 | 操作 | 文件 | 验收标准 |
|------|------|------|----------|
| 1 | 创建新增页面 | `src/app/(admin)/admin/products/new/page.tsx` | 表单正确 |
| 2 | 创建编辑页面 | `src/app/(admin)/admin/products/[id]/edit/page.tsx` | 数据回填 |
| 3 | 创建产品表单组件 | `src/components/admin/ProductForm.tsx` | 复用性好 |
| 4 | 集成 Zod 验证 | 前端验证 | 错误提示正确 |
| 5 | 实现图片上传 | 多图上传 + 排序 | 上传成功 |
| 6 | 实现图片预览 | 缩略图预览 | 预览正常 |
| 7 | 功效标签管理 | 动态添加/删除 | 标签管理正常 |
| 8 | 保存草稿/发布 | 两种提交状态 | 保存成功 |

**产品表单字段**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | 文本 | ✅ | 产品名称（中文） |
| nameEn | 文本 | ✅ | 产品名称（英文） |
| slug | 文本 | ✅ | URL 标识（自动生成） |
| categoryId | 选择 | ✅ | 产品分类 |
| price | 数字 | ✅ | 参考价格 |
| capacity | 文本 | ❌ | 规格容量 |
| purchaseUrl | 文本 | ❌ | 外部购买链接 |
| description | 富文本 | ✅ | 产品描述 |
| ingredients | 富文本 | ❌ | 成分说明 |
| usage | 富文本 | ❌ | 使用方法 |
| benefits | 标签 | ❌ | 功效标签 |
| images | 图片 | ✅ | 产品图片（至少1张） |
| featured | 开关 | ❌ | 是否推荐 |
| published | 开关 | ❌ | 是否发布 |

---

#### 2.2.3 产品 CRUD API 路由

**API 清单**：

| 接口 | 方法 | 路径 | 说明 |
|------|------|------|------|
| 产品列表 | GET | `/api/admin/products` | 分页、筛选、排序 |
| 产品详情 | GET | `/api/admin/products/[id]` | 获取单个产品 |
| 创建产品 | POST | `/api/admin/products` | 新增产品 |
| 更新产品 | PUT | `/api/admin/products/[id]` | 修改产品 |
| 删除产品 | DELETE | `/api/admin/products/[id]` | 删除产品 |
| 批量操作 | POST | `/api/admin/products/batch` | 批量删除/发布 |
| 更新排序 | PUT | `/api/admin/products/order` | 拖拽排序 |

**子任务**：

| 步骤 | 操作 | 文件 | 验收标准 |
|------|------|------|----------|
| 1 | 创建产品验证 Schema | `src/schemas/product.ts` | 验证规则完整 |
| 2 | 实现列表 API | `src/app/api/admin/products/route.ts` | GET 返回分页数据 |
| 3 | 实现创建 API | `src/app/api/admin/products/route.ts` | POST 创建成功 |
| 4 | 实现详情 API | `src/app/api/admin/products/[id]/route.ts` | GET 返回详情 |
| 5 | 实现更新 API | `src/app/api/admin/products/[id]/route.ts` | PUT 更新成功 |
| 6 | 实现删除 API | `src/app/api/admin/products/[id]/route.ts` | DELETE 级联删除图片 |
| 7 | 实现批量操作 | `src/app/api/admin/products/batch/route.ts` | 批量操作成功 |
| 8 | 实现排序更新 | `src/app/api/admin/products/order/route.ts` | 排序保存成功 |

---

#### 2.2.4 分类管理 CRUD

**子任务**：

| 步骤 | 操作 | 文件 | 验收标准 |
|------|------|------|----------|
| 1 | 创建分类列表页 | `src/app/(admin)/admin/categories/page.tsx` | 页面正常 |
| 2 | 创建分类表单弹窗 | `src/components/admin/CategoryForm.tsx` | Modal 正常 |
| 3 | 实现分类 CRUD API | `src/app/api/admin/categories/` | 增删改查正常 |
| 4 | 实现拖拽排序 | 更新 order 字段 | 排序保存 |
| 5 | 添加删除保护 | 有产品时禁止删除 | 提示正确 |

---

#### 2.2.5 富文本编辑器集成

**选型**: 使用轻量级 Markdown 编辑器或简单 HTML 编辑器

| 步骤 | 操作 | 文件 | 验收标准 |
|------|------|------|----------|
| 1 | 选择编辑器库 | 评估 Tiptap / react-quill | 决定技术方案 |
| 2 | 安装编辑器 | `npm install @tiptap/react @tiptap/starter-kit` | 无报错 |
| 3 | 创建编辑器组件 | `src/components/ui/RichTextEditor.tsx` | 基础功能可用 |
| 4 | 配置工具栏 | 粗体、斜体、链接、列表 | 工具栏完整 |
| 5 | 集成到表单 | 产品表单集成 | 数据保存正确 |

---

#### 2.2.6 图片上传与关联

**子任务**：

| 步骤 | 操作 | 文件 | 验收标准 |
|------|------|------|----------|
| 1 | 安装 sharp | `npm install sharp` | 无报错 |
| 2 | 创建上传工具 | `src/lib/upload.ts` | 导出上传函数 |
| 3 | 创建上传 API | `src/app/api/upload/route.ts` | 上传成功 |
| 4 | 实现图片压缩 | sharp 压缩 + WebP 转换 | 文件体积减小 |
| 5 | 实现安全检查 | 类型/大小限制 | 非法文件拒绝 |
| 6 | 创建图片上传组件 | `src/components/admin/ImageUploader.tsx` | 拖拽上传 |
| 7 | 实现多图排序 | 拖拽排序 | 排序正确保存 |
| 8 | 实现图片删除 | 删除文件 + 数据库记录 | 删除成功 |

**上传配置**：

```typescript
// src/lib/upload.ts
export const uploadConfig = {
  maxFileSize: 5 * 1024 * 1024, // 5MB
  allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  uploadDir: 'public/uploads',
  quality: 80, // WebP 质量
  maxWidth: 2000, // 最大宽度
};
```

---

### 3.3 内容与媒体管理

#### 任务清单

| # | 任务 | 优先级 | AI 辅助度 | 预计耗时 |
|---|------|--------|-----------|----------|
| 2.3.1 | 页面内容管理 | P1 | ⭐⭐⭐ | 2h |
| 2.3.2 | 媒体库上传功能 | P0 | ⭐⭐⭐ | 1.5h |
| 2.3.3 | 媒体库列表与预览 | P0 | ⭐⭐⭐ | 1.5h |
| 2.3.4 | AI 问答配置界面 | P1 | ⭐⭐⭐ | 2h |

---

#### 2.3.1 页面内容管理

**子任务**：

| 步骤 | 操作 | 文件 | 验收标准 |
|------|------|------|----------|
| 1 | 创建页面列表 | `src/app/(admin)/admin/pages/page.tsx` | 显示所有页面 |
| 2 | 创建页面编辑 | `src/app/(admin)/admin/pages/[slug]/page.tsx` | 编辑功能正常 |
| 3 | 定义页面内容结构 | 不同页面不同 JSON Schema | 结构清晰 |
| 4 | 创建 SEO 编辑器 | SEO 字段编辑 | 保存正确 |
| 5 | 实现页面 API | `src/app/api/admin/pages/` | CRUD 正常 |

**页面内容 JSON 结构示例**：

```typescript
// 品牌故事页面 (story)
interface StoryPageContent {
  hero: {
    title: string;
    subtitle: string;
    backgroundImage: string;
  };
  sections: Array<{
    title: string;
    content: string;
    image?: string;
    layout: 'left' | 'right' | 'center';
  }>;
  timeline: Array<{
    year: string;
    event: string;
  }>;
}

// 联系我们页面 (contact)
interface ContactPageContent {
  title: string;
  subtitle: string;
  backgroundImage: string;
  address: string;
  email: string;
  phone?: string;
  mapEmbed?: string;
}
```

---

#### 2.3.2-2.3.3 媒体库管理

**子任务**：

| 步骤 | 操作 | 文件 | 验收标准 |
|------|------|------|----------|
| 1 | 创建媒体库列表页 | `src/app/(admin)/admin/media/page.tsx` | 网格/列表视图 |
| 2 | 实现拖拽上传区 | 拖拽 + 点击上传 | 上传体验好 |
| 3 | 实现批量上传 | 多文件同时上传 | 进度显示 |
| 4 | 实现图片预览 | 点击放大预览 | 预览正常 |
| 5 | 实现媒体信息编辑 | alt 文本编辑 | 保存成功 |
| 6 | 实现媒体删除 | 删除文件 + 记录 | 删除成功 |
| 7 | 实现搜索筛选 | 按类型/时间筛选 | 筛选生效 |
| 8 | 实现媒体选择器 | 可嵌入产品表单 | 选择功能正常 |

**媒体库布局**：

```
┌──────────────────────────────────────────────────────────────────┐
│  媒体库                                          [上传文件]      │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  🔍 搜索...          类型: [全部 ▼]    [🔲 网格] [☰ 列表]        │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐     │
│  │        │  │        │  │        │  │        │  │        │     │
│  │  [img] │  │  [img] │  │  [img] │  │  [img] │  │  [img] │     │
│  │        │  │        │  │        │  │        │  │        │     │
│  ├────────┤  ├────────┤  ├────────┤  ├────────┤  ├────────┤     │
│  │product │  │ hero   │  │ story  │  │product │  │ banner │     │
│  │ -1.jpg │  │ .jpg   │  │ 2.jpg  │  │ -2.jpg │  │ .jpg   │     │
│  └────────┘  └────────┘  └────────┘  └────────┘  └────────┘     │
│                                                                  │
│  ┌────────┐  ┌────────┐  ┌────────┐                             │
│  │        │  │        │  │        │                             │
│  │  [img] │  │  [img] │  │  [img] │                             │
│  │        │  │        │  │        │                             │
│  └────────┘  └────────┘  └────────┘                             │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

#### 2.3.4 AI 问答配置界面

**子任务**：

| 步骤 | 操作 | 文件 | 验收标准 |
|------|------|------|----------|
| 1 | 创建问题管理页 | `src/app/(admin)/admin/advisor/page.tsx` | 问题列表显示 |
| 2 | 创建问题编辑表单 | `src/components/admin/QuestionForm.tsx` | 编辑功能正常 |
| 3 | 实现选项管理 | 动态添加/删除选项 | 选项管理正常 |
| 4 | 实现问题排序 | 拖拽排序 | 排序保存 |
| 5 | 创建推荐规则管理 | `src/app/(admin)/admin/advisor/rules/page.tsx` | 规则列表显示 |
| 6 | 创建规则编辑表单 | 条件选择 + 产品选择 | 规则保存正确 |
| 7 | 实现 AI 设置 | API Key、提示词配置 | 设置保存 |

---

### 3.4 职位与留言管理

#### 任务清单

| # | 任务 | 优先级 | AI 辅助度 | 预计耗时 |
|---|------|--------|-----------|----------|
| 2.4.1 | 职位管理 CRUD | P1 | ⭐⭐⭐ | 2h |
| 2.4.2 | 留言列表与已读标记 | P1 | ⭐⭐⭐ | 1.5h |
| 2.4.3 | 系统设置页面 | P2 | ⭐⭐⭐ | 2h |

---

#### 2.4.1 职位管理 CRUD

**子任务**：

| 步骤 | 操作 | 文件 | 验收标准 |
|------|------|------|----------|
| 1 | 创建职位列表页 | `src/app/(admin)/admin/jobs/page.tsx` | 列表显示 |
| 2 | 创建职位表单页 | `src/app/(admin)/admin/jobs/new/page.tsx` | 新增正常 |
| 3 | 创建职位编辑页 | `src/app/(admin)/admin/jobs/[id]/edit/page.tsx` | 编辑正常 |
| 4 | 实现职位 API | `src/app/api/admin/jobs/` | CRUD 正常 |
| 5 | 实现发布状态切换 | 一键发布/下架 | 状态切换成功 |

**职位表单字段**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| title | 文本 | ✅ | 职位名称（中文） |
| titleEn | 文本 | ✅ | 职位名称（英文） |
| location | 文本 | ✅ | 工作地点 |
| type | 选择 | ✅ | 全职/兼职/实习 |
| description | 富文本 | ✅ | 职责描述 |
| requirements | 富文本 | ✅ | 任职要求 |
| salary | 文本 | ❌ | 薪资范围 |
| published | 开关 | ❌ | 是否发布 |

---

#### 2.4.2 留言列表与已读标记

**子任务**：

| 步骤 | 操作 | 文件 | 验收标准 |
|------|------|------|----------|
| 1 | 创建留言列表页 | `src/app/(admin)/admin/messages/page.tsx` | 列表显示 |
| 2 | 实现未读筛选 | 筛选未读留言 | 筛选正确 |
| 3 | 实现已读标记 | 点击标记已读 | 状态更新 |
| 4 | 实现批量已读 | 批量标记 | 批量成功 |
| 5 | 实现留言详情 | 抽屉/弹窗显示 | 详情正确 |
| 6 | 实现删除功能 | 删除留言 | 删除成功 |
| 7 | 实现留言 API | `src/app/api/admin/messages/` | API 正常 |

---

#### 2.4.3 系统设置页面

**子任务**：

| 步骤 | 操作 | 文件 | 验收标准 |
|------|------|------|----------|
| 1 | 创建设置页面 | `src/app/(admin)/admin/settings/page.tsx` | 页面正常 |
| 2 | 站点基本信息 | 名称、描述、Logo | 保存成功 |
| 3 | 社交媒体链接 | 微信、微博等 | 保存成功 |
| 4 | 联系信息 | 邮箱、电话、地址 | 保存成功 |
| 5 | AI 服务配置 | API 类型、Key、模型 | 保存成功 |
| 6 | 邮件通知配置 | SMTP 配置（只读） | 显示正确 |
| 7 | 实现设置 API | `src/app/api/admin/settings/` | 读写正常 |

**设置页面布局**：

```
┌──────────────────────────────────────────────────────────────────┐
│  系统设置                                                        │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─ 站点信息 ─────────────────────────────────────────────────┐ │
│  │  站点名称: [NIHPLOD 旎柏                              ]    │ │
│  │  站点描述: [源自摩纳哥的高端护肤品牌                    ]    │ │
│  │  Logo:     [选择文件]  当前: logo.svg                      │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌─ 社交媒体 ─────────────────────────────────────────────────┐ │
│  │  微信公众号: [上传二维码]                                   │ │
│  │  微博:      [https://weibo.com/nihplod               ]     │ │
│  │  小红书:    [https://xiaohongshu.com/...             ]     │ │
│  │  抖音:      [https://douyin.com/...                  ]     │ │
│  │  Instagram: [https://instagram.com/nihplod          ]     │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌─ AI 服务配置 ──────────────────────────────────────────────┐ │
│  │  启用 AI: [✓]                                              │ │
│  │  服务商:  [OpenAI ▼]                                       │ │
│  │  API Key: [sk-****************************         ]      │ │
│  │  模型:    [gpt-4o ▼]                                       │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                  │
│                                              [保存设置]          │
└──────────────────────────────────────────────────────────────────┘
```

---

### Phase 2 完成检查清单

| 模块 | 检查项 | 状态 |
|------|--------|------|
| **布局与仪表盘** | 后台布局组件 | ⬜ |
| | 侧边栏导航 | ⬜ |
| | 仪表盘统计 | ⬜ |
| | 通用 UI 组件 | ⬜ |
| **产品管理** | 产品列表（分页/筛选） | ⬜ |
| | 产品新增/编辑 | ⬜ |
| | 产品 CRUD API | ⬜ |
| | 分类管理 | ⬜ |
| | 富文本编辑器 | ⬜ |
| | 图片上传 | ⬜ |
| **内容与媒体** | 页面内容管理 | ⬜ |
| | 媒体库上传 | ⬜ |
| | 媒体库列表 | ⬜ |
| | AI 问答配置 | ⬜ |
| **职位与留言** | 职位管理 | ⬜ |
| | 留言管理 | ⬜ |
| | 系统设置 | ⬜ |

**预计总耗时**：约 25-30 小时（4-5 个工作日）

---

## 四、Phase 3：前台页面开发 (Week 4-5)

### 4.1 通用组件开发

#### 任务清单

| # | 任务 | 优先级 | AI 辅助度 | 预计耗时 |
|---|------|--------|-----------|----------|
| 3.1.1 | 顶部导航栏组件 | P0 | ⭐⭐⭐ | 1.5h |
| 3.1.2 | 底部导航栏组件 | P0 | ⭐⭐⭐ | 1h |
| 3.1.3 | 悬浮卡片布局组件 (FloatingCardLayout) | P0 | ⭐⭐ | 3h |
| 3.1.4 | 产品卡片组件 | P0 | ⭐⭐⭐ | 1h |

---

#### 3.1.1 顶部导航栏组件

**子任务**：

| 步骤 | 操作 | 文件 | 验收标准 |
|------|------|------|----------|
| 1 | 创建 Header 组件 | `src/components/website/Header.tsx` | 组件渲染正常 |
| 2 | 实现 Logo 区域 | 点击返回首页 | 链接正确 |
| 3 | 实现桌面端导航 | 导航菜单项 | 高亮当前页 |
| 4 | 实现移动端汉堡菜单 | 点击展开/收起 | 动画流畅 |
| 5 | 实现滚动透明变化 | 滚动后背景变白 | 过渡自然 |
| 6 | 添加 AI 顾问入口 | 醒目 CTA 按钮 | 样式突出 |

**Header 布局**：

```
桌面端 (>1024px):
┌────────────────────────────────────────────────────────────────┐
│  [LOGO]    产品系列  品牌故事  护肤仪式  联系我们   [AI护肤顾问] │
└────────────────────────────────────────────────────────────────┘

移动端 (<768px):
┌────────────────────────────────────────────────────────────────┐
│  ☰           [LOGO]                           [AI护肤顾问]     │
└────────────────────────────────────────────────────────────────┘
↓ 展开菜单
┌────────────────────────────────────────────────────────────────┐
│  产品系列                                                      │
│  品牌故事                                                      │
│  护肤仪式                                                      │
│  联系我们                                                      │
│  加入我们                                                      │
└────────────────────────────────────────────────────────────────┘
```

---

#### 3.1.2 底部导航栏组件

**子任务**：

| 步骤 | 操作 | 文件 | 验收标准 |
|------|------|------|----------|
| 1 | 创建 Footer 组件 | `src/components/website/Footer.tsx` | 组件渲染正常 |
| 2 | 实现品牌信息区 | Logo + Slogan | 样式正确 |
| 3 | 实现导航链接 | 快速链接列表 | 链接有效 |
| 4 | 实现社交媒体图标 | 微信/微博/小红书等 | 图标显示 |
| 5 | 实现版权信息 | 备案号 + 隐私政策 | 信息完整 |
| 6 | 响应式适配 | 移动端垂直布局 | 布局正确 |

**Footer 布局**：

```
┌────────────────────────────────────────────────────────────────┐
│                                                                │
│   ┌─────────────┐    ┌──────────────┐    ┌──────────────────┐ │
│   │ NIHPLOD     │    │  快速链接     │    │  关注我们        │ │
│   │ 旎柏        │    │  ──────────  │    │  ──────────────  │ │
│   │             │    │  产品系列     │    │  [微信] [微博]   │ │
│   │ 源自摩纳哥   │    │  品牌故事     │    │  [小红书] [抖音] │ │
│   │ 的高端护肤   │    │  护肤仪式     │    │  [Instagram]    │ │
│   │ 品牌        │    │  联系我们     │    │                  │ │
│   │             │    │  加入我们     │    │                  │ │
│   └─────────────┘    └──────────────┘    └──────────────────┘ │
│                                                                │
├────────────────────────────────────────────────────────────────┤
│   © 2024 NIHPLOD. All rights reserved.    隐私政策 | 使用条款  │
└────────────────────────────────────────────────────────────────┘
```

---

#### 3.1.3 悬浮卡片布局组件

**子任务**：

| 步骤 | 操作 | 文件 | 验收标准 |
|------|------|------|----------|
| 1 | 创建基础结构 | `src/components/website/FloatingCardLayout.tsx` | 结构正确 |
| 2 | 实现背景图层 | 固定定位 + 视差 | 视差效果 |
| 3 | 实现卡片容器 | 底部固定 + 可拖拽 | 定位正确 |
| 4 | 实现三种状态 | expanded/half/minimized | 状态切换正常 |
| 5 | 实现拖拽手势 | Framer Motion useDrag | 拖拽响应 |
| 6 | 实现吸附逻辑 | 释放后自动吸附 | 吸附自然 |
| 7 | 实现拖动手柄 | 顶部指示条 | 点击切换 |
| 8 | 实现内容滚动 | 独立滚动区域 | 滚动正常 |
| 9 | 实现响应式 | 移动端/平板/桌面 | 布局适配 |
| 10 | 添加动画降级 | prefers-reduced-motion | 降级正常 |

**FloatingCardLayout 接口**：

```typescript
// src/components/website/FloatingCardLayout.tsx
interface FloatingCardLayoutProps {
  backgroundImage: string;
  backgroundAlt?: string;
  children: React.ReactNode;
  initialState?: 'expanded' | 'half' | 'minimized';
  enableDrag?: boolean; // 默认 true
  showHandle?: boolean; // 默认 true
  className?: string;
}

// 状态高度配置
const stateHeights = {
  expanded: 0.85,  // 85% 视口高度
  half: 0.55,      // 55% 视口高度
  minimized: 0.15, // 15% 视口高度
};
```

**布局结构图**：

```
┌─────────────────────────────────────────┐
│                                         │
│          背景图片层 (fixed)              │
│          - 全屏覆盖                      │
│          - 视差滚动效果                  │
│                                         │
│                                         │
├─────────────────────────────────────────┤  ← 卡片顶部（可拖拽）
│  ━━━━━━━━━  拖动手柄                     │
│                                         │
│         内容区域 (可滚动)                 │
│         - 标题                          │
│         - 正文内容                       │
│         - 图片                          │
│         - ...                           │
│                                         │
│                                         │
└─────────────────────────────────────────┘
```

---

#### 3.1.4 产品卡片组件

**子任务**：

| 步骤 | 操作 | 文件 | 验收标准 |
|------|------|------|----------|
| 1 | 创建 ProductCard 组件 | `src/components/website/ProductCard.tsx` | 组件正常 |
| 2 | 实现图片展示 | 主图 + hover 切换 | 切换流畅 |
| 3 | 实现产品信息 | 名称 + 价格 | 信息完整 |
| 4 | 实现点击交互 | 打开详情抽屉 | 交互正确 |
| 5 | 添加加载动画 | 骨架屏/淡入 | 加载友好 |
| 6 | 响应式适配 | 网格布局适配 | 布局正确 |

**ProductCard 接口**：

```typescript
interface ProductCardProps {
  product: {
    id: string;
    name: string;
    nameEn: string;
    slug: string;
    price: number;
    capacity?: string;
    images: { url: string; alt?: string }[];
    category: { name: string };
  };
  onClick?: () => void;
  priority?: boolean; // LCP 优化
}
```

---

### 4.2 页面开发

#### 任务清单

| # | 任务 | 优先级 | AI 辅助度 | 预计耗时 |
|---|------|--------|-----------|----------|
| 3.2.1 | 首页 (双入口 + 网格背景) `/` | P0 | ⭐⭐⭐ | 3h |
| 3.2.2 | 品牌故事页 `/story` | P1 | ⭐⭐⭐ | 2h |
| 3.2.3 | 产品列表页 `/products` | P0 | ⭐⭐⭐ | 2.5h |
| 3.2.4 | 产品详情页 `/products/[slug]` | P0 | ⭐⭐⭐ | 2.5h |
| 3.2.5 | 产品详情抽屉组件 | P0 | ⭐⭐⭐ | 1.5h |
| 3.2.6 | 护肤仪式页 `/ritual` | P1 | ⭐⭐⭐ | 2h |
| 3.2.7 | 联系我们页 `/contact` | P2 | ⭐⭐⭐ | 2h |
| 3.2.8 | 招聘页面 `/careers` | P2 | ⭐⭐⭐ | 1.5h |
| 3.2.9 | 隐私政策页 `/privacy` | P1 | ⭐⭐⭐ | 1h |

---

#### 3.2.1 首页开发

**子任务**：

| 步骤 | 操作 | 文件 | 验收标准 |
|------|------|------|----------|
| 1 | 创建首页 | `src/app/(website)/page.tsx` | 页面渲染 |
| 2 | 实现全屏背景 | 品牌视觉背景 | 图片适配 |
| 3 | 实现网格装饰 | 金色线条网格 | 动态效果 |
| 4 | 实现双入口布局 | 左右两个入口 | 布局正确 |
| 5 | 实现 AI 顾问入口 | 主 CTA | 样式突出 |
| 6 | 实现产品浏览入口 | 次级入口 | 样式协调 |
| 7 | 添加入场动画 | 淡入 + 上移 | 动画流畅 |
| 8 | 添加鼠标交互 | hover 效果 | 交互反馈 |

**首页布局**：

```
┌────────────────────────────────────────────────────────────────┐
│                                                                │
│                        NIHPLOD                                 │
│                         旎柏                                   │
│                                                                │
│                   源自摩纳哥的高端护肤品牌                       │
│                                                                │
│      ┌─────────────────┐      ┌─────────────────┐             │
│      │                 │      │                 │             │
│      │   🤖 AI 护肤顾问 │      │   📦 探索产品    │             │
│      │                 │      │                 │             │
│      │  回答几个问题    │      │  浏览全系列产品   │             │
│      │  获取专属推荐    │      │                 │             │
│      │                 │      │                 │             │
│      └─────────────────┘      └─────────────────┘             │
│                                                                │
│   ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ 网格装饰线 ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─    │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

#### 3.2.3-3.2.5 产品页面开发

**产品列表页子任务**：

| 步骤 | 操作 | 文件 | 验收标准 |
|------|------|------|----------|
| 1 | 创建产品列表页 | `src/app/(website)/products/page.tsx` | 页面渲染 |
| 2 | 使用悬浮卡片布局 | FloatingCardLayout | 布局正确 |
| 3 | 实现分类筛选 | Tab 切换 | 筛选生效 |
| 4 | 实现产品网格 | 响应式网格 | 布局适配 |
| 5 | 数据获取 | Server Component | 数据正确 |
| 6 | SEO 优化 | generateMetadata | 元数据正确 |

**产品详情页子任务**：

| 步骤 | 操作 | 文件 | 验收标准 |
|------|------|------|----------|
| 1 | 创建详情页 | `src/app/(website)/products/[slug]/page.tsx` | 动态路由 |
| 2 | 实现图片轮播 | 主图 + 缩略图 | 切换正常 |
| 3 | 实现产品信息 | 名称/价格/规格 | 信息完整 |
| 4 | 实现功效标签 | Tag 列表 | 样式正确 |
| 5 | 实现描述 Tab | 描述/成分/使用方法 | Tab 切换 |
| 6 | 实现购买按钮 | 跳转外部链接 | 链接正确 |
| 7 | 实现相关推荐 | 同分类产品 | 推荐正确 |
| 8 | generateStaticParams | 静态生成 | 预渲染成功 |

**产品详情抽屉子任务**：

| 步骤 | 操作 | 文件 | 验收标准 |
|------|------|------|----------|
| 1 | 创建抽屉组件 | `src/components/website/ProductDrawer.tsx` | 组件正常 |
| 2 | 实现滑入动画 | 从右侧滑入 | 动画流畅 |
| 3 | 实现遮罩层 | 点击关闭 | 交互正确 |
| 4 | 实现内容区 | 复用详情信息 | 信息一致 |
| 5 | 实现关闭按钮 | X 按钮 | 关闭正常 |
| 6 | 锁定背景滚动 | body overflow | 滚动锁定 |

---

#### 3.2.7 联系我们页

**子任务**：

| 步骤 | 操作 | 文件 | 验收标准 |
|------|------|------|----------|
| 1 | 创建联系页 | `src/app/(website)/contact/page.tsx` | 页面渲染 |
| 2 | 使用悬浮卡片布局 | FloatingCardLayout | 布局正确 |
| 3 | 实现联系信息 | 邮箱/电话/地址 | 信息完整 |
| 4 | 实现留言表单 | 姓名/邮箱/内容 | 表单验证 |
| 5 | 实现蜜罐字段 | 隐藏字段 | 防刷有效 |
| 6 | 实现提交逻辑 | 调用 API | 提交成功 |
| 7 | 实现成功/错误提示 | Toast 提示 | 反馈正确 |
| 8 | 添加加载状态 | 按钮 Loading | 状态显示 |

---

### 4.3 错误页面与状态组件

#### 任务清单

| # | 任务 | 优先级 | AI 辅助度 | 预计耗时 |
|---|------|--------|-----------|----------|
| 3.3.1 | 404 错误页面 | P1 | ⭐⭐⭐ | 30min |
| 3.3.2 | 500 错误页面 | P1 | ⭐⭐⭐ | 30min |
| 3.3.3 | 空状态组件 | P2 | ⭐⭐⭐ | 30min |
| 3.3.4 | 加载骨架屏组件 | P2 | ⭐⭐⭐ | 45min |
| 3.3.5 | Toast 提示组件 | P1 | ⭐⭐⭐ | 1h |

---

#### 3.3.1-3.3.2 错误页面

**子任务**：

| 步骤 | 操作 | 文件 | 验收标准 |
|------|------|------|----------|
| 1 | 创建 404 页面 | `src/app/not-found.tsx` | 404 显示 |
| 2 | 创建 500 页面 | `src/app/error.tsx` | 错误捕获 |
| 3 | 设计视觉样式 | 品牌风格一致 | 样式协调 |
| 4 | 添加返回首页按钮 | 导航链接 | 链接有效 |
| 5 | 添加品牌 Logo | 品牌识别 | 显示正确 |

---

#### 3.3.5 Toast 提示组件

**子任务**：

| 步骤 | 操作 | 文件 | 验收标准 |
|------|------|------|----------|
| 1 | 创建 Toast 组件 | `src/components/ui/Toast.tsx` | 组件正常 |
| 2 | 创建 ToastProvider | `src/components/providers/ToastProvider.tsx` | Context 正常 |
| 3 | 创建 useToast Hook | `src/hooks/useToast.ts` | Hook 可用 |
| 4 | 实现 success 类型 | 绿色成功提示 | 样式正确 |
| 5 | 实现 error 类型 | 红色错误提示 | 样式正确 |
| 6 | 实现 loading 类型 | 加载中提示 | 样式正确 |
| 7 | 实现自动消失 | 3 秒后消失 | 定时器正确 |
| 8 | 实现堆叠显示 | 多条提示堆叠 | 布局正确 |

**Toast 接口**：

```typescript
// src/hooks/useToast.ts
interface ToastOptions {
  type: 'success' | 'error' | 'loading' | 'info';
  message: string;
  duration?: number; // 毫秒，默认 3000
}

interface UseToast {
  toast: (options: ToastOptions) => string; // 返回 toast id
  success: (message: string) => void;
  error: (message: string) => void;
  loading: (message: string) => string;
  dismiss: (id?: string) => void; // 关闭指定或全部
}
```

---

### Phase 3 完成检查清单

| 模块 | 检查项 | 状态 |
|------|--------|------|
| **通用组件** | Header 导航栏 | ⬜ |
| | Footer 页脚 | ⬜ |
| | FloatingCardLayout | ⬜ |
| | ProductCard | ⬜ |
| **页面开发** | 首页 | ⬜ |
| | 品牌故事页 | ⬜ |
| | 产品列表页 | ⬜ |
| | 产品详情页 | ⬜ |
| | 产品详情抽屉 | ⬜ |
| | 护肤仪式页 | ⬜ |
| | 联系我们页 | ⬜ |
| | 招聘页面 | ⬜ |
| | 隐私政策页 | ⬜ |
| **状态组件** | 404 页面 | ⬜ |
| | 500 页面 | ⬜ |
| | 空状态组件 | ⬜ |
| | 骨架屏组件 | ⬜ |
| | Toast 组件 | ⬜ |

**预计总耗时**：约 25-30 小时（4-5 个工作日）

> 📝 注：品牌故事、产品、护肤仪式、联系我们、招聘、隐私政策页面均采用 UX 文档 1.2 节定义的悬浮卡片布局模式

---

## 五、Phase 4：AI 护肤顾问 (Week 6)

### 5.1 问答流程

#### 任务清单

| # | 任务 | 优先级 | AI 辅助度 | 预计耗时 |
|---|------|--------|-----------|----------|
| 4.1.1 | 欢迎页 (Step 0) | P0 | ⭐⭐⭐ | 1h |
| 4.1.2 | 问题页面组件 (Step 1-6) | P0 | ⭐⭐⭐ | 3h |
| 4.1.3 | 进度指示器 | P1 | ⭐⭐⭐ | 30min |
| 4.1.4 | 页面切换动画 | P1 | ⭐⭐ | 1h |
| 4.1.5 | 答案状态管理 | P0 | ⭐⭐⭐ | 1h |

---

#### 4.1.1 欢迎页 (Step 0)

**子任务**：

| 步骤 | 操作 | 文件 | 验收标准 |
|------|------|------|----------|
| 1 | 创建 advisor 布局 | `src/app/(website)/advisor/layout.tsx` | 布局正确 |
| 2 | 创建欢迎页 | `src/app/(website)/advisor/page.tsx` | 页面渲染 |
| 3 | 设计欢迎视觉 | 品牌风格一致 | 样式正确 |
| 4 | 添加开始按钮 | CTA 按钮 | 点击跳转 |
| 5 | 添加说明文案 | 流程说明 | 文案清晰 |
| 6 | 添加入场动画 | Framer Motion | 动画流畅 |

**欢迎页布局**：

```
┌────────────────────────────────────────────────────────────────┐
│                                                                │
│                                                                │
│                        ✨ AI 护肤顾问                          │
│                                                                │
│                  花2分钟回答几个简单问题                         │
│                  获取专属于你的护肤方案                          │
│                                                                │
│                                                                │
│               ┌──────────────────────────────┐                 │
│               │                              │                 │
│               │         开始测试             │                 │
│               │                              │                 │
│               └──────────────────────────────┘                 │
│                                                                │
│                                                                │
│                   共 6 道题 · 约 2 分钟                         │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

#### 4.1.2 问题页面组件 (Step 1-6)

**子任务**：

| 步骤 | 操作 | 文件 | 验收标准 |
|------|------|------|----------|
| 1 | 创建问答页面 | `src/app/(website)/advisor/questions/page.tsx` | 页面渲染 |
| 2 | 创建问题组件 | `src/components/website/advisor/QuestionStep.tsx` | 组件正常 |
| 3 | 创建选项组件 | `src/components/website/advisor/OptionCard.tsx` | 选项可点击 |
| 4 | 动态加载问题 | 从 API 获取或本地配置 | 数据正确 |
| 5 | 实现选项选择 | 点击后高亮 + 自动下一题 | 交互正确 |
| 6 | 实现问题切换 | 动画过渡 | 过渡流畅 |

**问题配置**：

```typescript
// src/config/advisor-questions.ts
export const advisorQuestions = [
  {
    id: 1,
    fieldName: 'skinType',
    question: '你的肌肤类型是？',
    options: [
      { value: 'dry', label: '干性肌肤', description: '常感紧绷、脱皮' },
      { value: 'oily', label: '油性肌肤', description: '容易出油、有光泽' },
      { value: 'combination', label: '混合性肌肤', description: 'T区油、两颊干' },
      { value: 'sensitive', label: '敏感性肌肤', description: '易泛红、刺激' },
      { value: 'unknown', label: '不太确定', description: '需要专业判断' },
    ],
  },
  {
    id: 2,
    fieldName: 'concern',
    question: '你最关注的肌肤问题是？',
    options: [
      { value: 'aging', label: '细纹抗老', description: '淡化细纹、紧致' },
      { value: 'dull', label: '暗沉提亮', description: '提亮肤色、焕发光彩' },
      { value: 'hydration', label: '补水保湿', description: '深层补水、锁水' },
      { value: 'pores', label: '毛孔粗大', description: '收缩毛孔、细腻' },
      { value: 'sensitive', label: '敏感泛红', description: '舒缓镇静、修护' },
    ],
  },
  // ... 其他 4 个问题
];
```

**问题页面布局**：

```
┌────────────────────────────────────────────────────────────────┐
│  ← 返回                                              1 / 6     │
│  ━━━━━━━━━━━━━━━━━━━━━━━░░░░░░░░░░░░░░░░░░░░░░░░░░░░  进度条   │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│                                                                │
│                    你的肌肤类型是？                             │
│                                                                │
│                                                                │
│       ┌─────────────────────────────────────────────┐          │
│       │  干性肌肤                                    │          │
│       │  常感紧绷、脱皮                              │          │
│       └─────────────────────────────────────────────┘          │
│                                                                │
│       ┌─────────────────────────────────────────────┐          │
│       │  油性肌肤                                    │          │
│       │  容易出油、有光泽                            │          │
│       └─────────────────────────────────────────────┘          │
│                                                                │
│       ┌─────────────────────────────────────────────┐          │
│       │  混合性肌肤                                  │          │
│       │  T区油、两颊干                               │          │
│       └─────────────────────────────────────────────┘          │
│                                                                │
│       ...                                                      │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

#### 4.1.3 进度指示器

**子任务**：

| 步骤 | 操作 | 文件 | 验收标准 |
|------|------|------|----------|
| 1 | 创建进度条组件 | `src/components/website/advisor/ProgressBar.tsx` | 组件正常 |
| 2 | 显示当前步骤 | 1/6 格式 | 数字正确 |
| 3 | 显示进度条 | 填充动画 | 动画流畅 |
| 4 | 响应式适配 | 移动端样式 | 显示正确 |

---

#### 4.1.4 页面切换动画

**子任务**：

| 步骤 | 操作 | 文件 | 验收标准 |
|------|------|------|----------|
| 1 | 实现进入动画 | 从右侧滑入 | 动画流畅 |
| 2 | 实现退出动画 | 向左侧滑出 | 动画流畅 |
| 3 | 实现返回动画 | 方向相反 | 动画正确 |
| 4 | 添加动画降级 | prefers-reduced-motion | 降级正常 |

**动画配置**：

```typescript
// src/components/website/advisor/animations.ts
export const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 300 : -300,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction < 0 ? 300 : -300,
    opacity: 0,
  }),
};

export const slideTransition = {
  x: { type: 'spring', stiffness: 300, damping: 30 },
  opacity: { duration: 0.2 },
};
```

---

#### 4.1.5 答案状态管理

**子任务**：

| 步骤 | 操作 | 文件 | 验收标准 |
|------|------|------|----------|
| 1 | 创建 AdvisorContext | `src/contexts/AdvisorContext.tsx` | Context 正常 |
| 2 | 创建 useAdvisor Hook | `src/hooks/useAdvisor.ts` | Hook 可用 |
| 3 | 实现状态持久化 | sessionStorage | 刷新保留 |
| 4 | 实现重置功能 | 清空答案 | 重置成功 |
| 5 | 实现完成检测 | 所有问题已答 | 检测正确 |

**状态类型**：

```typescript
// src/types/advisor.ts
export interface AdvisorAnswers {
  skinType?: 'dry' | 'oily' | 'combination' | 'sensitive' | 'unknown';
  concern?: 'aging' | 'dull' | 'hydration' | 'pores' | 'sensitive';
  sleep?: 'less6' | '6to7' | '7to8' | 'more8';
  environment?: 'computer' | 'outdoor' | 'aircon' | 'mixed';
  routine?: '1to2' | '3to4' | '5plus' | 'irregular';
  preference?: 'simple' | 'ritual' | 'couple';
}

export interface AdvisorState {
  currentStep: number;
  answers: AdvisorAnswers;
  direction: number; // 1 = forward, -1 = backward
  isComplete: boolean;
}

export interface AdvisorContextValue {
  state: AdvisorState;
  setAnswer: (field: keyof AdvisorAnswers, value: string) => void;
  goNext: () => void;
  goPrev: () => void;
  goToStep: (step: number) => void;
  reset: () => void;
}
```

---

### 5.2 AI 分析与结果

#### 任务清单

| # | 任务 | 优先级 | AI 辅助度 | 预计耗时 |
|---|------|--------|-----------|----------|
| 4.2.1 | AI 分析 API 路由 | P0 | ⭐⭐ | 2h |
| 4.2.2 | 加载动画 | P1 | ⭐⭐⭐ | 1h |
| 4.2.3 | 结果展示页面 | P0 | ⭐⭐⭐ | 2.5h |
| 4.2.4 | 产品推荐匹配 | P0 | ⭐⭐ | 1.5h |
| 4.2.5 | 保存/分享功能 | P2 | ⭐⭐⭐ | 1.5h |

---

#### 4.2.1 AI 分析 API 路由

**子任务**：

| 步骤 | 操作 | 文件 | 验收标准 |
|------|------|------|----------|
| 1 | 创建分析 API | `src/app/api/advisor/analyze/route.ts` | API 可调用 |
| 2 | 验证请求数据 | Zod Schema | 验证生效 |
| 3 | 实现 AI 调用 | 调用 OpenAI/Claude | 响应正常 |
| 4 | 实现降级逻辑 | 规则匹配备用 | 降级正常 |
| 5 | 实现速率限制 | IP 限流 | 限流生效 |
| 6 | 实现响应格式化 | 统一返回格式 | 格式正确 |

**AI 分析 API 实现**：

```typescript
// src/app/api/advisor/analyze/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { AdvisorAnswersSchema } from '@/schemas/advisor';
import { analyzeWithAI, fallbackAnalysis } from '@/lib/ai';
import { rateLimit } from '@/lib/ratelimit';

export async function POST(request: NextRequest) {
  try {
    // 速率限制
    const ip = request.ip || 'unknown';
    const { success } = await rateLimit(ip, 'advisor');
    if (!success) {
      return NextResponse.json(
        { error: '请求过于频繁，请稍后再试' },
        { status: 429 }
      );
    }

    // 验证请求数据
    const body = await request.json();
    const result = AdvisorAnswersSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: '请求参数错误' },
        { status: 400 }
      );
    }

    const answers = result.data;

    // 尝试 AI 分析
    if (process.env.AI_ENABLED === 'true') {
      try {
        const aiResult = await analyzeWithAI(answers);
        return NextResponse.json({
          source: 'ai',
          ...aiResult,
        });
      } catch (error) {
        console.error('AI 分析失败，使用降级方案:', error);
      }
    }

    // 降级：规则匹配
    const fallbackResult = await fallbackAnalysis(answers);
    return NextResponse.json({
      source: 'fallback',
      notice: '当前为智能推荐模式',
      ...fallbackResult,
    });
  } catch (error) {
    console.error('分析 API 错误:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
}
```

**AI 分析工具**：

```typescript
// src/lib/ai.ts
import { AdvisorAnswers } from '@/types/advisor';
import { prisma } from './prisma';

export async function analyzeWithAI(answers: AdvisorAnswers) {
  const provider = process.env.AI_PROVIDER || 'openai';
  const apiKey = process.env.AI_API_KEY;
  const model = process.env.AI_MODEL || 'gpt-4o';

  // 构建提示词
  const prompt = buildAnalysisPrompt(answers);

  // 调用 AI API
  const response = await callAIProvider(provider, apiKey, model, prompt);

  // 解析 AI 响应
  const analysis = parseAIResponse(response);

  // 匹配推荐产品
  const products = await matchProducts(analysis.recommendedCategories);

  return {
    skinAnalysis: analysis.skinAnalysis,
    recommendations: analysis.recommendations,
    products,
  };
}

export async function fallbackAnalysis(answers: AdvisorAnswers) {
  // 查询匹配规则
  const rules = await prisma.recommendationRule.findMany({
    orderBy: { priority: 'desc' },
  });

  // 匹配条件
  const matchedRule = rules.find(rule => {
    const conditions = rule.conditions as Record<string, string[]>;
    return Object.entries(conditions).every(([key, values]) => {
      const answer = answers[key as keyof AdvisorAnswers];
      return values.includes(answer as string);
    });
  });

  // 获取推荐产品
  const productIds = matchedRule?.productIds || [];
  const products = await prisma.product.findMany({
    where: {
      id: { in: productIds },
      published: true,
    },
    include: {
      images: { orderBy: { order: 'asc' }, take: 1 },
      category: true,
    },
  });

  return {
    skinAnalysis: generateFallbackAnalysis(answers),
    recommendations: matchedRule?.message || '根据您的肌肤情况，我们为您推荐以下产品',
    products,
  };
}
```

---

#### 4.2.2 加载动画

**子任务**：

| 步骤 | 操作 | 文件 | 验收标准 |
|------|------|------|----------|
| 1 | 创建加载页面 | `src/app/(website)/advisor/analyzing/page.tsx` | 页面渲染 |
| 2 | 设计加载动画 | 品牌风格动画 | 动画流畅 |
| 3 | 添加加载文案 | 动态提示文字 | 文案切换 |
| 4 | 实现进度模拟 | 假进度条 | 视觉反馈 |
| 5 | 调用分析 API | 后台请求 | 请求成功 |
| 6 | 跳转结果页 | 分析完成跳转 | 跳转正确 |

**加载页面布局**：

```
┌────────────────────────────────────────────────────────────────┐
│                                                                │
│                                                                │
│                                                                │
│                         ⟳ (旋转动画)                           │
│                                                                │
│                      正在分析您的肌肤...                        │
│                                                                │
│                   [━━━━━━━━━━━━━░░░░░░░] 65%                   │
│                                                                │
│                  💡 了解更多: 真脂质体技术                       │
│                                                                │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

#### 4.2.3 结果展示页面

**子任务**：

| 步骤 | 操作 | 文件 | 验收标准 |
|------|------|------|----------|
| 1 | 创建结果页面 | `src/app/(website)/advisor/result/page.tsx` | 页面渲染 |
| 2 | 显示肌肤分析 | 分析文字 | 内容正确 |
| 3 | 显示推荐产品 | 产品卡片列表 | 产品显示 |
| 4 | 实现产品点击 | 跳转详情/抽屉 | 交互正确 |
| 5 | 添加重新测试按钮 | 返回欢迎页 | 跳转正确 |
| 6 | 添加分享按钮 | 社交分享 | 功能可用 |

**结果页面布局**：

```
┌────────────────────────────────────────────────────────────────┐
│  ← 返回首页                                          分享 📤   │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│                     🌟 您的肌肤分析报告                         │
│                                                                │
│  ┌────────────────────────────────────────────────────────┐   │
│  │                                                        │   │
│  │  根据您的回答，您的肌肤属于 干性敏感肌 类型，           │   │
│  │  主要关注点是 抗老保湿。                                │   │
│  │                                                        │   │
│  │  建议您：                                              │   │
│  │  • 选择温和滋润的产品                                   │   │
│  │  • 注重夜间修护                                        │   │
│  │  • 加强防晒保护                                        │   │
│  │                                                        │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                                │
│                     💫 为您推荐以下产品                         │
│                                                                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                     │
│  │   [img]  │  │   [img]  │  │   [img]  │                     │
│  │ 焕活精华 │  │ 修护面霜 │  │ 保湿面膜 │                     │
│  │  ¥1280   │  │  ¥1680   │  │   ¥680   │                     │
│  │ [查看详情]│  │ [查看详情]│  │ [查看详情]│                     │
│  └──────────┘  └──────────┘  └──────────┘                     │
│                                                                │
│              ┌──────────────────────────────┐                  │
│              │         重新测试              │                  │
│              └──────────────────────────────┘                  │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

#### 4.2.5 保存/分享功能

**子任务**：

| 步骤 | 操作 | 文件 | 验收标准 |
|------|------|------|----------|
| 1 | 安装 html2canvas | `npm install html2canvas` | 无报错 |
| 2 | 创建生成图片功能 | 结果截图 | 图片生成 |
| 3 | 实现保存到相册 | 下载图片 | 保存成功 |
| 4 | 实现社交分享 | 微信/微博分享 | 分享调起 |
| 5 | 生成分享链接 | URL + 参数 | 链接正确 |

---

### Phase 4 完成检查清单

| 模块 | 检查项 | 状态 |
|------|--------|------|
| **问答流程** | 欢迎页 | ⬜ |
| | 问题页面组件 | ⬜ |
| | 进度指示器 | ⬜ |
| | 页面切换动画 | ⬜ |
| | 答案状态管理 | ⬜ |
| **AI 分析** | AI 分析 API | ⬜ |
| | 加载动画 | ⬜ |
| | 结果展示页面 | ⬜ |
| | 产品推荐匹配 | ⬜ |
| | 保存/分享功能 | ⬜ |
| **降级方案** | 规则匹配 | ⬜ |
| | 错误处理 | ⬜ |

**预计总耗时**：约 15-18 小时（2.5-3 个工作日）

---

## 六、Phase 5：测试与部署 (Week 7-8)

### 6.1 响应式与动画优化

| # | 任务 | 优先级 | AI 辅助度 | 预计耗时 |
|---|------|--------|-----------|----------|
| 5.1.1 | 移动端响应式优化 | P0 | ⭐⭐ | 4h |
| 5.1.2 | 平板端适配 | P1 | ⭐⭐ | 2h |
| 5.1.3 | GSAP ScrollTrigger 动画 | P1 | ⭐⭐ | 3h |
| 5.1.4 | 页面过渡动画 | P2 | ⭐⭐ | 2h |

---

#### 5.1.1 移动端响应式优化

**子任务**：

| 步骤 | 操作 | 验收标准 |
|------|------|----------|
| 1 | 测试所有页面 (<768px) | 无水平滚动 |
| 2 | 检查触摸交互 | 点击区域足够大 |
| 3 | 检查字体大小 | 最小 14px |
| 4 | 检查图片适配 | 无拉伸变形 |
| 5 | 检查表单输入 | 键盘不遮挡 |
| 6 | 检查导航菜单 | 汉堡菜单正常 |
| 7 | 检查悬浮卡片 | 拖拽交互正常 |

---

### 6.2 SEO 与可访问性

| # | 任务 | 优先级 | AI 辅助度 | 预计耗时 |
|---|------|--------|-----------|----------|
| 5.2.1 | sitemap.xml 自动生成 | P0 | ⭐⭐⭐ | 1h |
| 5.2.2 | robots.txt 配置 | P0 | ⭐⭐⭐ | 30min |
| 5.2.3 | Schema.org 结构化数据 | P1 | ⭐⭐⭐ | 2h |
| 5.2.4 | Open Graph 元标签 | P1 | ⭐⭐⭐ | 1h |
| 5.2.5 | 可访问性检查 | P1 | ⭐⭐ | 2h |
| 5.2.6 | 动画降级 | P2 | ⭐⭐⭐ | 1h |

---

#### 5.2.1-5.2.2 Sitemap 与 Robots

**子任务**：

| 步骤 | 操作 | 文件 | 验收标准 |
|------|------|------|----------|
| 1 | 创建 sitemap | `src/app/sitemap.ts` | XML 生成正确 |
| 2 | 动态产品页面 | 读取产品 slug | URL 完整 |
| 3 | 创建 robots.txt | `src/app/robots.ts` | 规则正确 |
| 4 | 禁止爬取 /admin | Disallow 规则 | 规则生效 |

**Sitemap 实现**：

```typescript
// src/app/sitemap.ts
import { MetadataRoute } from 'next';
import { prisma } from '@/lib/prisma';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://nihplod.cn';

  // 静态页面
  const staticPages = [
    { url: baseUrl, lastModified: new Date(), priority: 1.0 },
    { url: `${baseUrl}/story`, lastModified: new Date(), priority: 0.8 },
    { url: `${baseUrl}/products`, lastModified: new Date(), priority: 0.9 },
    { url: `${baseUrl}/ritual`, lastModified: new Date(), priority: 0.7 },
    { url: `${baseUrl}/contact`, lastModified: new Date(), priority: 0.6 },
    { url: `${baseUrl}/careers`, lastModified: new Date(), priority: 0.5 },
    { url: `${baseUrl}/advisor`, lastModified: new Date(), priority: 0.8 },
    { url: `${baseUrl}/privacy`, lastModified: new Date(), priority: 0.3 },
  ];

  // 动态产品页面
  const products = await prisma.product.findMany({
    where: { published: true },
    select: { slug: true, updatedAt: true },
  });

  const productPages = products.map((product) => ({
    url: `${baseUrl}/products/${product.slug}`,
    lastModified: product.updatedAt,
    priority: 0.7,
  }));

  return [...staticPages, ...productPages];
}
```

---

#### 5.2.3 Schema.org 结构化数据

**子任务**：

| 步骤 | 操作 | 文件 | 验收标准 |
|------|------|------|----------|
| 1 | Organization Schema | 根布局 | JSON-LD 正确 |
| 2 | Product Schema | 产品详情页 | 产品信息完整 |
| 3 | BreadcrumbList | 面包屑导航 | 结构正确 |
| 4 | 验证结构化数据 | Google 测试工具 | 无错误 |

---

### 6.3 安全与缓存

| # | 任务 | 优先级 | AI 辅助度 | 预计耗时 |
|---|------|--------|-----------|----------|
| 5.3.1 | CSP 安全头配置 | P0 | ⭐⭐⭐ | 1h |
| 5.3.2 | ISR 页面缓存配置 | P1 | ⭐⭐⭐ | 1h |
| 5.3.3 | 图片优化流程 | P1 | ⭐⭐⭐ | 1h |
| 5.3.4 | 微信分享 SDK (可选) | P2 | ⭐⭐ | 2h |

---

#### 5.3.1 CSP 安全头配置

**子任务**：

| 步骤 | 操作 | 文件 | 验收标准 |
|------|------|------|----------|
| 1 | 配置安全头 | `next.config.js` | 头部生效 |
| 2 | CSP 策略 | 限制脚本来源 | 策略正确 |
| 3 | X-Frame-Options | 防止嵌入 | 头部存在 |
| 4 | X-Content-Type-Options | nosniff | 头部存在 |

**安全头配置**：

```javascript
// next.config.js
const securityHeaders = [
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'on',
  },
  {
    key: 'X-Frame-Options',
    value: 'SAMEORIGIN',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'Referrer-Policy',
    value: 'origin-when-cross-origin',
  },
  {
    key: 'Content-Security-Policy',
    value: `
      default-src 'self';
      script-src 'self' 'unsafe-eval' 'unsafe-inline';
      style-src 'self' 'unsafe-inline';
      img-src 'self' data: blob: https:;
      font-src 'self';
      connect-src 'self' https://api.openai.com;
    `.replace(/\n/g, ''),
  },
];

module.exports = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};
```

---

### 6.4 测试与部署

| # | 任务 | 优先级 | AI 辅助度 | 预计耗时 |
|---|------|--------|-----------|----------|
| 5.4.1 | 功能测试 | P0 | ⭐ | 4h |
| 5.4.2 | Core Web Vitals 测试 | P1 | ⭐⭐ | 2h |
| 5.4.3 | PM2 配置 | P0 | ⭐⭐⭐ | 1h |
| 5.4.4 | Nginx 配置 | P0 | ⭐⭐⭐ | 2h |
| 5.4.5 | SSL 证书配置 | P0 | ⭐⭐⭐ | 1h |
| 5.4.6 | 域名解析与上线 | P0 | ⭐ | 1h |
| 5.4.7 | Umami 统计部署 | P1 | ⭐⭐⭐ | 2h |
| 5.4.8 | 数据库备份脚本 | P0 | ⭐⭐⭐ | 1h |
| 5.4.9 | 错误监控 (可选) | P2 | ⭐⭐⭐ | 1h |

---

#### 5.4.1 功能测试清单

| 模块 | 测试项 | 状态 |
|------|--------|------|
| **前台首页** | 双入口点击跳转 | ⬜ |
| **产品** | 产品列表加载 | ⬜ |
| | 分类筛选 | ⬜ |
| | 产品详情展示 | ⬜ |
| | 购买链接跳转 | ⬜ |
| **AI 顾问** | 问答流程完整 | ⬜ |
| | 分析结果展示 | ⬜ |
| | 产品推荐正确 | ⬜ |
| | 分享功能 | ⬜ |
| **联系表单** | 表单验证 | ⬜ |
| | 提交成功 | ⬜ |
| | 邮件通知 | ⬜ |
| **CMS 后台** | 登录/登出 | ⬜ |
| | 产品 CRUD | ⬜ |
| | 媒体上传 | ⬜ |
| | 设置保存 | ⬜ |

---

#### 5.4.3 PM2 配置

**PM2 配置文件**：

```javascript
// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'nihplod',
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      cwd: '/var/www/nihplod',
      instances: 2,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: '/var/log/nihplod/error.log',
      out_file: '/var/log/nihplod/out.log',
      merge_logs: true,
      max_memory_restart: '500M',
      max_restarts: 10,
      restart_delay: 1000,
    },
  ],
};
```

---

#### 5.4.4 Nginx 配置

**Nginx 配置文件**：

```nginx
# /etc/nginx/sites-available/nihplod.cn
server {
    listen 80;
    server_name nihplod.cn www.nihplod.cn;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name nihplod.cn www.nihplod.cn;

    # SSL 证书
    ssl_certificate /etc/letsencrypt/live/nihplod.cn/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/nihplod.cn/privkey.pem;

    # SSL 配置
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;

    # 静态文件缓存
    location /_next/static {
        proxy_pass http://localhost:3000;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    # 图片缓存
    location /uploads {
        alias /var/www/nihplod/public/uploads;
        add_header Cache-Control "public, max-age=2592000";
    }

    # 反向代理
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # 安全头
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Gzip 压缩
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml;
    gzip_min_length 1000;
}
```

---

#### 5.4.8 数据库备份脚本

**备份脚本**：

```bash
#!/bin/bash
# /var/www/nihplod/scripts/backup.sh

# 配置
DB_NAME="nihplod"
BACKUP_DIR="/var/backups/nihplod"
DATE=$(date +%Y%m%d_%H%M%S)
KEEP_DAYS=7

# 创建备份目录
mkdir -p $BACKUP_DIR

# 执行备份
pg_dump $DB_NAME | gzip > "$BACKUP_DIR/nihplod_$DATE.sql.gz"

# 删除旧备份
find $BACKUP_DIR -name "*.sql.gz" -mtime +$KEEP_DAYS -delete

echo "Backup completed: nihplod_$DATE.sql.gz"
```

**Cron 配置**：

```bash
# 每天凌晨 3 点备份
0 3 * * * /var/www/nihplod/scripts/backup.sh >> /var/log/nihplod/backup.log 2>&1
```

---

### Phase 5 完成检查清单

| 模块 | 检查项 | 状态 |
|------|--------|------|
| **响应式** | 移动端优化 | ⬜ |
| | 平板端适配 | ⬜ |
| | 动画效果 | ⬜ |
| **SEO** | sitemap.xml | ⬜ |
| | robots.txt | ⬜ |
| | 结构化数据 | ⬜ |
| | OG 标签 | ⬜ |
| **安全** | CSP 配置 | ⬜ |
| | ISR 缓存 | ⬜ |
| | 图片优化 | ⬜ |
| **部署** | 功能测试 | ⬜ |
| | 性能测试 | ⬜ |
| | PM2 配置 | ⬜ |
| | Nginx 配置 | ⬜ |
| | SSL 证书 | ⬜ |
| | 域名解析 | ⬜ |
| | Umami 统计 | ⬜ |
| | 数据库备份 | ⬜ |

**预计总耗时**：约 25-30 小时（4-5 个工作日）

---

## 七、AI Vibe Coding 最佳实践

### 7.1 Prompt 编写技巧

```
┌─────────────────────────────────────────────────────────────────────┐
│                     高效 Prompt 结构                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. 任务标题          清晰描述要完成的功能                           │
│  2. 背景上下文        项目信息、技术栈、相关文件                      │
│  3. 具体需求          功能点、交互要求、视觉规范                      │
│  4. 技术约束          使用的库、接口定义、命名规范                    │
│  5. 期望输出          需要生成的文件列表                             │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 7.2 开发流程

```
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│  描述   │ → │  生成   │ → │  审查   │ → │  测试   │ → │  迭代   │
│  需求   │    │  代码   │    │  代码   │    │  功能   │    │  优化   │
└─────────┘    └─────────┘    └─────────┘    └─────────┘    └─────────┘
     │              │              │              │              │
     ▼              ▼              ▼              ▼              ▼
  编写详细       AI 生成       理解代码       运行测试       根据问题
  Prompt        初版代码       检查问题       验证功能       继续优化
```

### 7.3 注意事项

| 原则 | 说明 |
|------|------|
| **小步迭代** | 每次只完成一个小功能，便于调试和验证 |
| **提供上下文** | 给 AI 提供相关的现有代码和文档 |
| **理解代码** | 不要盲目使用 AI 生成的代码，要理解其逻辑 |
| **及时测试** | 每完成一个功能就进行测试 |
| **版本控制** | 频繁提交，便于回滚 |

---

## 八、设计决策记录

### 8.1 招聘页面：合并到官网

**决策**：招聘页面 (`/careers`) 作为官网的一部分，不独立建站

**理由**：
| 因素 | 说明 |
|------|------|
| 品牌定位 | 高端小众品牌，招聘页是品牌形象的延伸 |
| 招聘规模 | 职位数量少（上海 + 摩纳哥），无需复杂招聘系统 |
| 功能简单 | 仅需职位展示 + 邮箱投递，无 ATS 需求 |
| 统一体验 | 与整站视觉风格一致，使用悬浮卡片布局 |
| 维护成本 | 一套代码库，降低开发和维护成本 |

**可选增强**：
- 支持 `careers.nihplod.cn` 子域名重定向到 `/careers`（方便招聘链接分享）
- CMS 后台预留职位管理功能扩展接口

**分离信号**（当出现以下情况时考虑独立）：
- 职位数量超过 20+ 且频繁更新
- 需要在线申请、简历筛选、面试管理等 ATS 功能
- 有校招/社招大规模招聘需求

---

## 九、风险与应对

| 风险 | 概率 | 影响 | 应对措施 |
|------|------|------|----------|
| AI 生成代码有 Bug | 高 | 中 | 仔细审查，编写测试 |
| 复杂动画实现困难 | 中 | 中 | 使用 React Bits 预制组件，降级方案 |
| AI API 配额限制 | 低 | 高 | 预留备用 API 提供商 |
| 响应式适配问题 | 中 | 中 | 优先移动端开发 |

---

## 十、交付物清单

### 10.1 代码交付

- [ ] Next.js 项目源代码
- [ ] Prisma 数据库迁移文件
- [ ] 种子数据脚本
- [ ] 环境变量配置模板 (.env.example)
- [ ] Zod 验证 Schema
- [ ] SEO 配置 (sitemap.ts, robots.ts)
- [ ] 图片处理工具 (sharp)
- [ ] Toast 提示组件

### 10.2 部署交付

- [ ] PM2 ecosystem.config.js
- [ ] Nginx 配置文件 (含缓存策略 + 安全头)
- [ ] 数据库备份脚本
- [ ] 部署脚本
- [ ] Umami Docker 配置
- [ ] 运维文档

### 10.3 文档交付

- [ ] API 接口文档
- [ ] CMS 使用手册
- [ ] 部署运维手册
- [ ] 可访问性检查清单
- [ ] 隐私政策页面内容

---

## 十一、总体时间表与里程碑

### 11.1 项目时间线

```
Week 1          Week 2-3        Week 4-5        Week 6          Week 7-8
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│ Phase 1 │ → │ Phase 2 │ → │ Phase 3 │ → │ Phase 4 │ → │ Phase 5 │
│ 基础设施 │    │ CMS后台 │    │ 前台页面 │    │ AI顾问  │    │ 测试部署 │
└─────────┘    └─────────┘    └─────────┘    └─────────┘    └─────────┘
   ~40h          ~35h           ~30h           ~18h           ~30h
```

### 11.2 里程碑检查点

| 里程碑 | 时间节点 | 交付物 | 验收标准 |
|--------|----------|--------|----------|
| **M1** | Week 1 结束 | 基础设施完成 | 项目可运行、数据库可连接、登录可用 |
| **M2** | Week 3 结束 | CMS 后台完成 | 产品/内容/媒体管理功能可用 |
| **M3** | Week 5 结束 | 前台页面完成 | 所有页面可访问、响应式正常 |
| **M4** | Week 6 结束 | AI 顾问完成 | 问答流程完整、推荐结果正确 |
| **M5** | Week 8 结束 | 项目上线 | 域名可访问、功能正常、监控就绪 |

### 11.3 工时统计

| 阶段 | 预计工时 | 工作日 (8h/天) |
|------|----------|----------------|
| Phase 1: 基础设施 | 40h | 5 天 |
| Phase 2: CMS 后台 | 35h | 4.5 天 |
| Phase 3: 前台页面 | 30h | 4 天 |
| Phase 4: AI 顾问 | 18h | 2.5 天 |
| Phase 5: 测试部署 | 30h | 4 天 |
| **总计** | **~153h** | **~20 天 (4 周)** |

> 💡 **说明**：以上为理想工时估算，实际开发中可能因调试、需求变更等因素有所浮动，建议预留 20% 缓冲时间。

### 11.4 快速开始指南

**开发环境准备**：

```bash
# 1. 克隆项目
git clone <repo-url>
cd nihplod

# 2. 安装依赖
npm install

# 3. 配置环境变量
cp .env.example .env.local
# 编辑 .env.local 填入数据库连接等配置

# 4. 初始化数据库
npx prisma migrate dev
npx prisma db seed

# 5. 启动开发服务器
npm run dev
```

**开发顺序建议**：

1. 按 Phase 顺序开发，每个 Phase 内按任务编号顺序
2. 每完成一个子任务，勾选对应检查项
3. 每完成一个 Phase，进行阶段性测试
4. 遇到问题及时记录，调整后续计划

---

**文档结束**

> 开发过程中如有问题，请随时与 AI 助手沟通调整计划


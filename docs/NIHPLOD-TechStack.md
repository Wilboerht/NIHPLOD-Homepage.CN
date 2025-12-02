# NIHPLOD 技术栈文档

> 版本：1.6
> 日期：2025年12月
> 状态：✅ 已审核

📎 **相关文档**：[PRD](./NIHPLOD-PRD.md) | [UX](./NIHPLOD-UX.md) | [API](./NIHPLOD-API.md) | [数据库](./NIHPLOD-Database.md) | [开发计划](./NIHPLOD-DevPlan.md)

---

## 一、技术选型

```
┌─────────────────────────────────────────────────────────────────┐
│                   NIHPLOD 技术架构                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   前端框架      Next.js 14 (App Router) + React 18 + TypeScript │
│   样式方案      Tailwind CSS                                    │
│   动画方案      Framer Motion + GSAP + React Bits               │
│   后端/API      Next.js API Routes (全栈方案)                   │
│   数据库        Prisma ORM + PostgreSQL                         │
│   CMS          自建 (集成在 Next.js 项目中)                      │
│   认证          自建 JWT (仅CMS后台)                             │
│   文件存储      本地存储 (Nginx 静态服务)                        │
│   网站分析      Umami (自托管 Docker)                            │
│   AI服务        可配置 (OpenAI / Claude / 通义千问)              │
│   进程管理      PM2                                             │
│   Web服务器     Nginx (反向代理 + SSL + 静态文件)                │
│   SSL证书       Let's Encrypt (免费自动续期)                     │
│   部署环境      自有服务器                                       │
│   域名          nihplod.cn                                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

| 层面 | 技术 | 状态 |
|------|------|------|
| 前端框架 | Next.js 14 (App Router) | ✅ 确定 |
| 语言 | TypeScript | ✅ 确定 |
| 样式 | Tailwind CSS | ✅ 确定 |
| 动画 | Framer Motion + GSAP + React Bits | ✅ 确定 |
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

### 1.1 核心依赖包清单

```
# 生产依赖 (dependencies)
next@14.x                  # Next.js 框架
react@18.x                 # React
react-dom@18.x             # React DOM
typescript                 # TypeScript
@prisma/client             # Prisma ORM 客户端
bcryptjs                   # 密码加密
jsonwebtoken               # JWT 生成与验证
zod                        # 请求参数验证
framer-motion              # 动画库
gsap                       # 高级动画
nodemailer                 # 邮件发送
lru-cache                  # IP 限流缓存
html2canvas                # 结果页图片生成
sharp                      # 图片处理/压缩
clsx                       # 样式类名合并
tailwind-merge             # Tailwind 类名合并

# 开发依赖 (devDependencies)
prisma                     # Prisma CLI
@types/node                # Node.js 类型
@types/react               # React 类型
@types/bcryptjs            # bcryptjs 类型
@types/jsonwebtoken        # JWT 类型
@types/nodemailer          # nodemailer 类型
tailwindcss                # Tailwind CSS
postcss                    # PostCSS
autoprefixer               # 自动前缀
eslint                     # ESLint
eslint-config-next         # Next.js ESLint 配置
prettier                   # 代码格式化
```

### 1.2 环境变量模板 (.env.example)

```bash
# ============================================
# NIHPLOD 官网环境变量配置
# ============================================

# ---------- 数据库 ----------
DATABASE_URL="postgresql://user:password@localhost:5432/nihplod?schema=public"

# ---------- JWT 认证 ----------
JWT_SECRET="your-super-secret-jwt-key-min-32-chars"
JWT_EXPIRES_IN="7d"

# ---------- 站点配置 ----------
NEXT_PUBLIC_SITE_URL="https://nihplod.cn"
NEXT_PUBLIC_SITE_NAME="NIHPLOD 旎柏"

# ---------- 邮件通知 (SMTP) ----------
SMTP_HOST="smtp.example.com"
SMTP_PORT="465"
SMTP_USER="notification@nihplod.cn"
SMTP_PASSWORD="your-smtp-password"
SMTP_FROM="NIHPLOD 网站通知 <notification@nihplod.cn>"

# ---------- AI 服务 ----------
AI_PROVIDER="openai"                    # openai / claude / qwen
AI_API_KEY="sk-your-api-key"
AI_MODEL="gpt-4o"                        # gpt-4o / claude-3-opus / qwen-max
AI_TIMEOUT="30000"                       # 超时时间 (毫秒)
AI_MAX_TOKENS="1000"                     # 最大 token 数

# ---------- 文件上传 ----------
UPLOAD_DIR="./public/uploads"
UPLOAD_MAX_IMAGE_SIZE="5242880"          # 5MB (字节)
UPLOAD_MAX_VIDEO_SIZE="52428800"         # 50MB (字节)

# ---------- 安全配置 ----------
RATE_LIMIT_WINDOW="60000"                # 限流窗口 (毫秒)
RATE_LIMIT_MAX="3"                       # 窗口内最大请求数

# ---------- 可选：验证码 ----------
# CAPTCHA_PROVIDER="tencent"             # tencent / recaptcha
# CAPTCHA_APP_ID="your-app-id"
# CAPTCHA_SECRET_KEY="your-secret-key"
```

---

## 二、项目结构

```
nihplod-website/
├── app/                      # Next.js App Router
│   ├── (website)/           # 前台网站
│   │   ├── page.tsx         # Landing Page (首页)
│   │   ├── story/           # 品牌故事
│   │   ├── products/        # 产品系列
│   │   ├── ritual/          # 护肤仪式
│   │   ├── advisor/         # AI护肤顾问
│   │   ├── contact/         # 联系我们 (悬浮卡片布局)
│   │   └── careers/         # 招聘页面 (悬浮卡片布局)
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
│       ├── categories/
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

---

## 三、安全设计

| 安全措施 | 实现方式 |
|----------|----------|
| 管理员认证 | JWT Token + HttpOnly Cookie |
| 密码存储 | bcrypt 加密 |
| API 保护 | 中间件验证 Token |
| 文件上传 | 类型/大小限制，重命名存储 |
| SQL 注入 | Prisma ORM 参数化查询 |
| XSS 防护 | React 自动转义 + CSP |
| CSRF 防护 | SameSite Cookie |
| 表单防刷 | 蜜罐字段 + IP限流 + 可选验证码 |

### 3.1 联系表单防刷机制

```
┌─────────────────────────────────────────────────────────────┐
│                   联系表单防刷策略                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  第一层：蜜罐字段 (Honeypot)                                │
│  ├── 隐藏的表单字段，正常用户不会填写                        │
│  ├── 机器人自动填充后被识别并拒绝                           │
│  └── 实现：<input type="text" name="honeypot" hidden />    │
│                                                             │
│  第二层：IP 限流 (Rate Limiting)                            │
│  ├── 同一 IP 每分钟最多 3 次提交                            │
│  ├── 超限返回 429 Too Many Requests                        │
│  └── 实现：使用内存缓存或 Redis 记录请求频率                 │
│                                                             │
│  第三层：验证码 (可选)                                       │
│  ├── 触发条件：IP 行为异常或高风险请求                       │
│  ├── 推荐服务：腾讯验证码 / Google reCAPTCHA                │
│  └── 实现：按需集成，避免影响正常用户体验                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### 技术实现

```typescript
// lib/rate-limit.ts
import { LRUCache } from 'lru-cache';

const rateLimitCache = new LRUCache<string, number[]>({
  max: 500,
  ttl: 60 * 1000, // 1分钟过期
});

export function checkRateLimit(ip: string, limit: number = 3): boolean {
  const now = Date.now();
  const timestamps = rateLimitCache.get(ip) || [];
  const recent = timestamps.filter(t => now - t < 60 * 1000);

  if (recent.length >= limit) {
    return false; // 超限
  }

  rateLimitCache.set(ip, [...recent, now]);
  return true;
}
```

---

## 四、邮件通知配置

### 4.1 留言通知机制

当用户通过联系表单提交留言后，系统自动发送邮件通知至管理员。

**SMTP 配置**（存储于 `.env`）：
```
SMTP_HOST=smtp.example.com
SMTP_PORT=465
SMTP_USER=notification@nihplod.cn
SMTP_PASSWORD=<加密存储>
SMTP_FROM="NIHPLOD 网站通知 <notification@nihplod.cn>"
```

**邮件发送逻辑**：
```typescript
// lib/email.ts
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

export async function sendContactNotification(message: {
  name: string;
  email: string;
  content: string;
}) {
  const notificationEmail = await getSettingValue('notification_email');

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: notificationEmail,
    subject: `[NIHPLOD官网] 新留言 - 来自 ${message.name}`,
    html: `
      <h2>收到新的网站留言</h2>
      <p><strong>姓名：</strong>${message.name}</p>
      <p><strong>邮箱：</strong>${message.email}</p>
      <p><strong>留言内容：</strong></p>
      <p>${message.content}</p>
      <hr>
      <p><small>此邮件由系统自动发送，请勿直接回复</small></p>
    `,
  });
}
```

**发送频率限制**：
- 同一 IP 每分钟最多触发 3 封通知邮件（与表单防刷同步）
- 邮件发送失败不影响留言提交，仅记录日志

> ⚠️ **依赖安装**：`npm install nodemailer @types/nodemailer`

---

## 五、CMS 后台设计

### 5.1 功能模块

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
│  │  AI问答配置  │  │   职位管理   │  │   留言管理   │         │
│  │   Advisor   │  │    Jobs     │  │  Messages  │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                             │
│  ┌─────────────┐                                            │
│  │   系统设置   │                                            │
│  │  Settings  │                                            │
│  └─────────────┘                                            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 登录页

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                        NIHPLOD                              │
│                      管理后台                                │
│                                                             │
│                  ┌───────────────────┐                      │
│                  │  邮箱              │                      │
│                  └───────────────────┘                      │
│                  ┌───────────────────┐                      │
│                  │  密码              │                      │
│                  └───────────────────┘                      │
│                                                             │
│                      [登 录]                                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 5.3 仪表盘

```
┌──────────┬──────────────────────────────────────────────────┐
│          │                                                  │
│  NIHPLOD │   仪表盘 Dashboard                               │
│          │                                                  │
│ ──────── │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐    │
│          │  │ 产品   │ │ 职位   │ │ 媒体   │ │ 未读   │    │
│ 📦 产品  │  │   8    │ │   3    │ │  24   │ │  5    │    │
│ 📄 内容  │  └────────┘ └────────┘ └────────┘ └────────┘    │
│ 🖼 媒体  │                                                  │
│ 🤖 AI    │   最近更新                                       │
│ 💼 职位  │  ┌────────────────────────────────────────┐     │
│ 💬 留言  │  │ 精华液 - 2025-01-15 14:30              │     │
│ ⚙️ 设置  │  │ 面霜 - 2025-01-15 10:22                │     │
│          │  │ 首页 - 2025-01-14 16:45                │     │
│ ──────── │  └────────────────────────────────────────┘     │
│ 退出登录 │                                                  │
│          │   最新留言                                       │
└──────────┤  ┌────────────────────────────────────────┐     │
           │  │ 🔴 张三 - 想咨询产品... - 10分钟前      │     │
           │  │ 🔴 李四 - 合作意向... - 2小时前         │     │
           │  │ ⚪ 王五 - 购买渠道... - 昨天            │     │
           │  └────────────────────────────────────────┘     │
           │                                                  │
           └──────────────────────────────────────────────────┘
```

### 5.4 产品管理列表

```
┌──────────┬──────────────────────────────────────────────────┐
│          │                                                  │
│  侧边栏   │   产品管理                    [+ 添加产品]       │
│          │                                                  │
│          │  ┌────┬────────┬──────────┬──────┬──────┬─────┐  │
│          │  │图片│ 名称    │ 分类     │ 价格 │ 状态 │ 操作│  │
│          │  ├────┼────────┼──────────┼──────┼──────┼─────┤  │
│          │  │ 🖼 │ 精华液  │ 精华     │¥1280│ ✅  │ ✏️🗑│  │
│          │  │ 🖼 │ 面霜    │ 面霜     │¥1680│ ✅  │ ✏️🗑│  │
│          │  │ 🖼 │ 泡沫洁面│ 泡沫洁面 │ ¥680│ ⚪  │ ✏️🗑│  │
│          │  │ 🖼 │ 防晒霜  │ 防晒     │ ¥980│ ✅  │ ✏️🗑│  │
│          │  └────┴────────┴──────────┴──────┴──────┴─────┘  │
│          │                                                  │
│          │                    < 1 2 3 >                     │
│          │                                                  │
└──────────┴──────────────────────────────────────────────────┘
```

### 5.5 产品编辑页

```
┌──────────┬──────────────────────────────────────────────────┐
│          │                                                  │
│  侧边栏   │   编辑产品              [保存草稿] [发布]        │
│          │                                                  │
│          │   基本信息                                       │
│          │  ┌─────────────────────────────────────────┐    │
│          │  │ 产品名称    [精华液                    ]│    │
│          │  │ 英文名称    [Serum                     ]│    │
│          │  │ URL标识     [serum                     ]│    │
│          │  │ 分类        [精华 ▼                    ]│    │
│          │  │ 价格        [1280                      ]│    │
│          │  └─────────────────────────────────────────┘    │
│          │                                                  │
│          │   产品图片                                       │
│          │  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐              │
│          │  │ 🖼  │ │ 🖼  │ │ 🖼  │ │  +  │              │
│          │  └─────┘ └─────┘ └─────┘ └─────┘              │
│          │                                                  │
│          │   产品描述                                       │
│          │  ┌─────────────────────────────────────────┐    │
│          │  │ 富文本编辑器                            │    │
│          │  │                                         │    │
│          │  └─────────────────────────────────────────┘    │
│          │                                                  │
│          │   购买链接                                       │
│          │  ┌─────────────────────────────────────────┐    │
│          │  │ https://...                             │    │
│          │  └─────────────────────────────────────────┘    │
│          │                                                  │
└──────────┴──────────────────────────────────────────────────┘
```

### 5.6 分类管理

```
┌──────────┬──────────────────────────────────────────────────┐
│          │                                                  │
│  侧边栏   │   分类管理                      [+ 添加分类]     │
│          │                                                  │
│          │  ┌────┬──────────┬───────────────┬──────┬─────┐ │
│          │  │排序│ 中文名称  │ 英文名称      │ slug │ 操作│ │
│          │  ├────┼──────────┼───────────────┼──────┼─────┤ │
│          │  │ 1  │ 泡沫洁面  │ Foam Cleanser │ foam │ ✏️🗑│ │
│          │  │ 2  │ 面部磨砂  │ Face Scrub    │ scrub│ ✏️🗑│ │
│          │  │ 3  │ 面膜     │ Face Mask     │ mask │ ✏️🗑│ │
│          │  │ ...│ ...      │ ...           │ ...  │ ... │ │
│          │  └────┴──────────┴───────────────┴──────┴─────┘ │
│          │                                                  │
│          │  💡 拖拽行可调整分类显示顺序                       │
│          │                                                  │
└──────────┴──────────────────────────────────────────────────┘
```

### 5.7 内容管理（页面编辑）

```
┌──────────┬──────────────────────────────────────────────────┐
│          │                                                  │
│  侧边栏   │   内容管理                                       │
│          │                                                  │
│          │  ┌──────────┬──────────────────────┬──────────┐ │
│          │  │ 页面     │ 最后更新             │ 操作     │ │
│          │  ├──────────┼──────────────────────┼──────────┤ │
│          │  │ 首页     │ 2025-01-15 14:30    │ [编辑]   │ │
│          │  │ 品牌故事  │ 2025-01-14 10:00    │ [编辑]   │ │
│          │  │ 护肤仪式  │ 2025-01-13 16:45    │ [编辑]   │ │
│          │  │ 联系我们  │ 2025-01-12 09:20    │ [编辑]   │ │
│          │  │ 加入我们  │ 2025-01-11 11:30    │ [编辑]   │ │
│          │  └──────────┴──────────────────────┴──────────┘ │
│          │                                                  │
└──────────┴──────────────────────────────────────────────────┘
```

#### 页面编辑界面

```
┌──────────┬──────────────────────────────────────────────────┐
│          │                                                  │
│  侧边栏   │   编辑页面: 品牌故事                  [保存]     │
│          │                                                  │
│          │   SEO 设置                                       │
│          │  ┌─────────────────────────────────────────┐    │
│          │  │ 页面标题   [品牌故事 - NIHPLOD         ]│    │
│          │  │ 页面描述   [源自摩纳哥的高端护肤品牌... ]│    │
│          │  └─────────────────────────────────────────┘    │
│          │                                                  │
│          │   页面内容 (JSON 结构化编辑)                      │
│          │  ┌─────────────────────────────────────────┐    │
│          │  │ ▼ hero                                  │    │
│          │  │   title: "品牌故事"                     │    │
│          │  │   subtitle: "源自摩纳哥的护肤艺术"       │    │
│          │  │   backgroundImage: [选择媒体]           │    │
│          │  │ ▼ sections                              │    │
│          │  │   ▼ [0] 品牌起源                        │    │
│          │  │     title: "品牌起源"                   │    │
│          │  │     content: "NIHPLOD诞生于..."        │    │
│          │  │   ▼ [1] 创始人                          │    │
│          │  │     ...                                 │    │
│          │  └─────────────────────────────────────────┘    │
│          │                                                  │
└──────────┴──────────────────────────────────────────────────┘
```

### 5.8 媒体库

```
┌──────────┬──────────────────────────────────────────────────┐
│          │                                                  │
│  侧边栏   │   媒体库                            [上传文件]   │
│          │                                                  │
│          │   筛选: [全部 ▼]  [图片] [视频]     🔍 搜索...   │
│          │                                                  │
│          │  ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐       │
│          │  │       │ │       │ │       │ │       │       │
│          │  │  🖼   │ │  🖼   │ │  🎬   │ │  🖼   │       │
│          │  │       │ │       │ │       │ │       │       │
│          │  ├───────┤ ├───────┤ ├───────┤ ├───────┤       │
│          │  │hero.jpg│ │prod1 │ │video1 │ │bg.png │       │
│          │  │ 1.2MB │ │ 856KB│ │ 12MB │ │ 2.1MB│       │
│          │  └───────┘ └───────┘ └───────┘ └───────┘       │
│          │                                                  │
│          │  ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐       │
│          │  │       │ │       │ │       │ │       │       │
│          │  │  🖼   │ │  🖼   │ │  🖼   │ │  🖼   │       │
│          │  │       │ │       │ │       │ │       │       │
│          │  └───────┘ └───────┘ └───────┘ └───────┘       │
│          │                                                  │
│          │                    < 1 2 3 >                     │
│          │                                                  │
└──────────┴──────────────────────────────────────────────────┘
```

#### 媒体详情弹窗

```
┌─────────────────────────────────────────────────────────────┐
│                                               [×]           │
│  ┌─────────────────────┐  文件信息                         │
│  │                     │                                    │
│  │                     │  文件名: hero-background.jpg       │
│  │       预览图        │  尺寸: 1920 × 1080                 │
│  │                     │  大小: 1.2 MB                      │
│  │                     │  上传时间: 2025-01-15 14:30        │
│  │                     │                                    │
│  └─────────────────────┘  URL:                              │
│                           ┌────────────────────────┐        │
│                           │ /uploads/hero-bg.jpg   │ [复制] │
│                           └────────────────────────┘        │
│                                                             │
│                           [删除文件]                        │
└─────────────────────────────────────────────────────────────┘
```

### 5.9 AI 问答配置

```
┌──────────┬──────────────────────────────────────────────────┐
│          │                                                  │
│  侧边栏   │   AI 问答配置                                    │
│          │                                                  │
│          │   ┌────────────────┐ ┌────────────────┐          │
│          │   │  问题配置      │ │  推荐规则      │          │
│          │   └────────────────┘ └────────────────┘          │
│          │                                                  │
│          │   问题列表                         [+ 添加问题]   │
│          │  ┌────┬────────────────┬──────────────┬─────┐   │
│          │  │序号│ 问题内容        │ 选项数量     │ 操作│   │
│          │  ├────┼────────────────┼──────────────┼─────┤   │
│          │  │ 1  │ 您的肤质是?     │ 4个选项     │ ✏️↑↓│   │
│          │  │ 2  │ 主要肌肤困扰?   │ 6个选项     │ ✏️↑↓│   │
│          │  │ 3  │ 睡眠质量如何?   │ 4个选项     │ ✏️↑↓│   │
│          │  │ 4  │ 生活环境?       │ 4个选项     │ ✏️↑↓│   │
│          │  │ 5  │ 日常护肤习惯?   │ 4个选项     │ ✏️↑↓│   │
│          │  │ 6  │ 产品偏好?       │ 4个选项     │ ✏️↑↓│   │
│          │  └────┴────────────────┴──────────────┴─────┘   │
│          │                                                  │
└──────────┴──────────────────────────────────────────────────┘
```

#### 问题编辑弹窗

```
┌─────────────────────────────────────────────────────────────┐
│   编辑问题                                     [×]          │
│                                                             │
│   问题内容                                                  │
│  ┌───────────────────────────────────────────────────┐     │
│  │ 您的肤质是?                                       │     │
│  └───────────────────────────────────────────────────┘     │
│                                                             │
│   字段名 (用于AI分析)                                       │
│  ┌───────────────────────────────────────────────────┐     │
│  │ skinType                                          │     │
│  └───────────────────────────────────────────────────┘     │
│                                                             │
│   选项列表                                   [+ 添加选项]   │
│  ┌─────────────────────────────────────────────┬─────┐     │
│  │ 干性肌肤 - 经常感到紧绑、脱皮               │  🗑 │     │
│  │ 油性肌肤 - 容易出油、毛孔粗大               │  🗑 │     │
│  │ 混合肌肤 - T区油、两颊干                   │  🗑 │     │
│  │ 敏感肌肤 - 容易泛红、刺痛                   │  🗑 │     │
│  └─────────────────────────────────────────────┴─────┘     │
│                                                             │
│                              [取消]  [保存]                 │
└─────────────────────────────────────────────────────────────┘
```

#### 推荐规则配置

```
┌──────────┬──────────────────────────────────────────────────┐
│          │                                                  │
│  侧边栏   │   AI 问答配置 > 推荐规则             [+ 添加规则]│
│          │                                                  │
│          │  ┌──────┬────────────────────┬──────────┬─────┐ │
│          │  │优先级│ 条件组合            │ 推荐产品 │ 操作│ │
│          │  ├──────┼────────────────────┼──────────┼─────┤ │
│          │  │ 100  │ 干性 + 抗老         │ 3个产品  │ ✏️🗑│ │
│          │  │  90  │ 油性 + 痘痘         │ 2个产品  │ ✏️🗑│ │
│          │  │  80  │ 敏感 + 泛红         │ 2个产品  │ ✏️🗑│ │
│          │  │  70  │ 混合 + 毛孔         │ 3个产品  │ ✏️🗑│ │
│          │  └──────┴────────────────────┴──────────┴─────┘ │
│          │                                                  │
│          │  💡 优先级越高的规则优先匹配                      │
│          │                                                  │
└──────────┴──────────────────────────────────────────────────┘
```

### 5.10 职位管理

```
┌──────────┬──────────────────────────────────────────────────┐
│          │                                                  │
│  侧边栏   │   职位管理                        [+ 添加职位]   │
│          │                                                  │
│          │  ┌──────────────┬────────┬──────┬──────┬─────┐  │
│          │  │ 职位名称      │ 地点   │ 类型 │ 状态 │ 操作│  │
│          │  ├──────────────┼────────┼──────┼──────┼─────┤  │
│          │  │ 市场营销经理  │ 上海   │ 全职 │ ✅  │ ✏️🗑│  │
│          │  │ 产品研发工程师│ 摩纳哥 │ 全职 │ ✅  │ ✏️🗑│  │
│          │  │ 电商运营专员  │ 上海   │ 全职 │ ⚪  │ ✏️🗑│  │
│          │  │ 设计实习生    │ 上海   │ 实习 │ ✅  │ ✏️🗑│  │
│          │  └──────────────┴────────┴──────┴──────┴─────┘  │
│          │                                                  │
│          │  💡 拖拽行可调整职位显示顺序                       │
│          │                                                  │
└──────────┴──────────────────────────────────────────────────┘
```

#### 职位编辑页

```
┌──────────┬──────────────────────────────────────────────────┐
│          │                                                  │
│  侧边栏   │   编辑职位                  [保存草稿] [发布]    │
│          │                                                  │
│          │   基本信息                                       │
│          │  ┌─────────────────────────────────────────┐    │
│          │  │ 职位名称    [市场营销经理              ]│    │
│          │  │ 英文名称    [Marketing Manager         ]│    │
│          │  │ 工作地点    [上海 ▼                    ]│    │
│          │  │ 职位类型    [全职 ▼                    ]│    │
│          │  │ 薪资范围    [面议（可选）              ]│    │
│          │  └─────────────────────────────────────────┘    │
│          │                                                  │
│          │   职位描述                                       │
│          │  ┌─────────────────────────────────────────┐    │
│          │  │ 富文本编辑器                            │    │
│          │  └─────────────────────────────────────────┘    │
│          │                                                  │
│          │   任职要求                                       │
│          │  ┌─────────────────────────────────────────┐    │
│          │  │ 富文本编辑器                            │    │
│          │  └─────────────────────────────────────────┘    │
│          │                                                  │
└──────────┴──────────────────────────────────────────────────┘
```

### 5.11 留言管理

```
┌──────────┬──────────────────────────────────────────────────┐
│          │                                                  │
│  侧边栏   │   留言管理                    [全部] [未读] [已读]│
│          │                                                  │
│          │  ┌────┬────────┬────────────────┬───────┬─────┐ │
│          │  │状态│ 姓名   │ 邮箱           │ 时间  │ 操作│ │
│          │  ├────┼────────┼────────────────┼───────┼─────┤ │
│          │  │ 🔴│ 张三   │ zhang@xx.com   │ 10分钟│ 👁🗑│ │
│          │  │ 🔴│ 李四   │ li@xx.com      │ 2小时 │ 👁🗑│ │
│          │  │ ⚪│ 王五   │ wang@xx.com    │ 昨天  │ 👁🗑│ │
│          │  │ ⚪│ 赵六   │ zhao@xx.com    │ 3天前 │ 👁🗑│ │
│          │  └────┴────────┴────────────────┴───────┴─────┘ │
│          │                                                  │
│          │                    < 1 2 3 >                     │
│          │                                                  │
└──────────┴──────────────────────────────────────────────────┘
```

#### 留言详情弹窗

```
┌─────────────────────────────────────────────────────────────┐
│   留言详情                                     [×]          │
│                                                             │
│   姓名: 张三                                                │
│   邮箱: zhangsan@example.com                   [发送邮件]   │
│   时间: 2025-01-15 14:30                                    │
│                                                             │
│   留言内容:                                                 │
│  ┌───────────────────────────────────────────────────┐     │
│  │ 您好，我想咨询一下贵品牌的产品在哪里可以购买？     │     │
│  │ 我在上海，请问有线下门店吗？谢谢！                 │     │
│  └───────────────────────────────────────────────────┘     │
│                                                             │
│                         [标记已读]  [删除]                  │
└─────────────────────────────────────────────────────────────┘
```

### 5.12 系统设置

```
┌──────────┬──────────────────────────────────────────────────┐
│          │                                                  │
│  侧边栏   │   系统设置                            [保存]     │
│          │                                                  │
│          │   ▼ 基本设置                                     │
│          │  ┌─────────────────────────────────────────┐    │
│          │  │ 网站名称    [NIHPLOD 旎柏              ]│    │
│          │  │ 网站描述    [源自摩纳哥的高端护肤品牌   ]│    │
│          │  │ 通知邮箱    [contact@nihplod.cn        ]│    │
│          │  │ (留言通知发送至此邮箱，不对外展示)       │    │
│          │  └─────────────────────────────────────────┘    │
│          │                                                  │
│          │   ▼ AI 配置                                      │
│          │  ┌─────────────────────────────────────────┐    │
│          │  │ AI 服务商   [OpenAI ▼                  ]│    │
│          │  │ API Key     [sk-xxxx...               ]│    │
│          │  │ 模型        [gpt-4o ▼                  ]│    │
│          │  │ 系统提示词  [你是NIHPLOD的护肤顾问...  ]│    │
│          │  └─────────────────────────────────────────┘    │
│          │                                                  │
│          │   ▼ 社交媒体                                     │
│          │  ┌─────────────────────────────────────────┐    │
│          │  │ 微信二维码  [选择图片]                  │    │
│          │  │ 微博链接    [https://weibo.com/...     ]│    │
│          │  │ 小红书链接  [https://xiaohongshu.com/..]│    │
│          │  │ 抖音链接    [https://douyin.com/...    ]│    │
│          │  │ Instagram   [https://instagram.com/... ]│    │
│          │  └─────────────────────────────────────────┘    │
│          │                                                  │
│          │   ▼ 账号安全                                     │
│          │  ┌─────────────────────────────────────────┐    │
│          │  │                [修改密码]               │    │
│          │  └─────────────────────────────────────────┘    │
│          │                                                  │
└──────────┴──────────────────────────────────────────────────┘
```

---

## 六、图片优化规范

### 6.1 图片格式与尺寸

| 用途 | 推荐格式 | 最大尺寸 | 质量 |
|------|----------|----------|------|
| 产品图 | WebP (JPG 兜底) | 1200×1200px | 80% |
| 背景图 | WebP | 1920×1080px | 75% |
| 缩略图 | WebP | 400×400px | 80% |
| OG分享图 | JPG | 1200×630px | 85% |

### 6.2 响应式图片

```tsx
// 使用 Next.js Image 组件自动优化
import Image from 'next/image';

<Image
  src="/uploads/product.jpg"
  alt="产品图片"
  width={600}
  height={600}
  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
  placeholder="blur"
  blurDataURL="data:image/jpeg;base64,..."
/>
```

### 6.3 上传处理流程

```typescript
// lib/upload.ts
import sharp from 'sharp';

export async function processImage(buffer: Buffer, options: {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
}) {
  const { maxWidth = 1200, maxHeight = 1200, quality = 80 } = options;

  return sharp(buffer)
    .resize(maxWidth, maxHeight, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality })
    .toBuffer();
}
```

---

## 七、缓存策略

### 7.1 页面缓存 (Next.js ISR)

| 页面类型 | 缓存策略 | revalidate |
|----------|----------|------------|
| 首页 | ISR | 3600 (1小时) |
| 品牌故事 | ISR | 86400 (1天) |
| 产品列表 | ISR | 3600 (1小时) |
| 产品详情 | ISR | 3600 (1小时) |
| 护肤仪式 | ISR | 86400 (1天) |
| 联系我们 | ISR | 86400 (1天) |
| 招聘页面 | ISR | 3600 (1小时) |
| AI顾问 | 动态 | - |
| CMS后台 | 动态 | - |

```typescript
// app/(website)/products/page.tsx
export const revalidate = 3600; // 1小时后重新验证

// 或使用 generateStaticParams + revalidate
export async function generateStaticParams() {
  const products = await prisma.product.findMany({ select: { slug: true } });
  return products.map((p) => ({ slug: p.slug }));
}
```

### 7.2 API 缓存

```typescript
// app/api/products/route.ts
import { NextResponse } from 'next/server';

export async function GET() {
  const products = await prisma.product.findMany({ where: { published: true } });

  return NextResponse.json({ products }, {
    headers: {
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
```

### 7.3 静态资源缓存 (Nginx)

```nginx
# 图片/字体/JS/CSS 缓存 1 年
location ~* \.(jpg|jpeg|png|webp|gif|ico|woff2|woff|ttf|js|css)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```

---

## 八、安全增强配置

### 8.1 Content Security Policy (CSP)

```typescript
// next.config.js
const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://res.wx.qq.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https: blob:",
      "font-src 'self'",
      "connect-src 'self' https://api.openai.com https://api.anthropic.com",
      "frame-ancestors 'none'",
    ].join('; '),
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()',
  },
];

module.exports = {
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};
```

### 8.2 HTTPS 强制跳转 (Nginx)

```nginx
server {
    listen 80;
    server_name nihplod.cn www.nihplod.cn;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name nihplod.cn www.nihplod.cn;

    # HSTS
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
}
```

---

## 九、数据库备份策略

### 9.1 自动备份脚本

```bash
#!/bin/bash
# /scripts/backup-db.sh

BACKUP_DIR="/var/backups/nihplod"
DATE=$(date +%Y%m%d_%H%M%S)
DB_NAME="nihplod"

# 创建备份
pg_dump -U postgres -F c -b -v -f "$BACKUP_DIR/nihplod_$DATE.backup" $DB_NAME

# 保留最近 30 天的备份
find $BACKUP_DIR -name "*.backup" -mtime +30 -delete

# 可选：上传到云存储
# aws s3 cp "$BACKUP_DIR/nihplod_$DATE.backup" s3://nihplod-backups/
```

### 9.2 定时任务 (Cron)

```bash
# 每天凌晨 3 点备份
0 3 * * * /scripts/backup-db.sh >> /var/log/backup.log 2>&1
```

### 9.3 恢复命令

```bash
# 恢复数据库
pg_restore -U postgres -d nihplod -v /var/backups/nihplod/nihplod_20251201_030000.backup
```

---

## 十、错误监控与日志

### 10.1 错误监控 (可选 Sentry)

```bash
npm install @sentry/nextjs
```

```typescript
// sentry.client.config.ts
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1, // 10% 采样
  ignoreErrors: [
    'ResizeObserver loop limit exceeded',
    'Non-Error promise rejection captured',
  ],
});
```

### 10.2 应用日志

```typescript
// lib/logger.ts
const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;

export function log(level: typeof LOG_LEVELS[number], message: string, meta?: object) {
  const timestamp = new Date().toISOString();
  const logEntry = { timestamp, level, message, ...meta };

  if (process.env.NODE_ENV === 'production') {
    // 生产环境写入文件或发送到日志服务
    console.log(JSON.stringify(logEntry));
  } else {
    console[level](message, meta);
  }
}

// 使用示例
log('info', '用户提交留言', { email: 'user@example.com' });
log('error', 'AI 服务调用失败', { error: err.message });
```

### 10.3 PM2 日志管理

```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'nihplod',
    script: 'node_modules/next/dist/bin/next',
    args: 'start',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: '/var/log/nihplod/error.log',
    out_file: '/var/log/nihplod/out.log',
    merge_logs: true,
    max_size: '10M',    // 日志轮转大小
    retain: 7,          // 保留 7 个日志文件
  }],
};
```

---

## 十一、性能指标目标

### 11.1 Core Web Vitals 目标

| 指标 | 目标值 | 说明 |
|------|--------|------|
| **LCP** (Largest Contentful Paint) | < 2.5s | 最大内容绘制 |
| **FID** (First Input Delay) | < 100ms | 首次输入延迟 |
| **CLS** (Cumulative Layout Shift) | < 0.1 | 累计布局偏移 |
| **TTFB** (Time to First Byte) | < 800ms | 首字节时间 |
| **FCP** (First Contentful Paint) | < 1.8s | 首次内容绘制 |

### 11.2 优化措施

| 措施 | 影响指标 |
|------|----------|
| 使用 Next.js Image 组件 | LCP, CLS |
| 字体预加载 + font-display: swap | LCP, CLS |
| 代码分割 + 动态导入 | FID, TTFB |
| ISR 静态生成 | TTFB, LCP |
| 预连接关键域名 | LCP |

```tsx
// app/layout.tsx
<head>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="dns-prefetch" href="https://api.openai.com" />
</head>
```

### 11.3 性能监控

```typescript
// lib/performance.ts
export function reportWebVitals(metric: {
  id: string;
  name: string;
  value: number;
}) {
  // 发送到 Umami 或自定义分析
  if (typeof window !== 'undefined' && window.umami) {
    window.umami.track('web-vitals', {
      metric: metric.name,
      value: Math.round(metric.value),
    });
  }
}
```

---

## 十二、微信分享集成

### 12.1 微信 JS-SDK 配置

```typescript
// lib/wechat.ts
import crypto from 'crypto';

export async function getWechatSignature(url: string) {
  const appId = process.env.WECHAT_APP_ID;
  const appSecret = process.env.WECHAT_APP_SECRET;

  // 获取 access_token
  const tokenRes = await fetch(
    `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appId}&secret=${appSecret}`
  );
  const { access_token } = await tokenRes.json();

  // 获取 jsapi_ticket
  const ticketRes = await fetch(
    `https://api.weixin.qq.com/cgi-bin/ticket/getticket?access_token=${access_token}&type=jsapi`
  );
  const { ticket } = await ticketRes.json();

  // 生成签名
  const noncestr = crypto.randomBytes(16).toString('hex');
  const timestamp = Math.floor(Date.now() / 1000);
  const str = `jsapi_ticket=${ticket}&noncestr=${noncestr}&timestamp=${timestamp}&url=${url}`;
  const signature = crypto.createHash('sha1').update(str).digest('hex');

  return { appId, timestamp, noncestr, signature };
}
```

### 12.2 前端调用

```typescript
// hooks/useWechatShare.ts
'use client';
import { useEffect } from 'react';

export function useWechatShare(shareData: {
  title: string;
  desc: string;
  link: string;
  imgUrl: string;
}) {
  useEffect(() => {
    if (typeof window === 'undefined' || !window.wx) return;

    fetch(`/api/wechat/signature?url=${encodeURIComponent(window.location.href)}`)
      .then(res => res.json())
      .then(config => {
        window.wx.config({
          debug: false,
          appId: config.appId,
          timestamp: config.timestamp,
          nonceStr: config.noncestr,
          signature: config.signature,
          jsApiList: ['updateAppMessageShareData', 'updateTimelineShareData'],
        });

        window.wx.ready(() => {
          window.wx.updateAppMessageShareData(shareData);
          window.wx.updateTimelineShareData({
            title: shareData.title,
            link: shareData.link,
            imgUrl: shareData.imgUrl,
          });
        });
      });
  }, [shareData]);
}
```

### 12.3 环境变量

```bash
# .env
WECHAT_APP_ID="wx1234567890abcdef"
WECHAT_APP_SECRET="your-app-secret"
```

> ⚠️ **注意**：微信分享需要在微信公众平台配置 JS 安全域名为 `nihplod.cn`

---
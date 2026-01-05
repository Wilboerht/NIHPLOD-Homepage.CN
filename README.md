# NIHPLOD 中国官网

高端护肤品品牌 NIHPLOD 的中国官方网站，提供品牌展示、产品销售、AI 护肤顾问等全方位服务。

## 技术栈

- **框架**: Next.js 14 (App Router)
- **语言**: TypeScript
- **样式**: TailwindCSS + Framer Motion
- **数据库**: PostgreSQL + Prisma ORM
- **存储**: Supabase Storage
- **AI**: OpenAI API (护肤顾问)
- **3D/动画**: Three.js, GSAP, Lottie
- **支付**: 微信支付

## 主要功能

### 🛍️ 电商系统
- 产品展示与分类
- 购物车管理
- 订单处理与支付
- 用户账户与订单历史

### 🤖 AI 护肤顾问
- 智能肌肤分析
- 个性化产品推荐
- Face API 集成

### 📝 内容管理
- 品牌故事展示
- 护肤仪式指南
- 招聘信息管理
- 抽奖活动系统

### 🔧 后台管理
- 产品管理
- 订单管理
- 用户管理
- 内容编辑

## 快速开始

### 环境要求

- Node.js 18+
- PostgreSQL 数据库
- Supabase 账户

### 安装步骤

1. **克隆项目**
   ```bash
   git clone <repository-url>
   cd nihplod.cn
   ```

2. **安装依赖**
   ```bash
   npm install
   ```

3. **配置环境变量**
   ```bash
   cp .env.example .env.local
   # 编辑 .env.local 填入必要配置
   ```

4. **初始化数据库**
   ```bash
   npm run db:push
   npm run db:seed
   ```

5. **启动开发服务器**
   ```bash
   npm run dev
   ```

访问 [http://localhost:3000](http://localhost:3000) 查看网站。

## 项目结构

```
src/
├── app/
│   ├── (admin)/      # 后台管理页面
│   ├── (website)/    # 前台网站页面
│   └── api/          # API 路由
├── components/       # React 组件
├── config/           # 配置文件
├── contexts/         # React Context
├── hooks/            # 自定义 Hooks
├── lib/              # 工具库
├── schemas/          # Zod 验证模式
└── types/            # TypeScript 类型
```

## 常用命令

| 命令 | 描述 |
|------|------|
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 构建生产版本 |
| `npm run start` | 启动生产服务器 |
| `npm run lint` | 代码检查 |
| `npm run format` | 代码格式化 |
| `npm run db:studio` | 打开 Prisma Studio |

## 文档

详细文档位于 `/docs` 目录：

- [产品需求文档](docs/NIHPLOD-PRD.md)
- [技术架构](docs/NIHPLOD-TechStack.md)
- [API 文档](docs/NIHPLOD-API.md)
- [数据库设计](docs/NIHPLOD-Database.md)
- [用户体验设计](docs/NIHPLOD-UX.md)

## 部署

推荐使用 [Vercel](https://vercel.com) 部署：

```bash
npm run build
```

确保在 Vercel 中配置所有必要的环境变量。

## 许可证

私有项目，保留所有权利。

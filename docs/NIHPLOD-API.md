# NIHPLOD API 接口文档

> 版本：1.5
> 日期：2025年12月
> 状态：✅ 已审核

📎 **相关文档**：[PRD](./NIHPLOD-PRD.md) | [UX](./NIHPLOD-UX.md) | [技术栈](./NIHPLOD-TechStack.md) | [数据库](./NIHPLOD-Database.md) | [开发计划](./NIHPLOD-DevPlan.md)

---

## 一、公开 API

> 前端网站调用，无需认证

### 1.1 产品相关

```
GET /api/products
```
获取产品列表

| 参数 | 类型 | 说明 |
|------|------|------|
| category | string | 可选，按分类筛选 |
| featured | boolean | 可选，只获取推荐产品 |

**响应示例**：
```json
{
  "products": [
    {
      "id": "xxx",
      "name": "精华液",
      "nameEn": "Serum",
      "slug": "vital-serum",
      "price": 1280,
      "capacity": "30ml",
      "images": ["/uploads/serum-1.jpg"],
      "category": { "name": "精华", "nameEn": "Serum", "slug": "serum" }
    }
  ]
}
```

---

```
GET /api/products/:slug
```
获取产品详情

**响应示例**：
```json
{
  "id": "xxx",
  "name": "精华液",
  "nameEn": "Serum",
  "slug": "serum",
  "description": "...",
  "price": 1280,
  "capacity": "30ml",
  "purchaseUrl": "https://tmall.com/...",
  "images": [...],
  "ingredients": "...",
  "usage": "...",
  "benefits": ["抗老", "保湿"]
}
```

---

### 1.2 分类相关

```
GET /api/categories
```
获取分类列表

**响应示例**：
```json
{
  "categories": [
    { "id": "xxx", "name": "泡沫洁面", "nameEn": "Foam Cleanser", "slug": "foam-cleanser" },
    { "id": "xxx", "name": "面部磨砂", "nameEn": "Face Scrub", "slug": "face-scrub" },
    { "id": "xxx", "name": "面膜", "nameEn": "Face Mask", "slug": "face-mask" },
    { "id": "xxx", "name": "精华", "nameEn": "Serum", "slug": "serum" },
    { "id": "xxx", "name": "面霜", "nameEn": "Face Cream", "slug": "face-cream" },
    { "id": "xxx", "name": "护手霜", "nameEn": "Hand Cream", "slug": "hand-cream" },
    { "id": "xxx", "name": "防晒", "nameEn": "Sunscreen", "slug": "sunscreen" },
    { "id": "xxx", "name": "身体乳", "nameEn": "Body Lotion", "slug": "body-lotion" },
    { "id": "xxx", "name": "护理油", "nameEn": "Treatment Oil", "slug": "treatment-oil" },
    { "id": "xxx", "name": "礼盒系列", "nameEn": "Gift Box Series", "slug": "gift-box" }
  ]
}
```

---

### 1.3 页面内容

```
GET /api/pages/:slug
```
获取页面内容（home, story, ritual, contact, careers）

**响应示例**：
```json
{
  "title": "品牌故事",
  "slug": "story",
  "content": {
    "hero": { "title": "...", "subtitle": "..." },
    "sections": [...]
  },
  "seo": { "title": "...", "description": "..." }
}
```

---

### 1.4 招聘职位

```
GET /api/jobs
```
获取已发布的职位列表

**响应示例**：
```json
{
  "jobs": [
    {
      "id": "xxx",
      "title": "市场营销经理",
      "titleEn": "Marketing Manager",
      "location": "上海",
      "type": "全职",
      "description": "负责品牌推广与市场策略制定...",
      "requirements": "5年以上市场营销经验..."
    }
  ]
}
```

---

```
GET /api/jobs/:id
```
获取职位详情

---

### 1.5 联系留言

```
POST /api/contact
```
提交联系表单留言

**请求体**：
```json
{
  "name": "张三",
  "email": "zhangsan@example.com",
  "content": "您好，我想咨询产品相关问题...",
  "honeypot": ""
}
```

> ⚠️ **防刷机制**：
> - `honeypot` 字段为蜜罐字段，前端隐藏，如有值则判定为机器人
> - 服务端实现 IP 限流：同一 IP 每分钟最多 3 次提交
> - 可选：接入第三方验证码服务（如腾讯验证码）

**响应示例**：
```json
{
  "success": true,
  "message": "留言已提交，我们会尽快回复您"
}
```

**错误响应**：
```json
{
  "error": {
    "code": "RATE_LIMIT",
    "message": "提交过于频繁，请稍后再试"
  }
}
```

---

### 1.6 AI 护肤顾问

```
GET /api/advisor/questions
```
获取AI问答的问题列表（仅返回active的问题）

**响应示例**：
```json
{
  "questions": [
    {
      "id": "xxx",
      "question": "你的肌肤类型是？",
      "fieldName": "skinType",
      "type": "single",
      "options": [
        { "value": "dry", "label": "干性肌肤", "description": "经常感到紧绑、脱皮" },
        { "value": "oily", "label": "油性肌肤", "description": "容易出油、毛孔粗大" },
        { "value": "combination", "label": "混合肌肤", "description": "T区油、两颊干" },
        { "value": "sensitive", "label": "敏感肌肤", "description": "容易泛红、刺痛" },
        { "value": "unsure", "label": "不确定", "description": "不太清楚自己的肌肤类型" }
      ],
      "order": 1
    }
  ]
}
```

---

```
POST /api/advisor/analyze
```
AI 护肤分析

**请求体**：
```json
{
  "answers": {
    "skinType": "combination",
    "concern": "aging",
    "sleep": "6-7h",
    "environment": "office",
    "routine": "basic",
    "preference": "ritual"
  }
}
```

**响应示例**：
```json
{
  "analysis": "根据您的肌肤状况分析...",
  "recommendations": [
    {
      "product": { "id": "xxx", "name": "精华液", ... },
      "reason": "针对您的抗老需求..."
    }
  ],
  "routineSuggestion": "建议您采用以下护肤步骤...",
  "source": "ai"
}
```

#### AI 服务降级响应

> 当 AI 服务不可用时（API 超时、配额耗尽、服务异常），系统自动切换到基于规则匹配的推荐模式。

**降级响应示例**：
```json
{
  "analysis": "根据您的肌肤类型和关注点，我们为您推荐以下产品组合。",
  "recommendations": [
    {
      "product": { "id": "xxx", "name": "精华液", ... },
      "reason": "适合混合性肌肤的抗老护理"
    }
  ],
  "routineSuggestion": "建议您按照以下步骤进行日常护肤：洁面 → 精华 → 面霜 → 防晒（日间）",
  "source": "fallback",
  "notice": "当前为智能推荐模式，如需更精准的个性化建议，请稍后重试"
}
```

**响应字段说明**：
| 字段 | 类型 | 说明 |
|------|------|------|
| source | string | `"ai"` = AI生成，`"fallback"` = 规则匹配降级 |
| notice | string | 仅降级时返回，提示用户当前为备用模式 |

**降级匹配逻辑**：
1. 根据 `skinType` + `concern` 组合查询 `RecommendationRule` 表
2. 按 `priority` 降序选取匹配规则
3. 返回规则关联的产品及预设推荐语

---

### 1.7 公开设置

```
GET /api/settings/public
```
获取前台需要的公开设置（站点信息、社交媒体等）

**响应示例**：
```json
{
  "site_name": "NIHPLOD 旎柏",
  "site_description": "源自摩纳哥的高端护肤品牌",
  "social": {
    "wechat_qrcode": "/uploads/wechat-qr.jpg",
    "weibo": "https://weibo.com/nihplod",
    "xiaohongshu": "https://xiaohongshu.com/...",
    "douyin": "https://douyin.com/...",
    "instagram": "https://instagram.com/nihplod"
  }
}
```

> ⚠️ **隐私说明**：不对外公开公司地址、电话等联系方式，用户通过留言表单联系。

---

## 二、管理 API

> CMS 后台调用，需要 JWT 认证

### 2.1 认证

```
POST /api/admin/login
```
管理员登录

**请求体**：
```json
{
  "email": "admin@nihplod.cn",
  "password": "xxx"
}
```

**响应**：
```json
{
  "success": true,
  "user": { "id": "xxx", "email": "admin@nihplod.cn", "name": "Admin" }
}
```
> Token 通过 HttpOnly Cookie 返回

---

```
POST /api/admin/logout
```
退出登录

---

```
PUT /api/admin/password
```
修改密码

**请求体**：
```json
{
  "oldPassword": "当前密码",
  "newPassword": "新密码"
}
```

**响应**：
```json
{
  "success": true,
  "message": "密码修改成功"
}
```

---

### 2.2 产品管理

```
GET    /api/admin/products          - 获取产品列表（含未发布）
POST   /api/admin/products          - 创建产品
PUT    /api/admin/products/:id      - 更新产品
DELETE /api/admin/products/:id      - 删除产品
```

---

### 2.3 分类管理

```
GET    /api/admin/categories        - 获取分类列表
POST   /api/admin/categories        - 创建分类
PUT    /api/admin/categories/:id    - 更新分类
DELETE /api/admin/categories/:id    - 删除分类
```

---

### 2.4 内容管理

```
GET    /api/admin/pages             - 获取所有页面
PUT    /api/admin/pages/:slug       - 更新页面内容
```

---

### 2.5 媒体管理

```
GET    /api/admin/media             - 获取媒体列表
POST   /api/admin/media/upload      - 上传文件（multipart/form-data）
DELETE /api/admin/media/:id         - 删除媒体
```

**上传限制**：
- 图片：JPG/PNG/WebP，最大 5MB
- 视频：MP4，最大 50MB

---

### 2.6 AI 配置

```
GET    /api/admin/advisor/questions - 获取问题配置
PUT    /api/admin/advisor/questions - 更新问题配置
GET    /api/admin/advisor/rules     - 获取推荐规则
PUT    /api/admin/advisor/rules     - 更新推荐规则
```

---

### 2.7 职位管理

```
GET    /api/admin/jobs              - 获取职位列表（含未发布）
POST   /api/admin/jobs              - 创建职位
PUT    /api/admin/jobs/:id          - 更新职位
DELETE /api/admin/jobs/:id          - 删除职位
```

---

### 2.8 留言管理

> 📝 **命名说明**：公开API使用 `/api/contact` 提交留言，管理API使用 `/api/admin/contact` 管理留言，数据库模型为 `ContactMessage`，保持语义一致。

```
GET    /api/admin/contact           - 获取留言列表
GET    /api/admin/contact/:id       - 获取留言详情
PUT    /api/admin/contact/:id/read  - 标记为已读
DELETE /api/admin/contact/:id       - 删除留言
```

**留言列表参数**：
| 参数 | 类型 | 说明 |
|------|------|------|
| status | string | 可选，`all` / `unread` / `read` |
| page | number | 分页页码，默认 1 |
| limit | number | 每页数量，默认 20 |

---

### 2.9 系统设置

```
GET    /api/admin/settings          - 获取系统设置
PUT    /api/admin/settings          - 更新系统设置
```

---

## 三、错误响应

所有 API 错误返回统一格式：

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "请先登录"
  }
}
```

### 错误码列表

| 状态码 | code | 说明 |
|--------|------|------|
| 400 | BAD_REQUEST | 请求参数错误 |
| 400 | VALIDATION_ERROR | 数据验证失败 |
| 401 | UNAUTHORIZED | 未登录或 Token 过期 |
| 403 | FORBIDDEN | 无权限 |
| 404 | NOT_FOUND | 资源不存在 |
| 429 | RATE_LIMIT | 请求过于频繁 |
| 500 | SERVER_ERROR | 服务器错误 |
| 503 | AI_UNAVAILABLE | AI 服务不可用 |

---

## 四、数据验证规则

> 使用 Zod 进行请求参数验证，以下为各接口的验证 Schema：

### 4.1 联系表单验证

```typescript
// lib/validations/contact.ts
import { z } from 'zod';

export const contactSchema = z.object({
  name: z.string()
    .min(2, '姓名至少 2 个字符')
    .max(20, '姓名最多 20 个字符')
    .regex(/^[\u4e00-\u9fa5a-zA-Z\s]+$/, '姓名只能包含中英文和空格'),
  email: z.string()
    .email('请输入有效的邮箱地址'),
  content: z.string()
    .min(10, '留言内容至少 10 个字符')
    .max(500, '留言内容最多 500 个字符'),
  honeypot: z.string()
    .max(0, '非法请求')  // 蜜罐字段必须为空
    .optional(),
});
```

### 4.2 产品表单验证 (CMS)

```typescript
// lib/validations/product.ts
import { z } from 'zod';

export const productSchema = z.object({
  name: z.string()
    .min(2, '产品名称至少 2 个字符')
    .max(50, '产品名称最多 50 个字符'),
  nameEn: z.string()
    .min(2, '英文名称至少 2 个字符')
    .max(100, '英文名称最多 100 个字符')
    .regex(/^[a-zA-Z\s\-]+$/, '英文名称只能包含英文字母、空格和连字符'),
  slug: z.string()
    .min(2, 'URL标识至少 2 个字符')
    .max(50, 'URL标识最多 50 个字符')
    .regex(/^[a-z0-9\-]+$/, 'URL标识只能包含小写字母、数字和连字符'),
  description: z.string()
    .min(10, '产品描述至少 10 个字符')
    .max(2000, '产品描述最多 2000 个字符'),
  price: z.number()
    .min(0, '价格不能为负数')
    .max(99999, '价格超出范围'),
  capacity: z.string()
    .max(20, '规格最多 20 个字符')
    .optional(),
  purchaseUrl: z.string()
    .url('请输入有效的购买链接')
    .optional()
    .or(z.literal('')),
  categoryId: z.string()
    .cuid('无效的分类 ID'),
  ingredients: z.string()
    .max(2000, '成分说明最多 2000 个字符')
    .optional(),
  usage: z.string()
    .max(1000, '使用方法最多 1000 个字符')
    .optional(),
  benefits: z.array(z.string().max(20))
    .max(10, '功效标签最多 10 个')
    .optional(),
  order: z.number()
    .int('排序必须为整数')
    .min(0)
    .default(0),
  featured: z.boolean().default(false),
  published: z.boolean().default(false),
});
```

### 4.3 职位表单验证 (CMS)

```typescript
// lib/validations/job.ts
import { z } from 'zod';

export const jobSchema = z.object({
  title: z.string()
    .min(2, '职位名称至少 2 个字符')
    .max(50, '职位名称最多 50 个字符'),
  titleEn: z.string()
    .min(2, '英文名称至少 2 个字符')
    .max(100, '英文名称最多 100 个字符')
    .optional(),
  location: z.enum(['上海', '摩纳哥', '北京', '深圳', '远程'], {
    errorMap: () => ({ message: '请选择有效的工作地点' }),
  }),
  type: z.enum(['全职', '兼职', '实习'], {
    errorMap: () => ({ message: '请选择有效的职位类型' }),
  }),
  description: z.string()
    .min(20, '职位描述至少 20 个字符')
    .max(5000, '职位描述最多 5000 个字符'),
  requirements: z.string()
    .min(20, '任职要求至少 20 个字符')
    .max(3000, '任职要求最多 3000 个字符'),
  salary: z.string()
    .max(50, '薪资范围最多 50 个字符')
    .optional(),
  order: z.number().int().min(0).default(0),
  published: z.boolean().default(false),
});
```

### 4.4 密码修改验证

```typescript
// lib/validations/auth.ts
import { z } from 'zod';

export const passwordSchema = z.object({
  oldPassword: z.string()
    .min(1, '请输入当前密码'),
  newPassword: z.string()
    .min(8, '新密码至少 8 个字符')
    .max(32, '新密码最多 32 个字符')
    .regex(/[a-z]/, '密码必须包含小写字母')
    .regex(/[A-Z]/, '密码必须包含大写字母')
    .regex(/[0-9]/, '密码必须包含数字'),
});

export const loginSchema = z.object({
  email: z.string().email('请输入有效的邮箱'),
  password: z.string().min(1, '请输入密码'),
});
```

### 4.5 AI 问答验证

```typescript
// lib/validations/advisor.ts
import { z } from 'zod';

export const advisorAnswersSchema = z.object({
  answers: z.object({
    skinType: z.enum(['dry', 'oily', 'combination', 'sensitive', 'unsure'], {
      errorMap: () => ({ message: '请选择肌肤类型' }),
    }),
    concern: z.enum(['aging', 'dull', 'hydration', 'pores', 'sensitive'], {
      errorMap: () => ({ message: '请选择肌肤关注点' }),
    }),
    sleep: z.enum(['less6', '6to7', '7to8', 'more8'], {
      errorMap: () => ({ message: '请选择睡眠时长' }),
    }),
    environment: z.enum(['office', 'outdoor', 'aircon', 'mixed'], {
      errorMap: () => ({ message: '请选择工作环境' }),
    }),
    routine: z.enum(['basic', 'medium', 'advanced', 'irregular'], {
      errorMap: () => ({ message: '请选择护肤习惯' }),
    }),
    preference: z.enum(['simple', 'ritual', 'couple'], {
      errorMap: () => ({ message: '请选择护肤偏好' }),
    }),
  }),
});
```

### 4.6 验证错误响应格式

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "数据验证失败",
    "details": [
      { "field": "name", "message": "姓名至少 2 个字符" },
      { "field": "email", "message": "请输入有效的邮箱地址" }
    ]
  }
}
```

---


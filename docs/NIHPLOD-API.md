# NIHPLOD API 接口文档

> 版本：1.2
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
| 401 | UNAUTHORIZED | 未登录或 Token 过期 |
| 403 | FORBIDDEN | 无权限 |
| 404 | NOT_FOUND | 资源不存在 |
| 500 | SERVER_ERROR | 服务器错误 |

---


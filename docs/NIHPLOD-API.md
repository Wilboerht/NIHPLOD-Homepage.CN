# NIHPLOD API 接口文档

> 版本：1.0
> 日期：2025年12月
> 状态：草案

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

### 1.4 AI 护肤顾问

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
  "routineSuggestion": "建议您采用以下护肤步骤..."
}
```

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

### 2.7 系统设置

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


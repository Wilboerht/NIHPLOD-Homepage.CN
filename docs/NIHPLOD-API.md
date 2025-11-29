# NIHPLOD API 接口文档

> 版本：1.0
> 日期：2025年12月
> Base URL：`https://nihplod.cn/api`

---

## 一、接口概览

| 模块 | 前缀 | 说明 |
|------|------|------|
| 认证 | `/auth` | 登录/登出 |
| 产品 | `/products` | 产品 CRUD |
| 页面 | `/pages` | 页面内容管理 |
| 媒体 | `/media` | 文件上传/管理 |
| AI顾问 | `/advisor` | 问题配置/推荐 |
| 分类 | `/categories` | 产品分类管理 |

---

## 二、通用规范

### 请求格式

```
Content-Type: application/json
Authorization: Bearer <token>  # 需要认证的接口
```

### 响应格式

**成功响应：**
```json
{
  "success": true,
  "data": { ... },
  "message": "操作成功"
}
```

**错误响应：**
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "未授权访问"
  }
}
```

### 错误码

| 错误码 | HTTP状态码 | 说明 |
|--------|-----------|------|
| `UNAUTHORIZED` | 401 | 未授权 |
| `FORBIDDEN` | 403 | 禁止访问 |
| `NOT_FOUND` | 404 | 资源不存在 |
| `VALIDATION_ERROR` | 400 | 参数验证失败 |
| `INTERNAL_ERROR` | 500 | 服务器错误 |

---

## 三、认证接口

### 3.1 管理员登录

```
POST /auth/login
```

**请求参数：**
```json
{
  "username": "admin",
  "password": "password123"
}
```

**成功响应：**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 86400,
    "user": {
      "id": "1",
      "username": "admin",
      "role": "admin"
    }
  }
}
```

### 3.2 登出

```
POST /auth/logout
Authorization: Bearer <token>
```

**成功响应：**
```json
{
  "success": true,
  "message": "已登出"
}
```

### 3.3 验证Token

```
GET /auth/verify
Authorization: Bearer <token>
```

**成功响应：**
```json
{
  "success": true,
  "data": {
    "valid": true,
    "user": {
      "id": "1",
      "username": "admin",
      "role": "admin"
    }
  }
}
```

---

## 四、产品接口

### 4.1 获取产品列表

```
GET /products
```

**查询参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `page` | number | 否 | 页码，默认 1 |
| `limit` | number | 否 | 每页数量，默认 10 |
| `category` | string | 否 | 分类 slug |
| `featured` | boolean | 否 | 是否精选 |
| `published` | boolean | 否 | 是否已发布 |
| `search` | string | 否 | 搜索关键词 |

**成功响应：**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "clx1234567890",
        "name": "焕活精华露",
        "slug": "revitalizing-serum",
        "description": "深层滋养，焕发肌肤活力",
        "price": 1280.00,
        "category": {
          "id": "cat1",
          "name": "精华",
          "slug": "serum"
        },
        "images": [
          {
            "id": "img1",
            "url": "/uploads/products/serum-1.jpg",
            "alt": "焕活精华露"
          }
        ],
        "featured": true,
        "published": true,
        "createdAt": "2025-01-01T00:00:00Z",
        "updatedAt": "2025-01-01T00:00:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 25,
      "totalPages": 3
    }
  }
}
```

### 4.2 获取单个产品

```
GET /products/:slug
```

**成功响应：**
```json
{
  "success": true,
  "data": {
    "id": "clx1234567890",
    "name": "焕活精华露",
    "slug": "revitalizing-serum",
    "description": "深层滋养，焕发肌肤活力",
    "fullDescription": "采用先进的脂质体技术...",
    "price": 1280.00,
    "category": {
      "id": "cat1",
      "name": "精华",
      "slug": "serum"
    },
    "images": [...],
    "ingredients": "水、甘油、透明质酸钠...",
    "usage": "取适量于掌心，轻轻按压于面部...",
    "benefits": ["深层保湿", "提亮肤色", "紧致肌肤"],
    "volume": "30ml",
    "purchaseLinks": [
      {
        "platform": "天猫",
        "url": "https://tmall.com/...",
        "icon": "tmall"
      },
      {
        "platform": "京东",
        "url": "https://jd.com/...",
        "icon": "jd"
      }
    ],
    "featured": true,
    "published": true,
    "order": 1,
    "seo": {
      "title": "焕活精华露 | NIHPLOD",
      "description": "NIHPLOD 焕活精华露，采用脂质体技术..."
    },
    "createdAt": "2025-01-01T00:00:00Z",
    "updatedAt": "2025-01-01T00:00:00Z"
  }
}
```

### 4.3 创建产品

```
POST /products
Authorization: Bearer <token>
```

**请求参数：**
```json
{
  "name": "焕活精华露",
  "slug": "revitalizing-serum",
  "description": "深层滋养，焕发肌肤活力",
  "fullDescription": "采用先进的脂质体技术...",
  "price": 1280.00,
  "categoryId": "cat1",
  "imageIds": ["img1", "img2"],
  "ingredients": "水、甘油、透明质酸钠...",
  "usage": "取适量于掌心...",
  "benefits": ["深层保湿", "提亮肤色"],
  "volume": "30ml",
  "purchaseLinks": [
    { "platform": "天猫", "url": "https://...", "icon": "tmall" }
  ],
  "featured": false,
  "published": false,
  "order": 0,
  "seo": {
    "title": "焕活精华露 | NIHPLOD",
    "description": "..."
  }
}
```

### 4.4 更新产品

```
PUT /products/:id
Authorization: Bearer <token>
```

**请求参数：** 同创建产品（所有字段可选）

### 4.5 删除产品

```
DELETE /products/:id
Authorization: Bearer <token>
```

**成功响应：**
```json
{
  "success": true,
  "message": "产品已删除"
}
```

### 4.6 更新产品排序

```
PATCH /products/reorder
Authorization: Bearer <token>
```

**请求参数：**
```json
{
  "orders": [
    { "id": "prod1", "order": 0 },
    { "id": "prod2", "order": 1 },
    { "id": "prod3", "order": 2 }
  ]
}
```

---

## 五、页面内容接口

### 5.1 获取页面内容

```
GET /pages/:slug
```

**Slug 列表：**
| Slug | 页面 |
|------|------|
| `home` | 首页 |
| `story` | 品牌故事 |
| `ritual` | 护肤仪式 |
| `contact` | 联系我们 |
| `landing` | Landing Page |

**成功响应：**
```json
{
  "success": true,
  "data": {
    "id": "page1",
    "slug": "home",
    "title": "首页",
    "sections": [
      {
        "id": "sec1",
        "type": "hero",
        "order": 0,
        "content": {
          "title": "为挚爱，臻选护肤",
          "subtitle": "源自摩纳哥的奢护体验",
          "image": "/uploads/pages/hero.jpg",
          "cta": {
            "text": "探索产品",
            "link": "/products"
          }
        }
      },
      {
        "id": "sec2",
        "type": "philosophy",
        "order": 1,
        "content": {
          "title": "品牌理念",
          "description": "NIHPLOD 相信..."
        }
      }
    ],
    "seo": {
      "title": "NIHPLOD | 为挚爱，臻选护肤",
      "description": "..."
    },
    "updatedAt": "2025-01-01T00:00:00Z"
  }
}
```

### 5.2 更新页面内容

```
PUT /pages/:slug
Authorization: Bearer <token>
```

**请求参数：**
```json
{
  "sections": [...],
  "seo": {
    "title": "...",
    "description": "..."
  }
}
```

---

## 六、媒体接口

### 6.1 获取媒体列表

```
GET /media
Authorization: Bearer <token>
```

**查询参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `page` | number | 否 | 页码 |
| `limit` | number | 否 | 每页数量 |
| `type` | string | 否 | 类型：image/video |
| `folder` | string | 否 | 文件夹：products/pages/media |

**成功响应：**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "media1",
        "filename": "serum-1.jpg",
        "originalName": "产品图1.jpg",
        "url": "/uploads/products/serum-1.jpg",
        "type": "image",
        "mimeType": "image/jpeg",
        "size": 102400,
        "width": 1200,
        "height": 800,
        "folder": "products",
        "alt": "焕活精华露",
        "createdAt": "2025-01-01T00:00:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 50,
      "totalPages": 3
    }
  }
}
```

### 6.2 上传文件

```
POST /media/upload
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

**请求参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `file` | File | 是 | 文件 |
| `folder` | string | 否 | 目标文件夹 |
| `alt` | string | 否 | 图片alt文本 |

**成功响应：**
```json
{
  "success": true,
  "data": {
    "id": "media1",
    "filename": "serum-1.jpg",
    "url": "/uploads/products/serum-1.jpg",
    "type": "image",
    "size": 102400,
    "width": 1200,
    "height": 800
  }
}
```

### 6.3 更新媒体信息

```
PATCH /media/:id
Authorization: Bearer <token>
```

**请求参数：**
```json
{
  "alt": "新的描述文字",
  "folder": "products"
}
```

### 6.4 删除媒体

```
DELETE /media/:id
Authorization: Bearer <token>
```

---

## 七、分类接口

### 7.1 获取分类列表

```
GET /categories
```

**成功响应：**
```json
{
  "success": true,
  "data": [
    {
      "id": "cat1",
      "name": "精华",
      "slug": "serum",
      "description": "精华类产品",
      "order": 0,
      "productCount": 5
    },
    {
      "id": "cat2",
      "name": "面霜",
      "slug": "cream",
      "description": "面霜类产品",
      "order": 1,
      "productCount": 3
    }
  ]
}
```

### 7.2 创建分类

```
POST /categories
Authorization: Bearer <token>
```

**请求参数：**
```json
{
  "name": "精华",
  "slug": "serum",
  "description": "精华类产品",
  "order": 0
}
```

### 7.3 更新分类

```
PUT /categories/:id
Authorization: Bearer <token>
```

### 7.4 删除分类

```
DELETE /categories/:id
Authorization: Bearer <token>
```

---

## 八、AI 顾问接口

### 8.1 获取问题列表（前台）

```
GET /advisor/questions
```

**成功响应：**
```json
{
  "success": true,
  "data": [
    {
      "id": "q1",
      "order": 1,
      "question": "你的肌肤类型是？",
      "description": "了解你的基础肤质",
      "type": "single",
      "options": [
        { "id": "o1", "text": "干性", "value": "dry", "icon": "💧" },
        { "id": "o2", "text": "油性", "value": "oily", "icon": "✨" },
        { "id": "o3", "text": "混合性", "value": "combination", "icon": "🌗" },
        { "id": "o4", "text": "敏感性", "value": "sensitive", "icon": "🌸" },
        { "id": "o5", "text": "不确定", "value": "unknown", "icon": "❓" }
      ]
    },
    {
      "id": "q2",
      "order": 2,
      "question": "你最关注的肌肤问题是？",
      "description": "选择最想改善的问题",
      "type": "single",
      "options": [
        { "id": "o6", "text": "细纹抗老", "value": "anti-aging" },
        { "id": "o7", "text": "暗沉提亮", "value": "brightening" },
        { "id": "o8", "text": "补水保湿", "value": "hydrating" },
        { "id": "o9", "text": "毛孔粗大", "value": "pores" },
        { "id": "o10", "text": "敏感泛红", "value": "redness" }
      ]
    }
  ]
}
```

### 8.2 提交答案获取推荐

```
POST /advisor/recommend
```

**请求参数：**
```json
{
  "answers": [
    { "questionId": "q1", "optionValue": "dry" },
    { "questionId": "q2", "optionValue": "hydrating" },
    { "questionId": "q3", "optionValue": "less-6" },
    { "questionId": "q4", "optionValue": "computer" },
    { "questionId": "q5", "optionValue": "3-4" },
    { "questionId": "q6", "optionValue": "ritual" }
  ]
}
```

**成功响应：**
```json
{
  "success": true,
  "data": {
    "skinProfile": {
      "type": "干性肌肤",
      "concerns": ["缺水", "易干燥"],
      "lifestyle": "长时间面对电脑，睡眠不足"
    },
    "aiAdvice": "根据你的肤质分析，建议重点关注补水保湿...",
    "recommendedProducts": [
      {
        "id": "prod1",
        "name": "焕活精华露",
        "slug": "revitalizing-serum",
        "reason": "深层补水，适合干性肌肤",
        "matchScore": 95,
        "image": "/uploads/products/serum.jpg",
        "price": 1280.00
      },
      {
        "id": "prod2",
        "name": "滋养面霜",
        "slug": "nourishing-cream",
        "reason": "锁住水分，持久滋润",
        "matchScore": 90,
        "image": "/uploads/products/cream.jpg",
        "price": 980.00
      }
    ],
    "ritualSuggestion": {
      "morning": ["洁面", "精华", "面霜", "防晒"],
      "evening": ["卸妆", "洁面", "精华", "眼霜", "面霜"]
    }
  }
}
```

### 8.3 获取问题配置（后台）

```
GET /advisor/config
Authorization: Bearer <token>
```

### 8.4 更新问题配置（后台）

```
PUT /advisor/config
Authorization: Bearer <token>
```

**请求参数：**
```json
{
  "questions": [
    {
      "id": "q1",
      "order": 1,
      "question": "你的肌肤类型是？",
      "description": "了解你的基础肤质",
      "type": "single",
      "options": [...]
    }
  ],
  "rules": [
    {
      "id": "rule1",
      "conditions": [
        { "questionId": "q1", "operator": "equals", "value": "dry" },
        { "questionId": "q2", "operator": "equals", "value": "hydrating" }
      ],
      "productIds": ["prod1", "prod2"],
      "priority": 1
    }
  ]
}
```

---

## 九、公共接口

### 9.1 网站配置

```
GET /config/site
```

**成功响应：**
```json
{
  "success": true,
  "data": {
    "name": "NIHPLOD",
    "tagline": "为挚爱，臻选护肤",
    "logo": "/images/logo.svg",
    "contact": {
      "email": "contact@nihplod.cn",
      "phone": "+86 xxx xxxx xxxx"
    },
    "social": {
      "weibo": "https://weibo.com/nihplod",
      "wechat": "nihplod_official",
      "xiaohongshu": "https://..."
    }
  }
}
```

### 9.2 导航菜单

```
GET /config/navigation
```

**成功响应：**
```json
{
  "success": true,
  "data": {
    "main": [
      { "label": "首页", "href": "/home" },
      { "label": "产品", "href": "/products" },
      { "label": "品牌故事", "href": "/story" },
      { "label": "护肤仪式", "href": "/ritual" },
      { "label": "联系我们", "href": "/contact" }
    ],
    "footer": [...]
  }
}
```

---

## 十、数据模型参考

### Product（产品）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 唯一标识 |
| name | string | 产品名称 |
| slug | string | URL 标识 |
| description | string | 简短描述 |
| fullDescription | string | 完整描述 |
| price | decimal | 价格 |
| categoryId | string | 分类 ID |
| images | Image[] | 图片列表 |
| ingredients | string | 成分 |
| usage | string | 使用方法 |
| benefits | string[] | 功效列表 |
| volume | string | 规格容量 |
| purchaseLinks | JSON | 购买链接 |
| featured | boolean | 是否精选 |
| published | boolean | 是否发布 |
| order | number | 排序 |
| seo | JSON | SEO 配置 |
| createdAt | datetime | 创建时间 |
| updatedAt | datetime | 更新时间 |

### Media（媒体）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 唯一标识 |
| filename | string | 存储文件名 |
| originalName | string | 原始文件名 |
| url | string | 访问路径 |
| type | string | 类型 image/video |
| mimeType | string | MIME 类型 |
| size | number | 文件大小(bytes) |
| width | number | 图片宽度 |
| height | number | 图片高度 |
| folder | string | 所属文件夹 |
| alt | string | Alt 文本 |
| createdAt | datetime | 创建时间 |

---

**文档状态：✅ 已确定**


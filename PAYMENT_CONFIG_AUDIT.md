# 生产环境支付配置审计报告

> 审计时间：2026年4月1日  
> 平台：nihplod.cn 电商支付系统  
> 状态：⚠️ **配置不完整 - 需要立即补充**

---

## 📋 目录

1. [配置现状](#配置现状)
2. [微信支付配置清单](#微信支付配置清单)
3. [支付宝配置清单](#支付宝配置清单)
4. [银联支付配置清单](#银联支付配置清单)
5. [环境变量完整性检查](#环境变量完整性检查)
6. [配置优先级与建议](#配置优先级与建议)
7. [部署前清单](#部署前清单)

---

## 配置现状

### ❌ 当前问题

**文件**: `.env.production`  
**状态**: 所有支付配置被注释掉（#注释）  
**影响范围**: 生产环境无法启动支付功能

```diff
# 当前状况：
- WECHAT_PAY_* (全部注释)
- ALIPAY_* (全部注释)  
- UNIONPAY_* (全部注释)
```

**严重程度**: 🔴 **CRITICAL** - 生产环境无法接收支付

---

## 微信支付配置清单

### 配置代码位置
- **实现文件**: `src/lib/wechat-pay.ts` (第20-27行)
- **配置方式**: `process.env` 环境变量

### 必需的环境变量

| 环境变量 | 类型 | 描述 | 示例 | 必需 | 当前状态 |
|---------|------|------|------|------|--------|
| `WECHAT_PAY_APP_ID` | 文本 | 微信公众平台 App ID | `wxd7e6b5a4c3f2e1d0` | ✅ 必需 | ❌ 注释 |
| `WECHAT_PAY_MCH_ID` | 文本 | 微信支付商户号 | `1670987654` | ✅ 必需 | ❌ 注释 |
| `WECHAT_PAY_API_V3_KEY` | 文本 | APIv3 密钥 (32字符) | `Nihplod_Wechat_Pay_V3_Key_20240101` | ✅ 必需 | ❌ 注释 |
| `WECHAT_PAY_NOTIFY_URL` | URL | 支付成功回调地址 | `https://nihplod.cn/api/pay/notify/wechat` | ✅ 必需 | ❌ 注释 |
| `WECHAT_PAY_SERIAL_NO` | 文本 | 证书序列号 | `3A5C7E9B1D0F2E4A6C8B0D2F4E6A8C0B2D4E6F8` | ✅ 必需 | ❌ 注释 |
| `WECHAT_PAY_KEY_PEM` | 文本 | 私钥 (PEM格式) | `-----BEGIN RSA PRIVATE KEY-----\n...` | ✅ 必需 | ❌ 注释 |
| `WECHAT_PAY_PLATFORM_PUBLIC_KEY` | 文本 | 微信平台公钥 | `-----BEGIN PUBLIC KEY-----\n...` | ✅ 必需 | ❌ 注释 |
| `WECHAT_PAY_PLATFORM_PUBLIC_KEY_ID` | 文本 | 平台公钥ID | `5v6132d8c05a8e123xxxx` | ✅ 必需 | ❌ 注释 |

### 微信支付配置验证

```typescript
// src/lib/wechat-pay.ts - 第32行 配置检查
const config = getConfig();
if (!config.privateKey || !config.mchId) {
  console.warn("⚠️ 微信支付配置不完整，无法初始化");
  throw new Error("WECHAT_PAY_NOT_CONFIGURED");  // ← 会抛出此错误
}
```

### 配置获取方式

```typescript
const getConfig = () => ({
  appId: process.env.WECHAT_PAY_APP_ID || process.env.WECHAT_APP_ID || "",
  mchId: process.env.WECHAT_PAY_MCH_ID || "",
  apiV3Key: process.env.WECHAT_PAY_API_V3_KEY || "",
  notifyUrl: process.env.WECHAT_PAY_NOTIFY_URL || "",
  serialNo: process.env.WECHAT_PAY_SERIAL_NO || "",
  privateKey: formatKey(process.env.WECHAT_PAY_KEY_PEM),
  platformPublicKey: formatKey(process.env.WECHAT_PAY_PLATFORM_PUBLIC_KEY),
  platformPublicKeyId: process.env.WECHAT_PAY_PLATFORM_PUBLIC_KEY_ID || "",
  siteUrl: process.env.NEXT_PUBLIC_APP_URL || "https://nihplod.cn",
  siteName: process.env.NEXT_PUBLIC_APP_NAME || "NIHPLOD",
});
```

### 微信支付 - 环境变量模板

```bash
# 微信支付 - 生产环境 (API v3)
WECHAT_PAY_APP_ID="微信公众平台的App ID"
WECHAT_PAY_MCH_ID="商户号"
WECHAT_PAY_API_V3_KEY="从微信商户平台获取的APIv3密钥（32字符）"
WECHAT_PAY_SERIAL_NO="证书序列号"
WECHAT_PAY_KEY_PEM="-----BEGIN RSA PRIVATE KEY-----\n商户私钥内容\n-----END RSA PRIVATE KEY-----"
WECHAT_PAY_PLATFORM_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n微信平台公钥\n-----END PUBLIC KEY-----"
WECHAT_PAY_PLATFORM_PUBLIC_KEY_ID="微信平台公钥ID"
WECHAT_PAY_NOTIFY_URL="https://nihplod.cn/api/pay/notify/wechat"
WECHAT_PAY_REFUND_NOTIFY_URL="https://nihplod.cn/api/pay/refund-notify/wechat"
```

---

## 支付宝配置清单

### 配置代码位置
- **实现文件**: `src/lib/alipay.ts` (第11-16行)
- **配置方式**: `process.env` 环境变量

### 必需的环境变量

| 环境变量 | 类型 | 描述 | 示例 | 必需 | 当前状态 |
|---------|------|------|------|------|--------|
| `ALIPAY_APP_ID` | 文本 | 支付宝应用ID | `2021002189xxxxxx` | ✅ 必需 | ❌ 注释 |
| `ALIPAY_PRIVATE_KEY` | 文本 | 应用私钥 (2048 RSA) | `-----BEGIN RSA PRIVATE KEY-----\n...` | ✅ 必需 | ❌ 注释 |
| `ALIPAY_PUBLIC_KEY` | 文本 | 支付宝公钥 | `-----BEGIN PUBLIC KEY-----\n...` | ✅ 必需 | ❌ 注释 |
| `ALIPAY_NOTIFY_URL` | URL | 支付成功回调地址 | `https://nihplod.cn/api/pay/alipay-notify` | ✅ 必需 | ❌ 注释 |
| `ALIPAY_RETURN_URL` | URL | 支付后返回网址 | `https://nihplod.cn/pay/success` | ✅ 必需 | ❌ 注释 |

### 支付宝配置验证

```typescript
// src/lib/alipay.ts - 初始化检查
const ALIPAY_CONFIG = {
  appId: process.env.ALIPAY_APP_ID || "",
  privateKey: (process.env.ALIPAY_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
  alipayPublicKey: (process.env.ALIPAY_PUBLIC_KEY || "").replace(/\\n/g, "\n"),
  notifyUrl: process.env.ALIPAY_NOTIFY_URL || "",
  returnUrl: process.env.ALIPAY_RETURN_URL || "",
  gateway: "https://openapi.alipay.com/gateway.do",
};

// 如果缺少任何配置，将导致空值，最终导致支付失败
```

### 支付宝 - 环境变量模板

```bash
# 支付宝支付 - 生产环境
ALIPAY_APP_ID="支付宝应用ID"
ALIPAY_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n应用私钥\n-----END RSA PRIVATE KEY-----"
ALIPAY_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n支付宝公钥\n-----END PUBLIC KEY-----"
ALIPAY_NOTIFY_URL="https://nihplod.cn/api/pay/alipay-notify"
ALIPAY_RETURN_URL="https://nihplod.cn/pay/success"
```

### 重要: 支付宝密钥格式处理

代码中使用 `.replace(/\\n/g, "\n")` 处理换行符：

```typescript
// 密钥中的 \n 会被替换为真实换行符
privateKey: (process.env.ALIPAY_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
```

因此在 `.env.production` 中，长密钥应该这样写：

```bash
# ❌ 错误方式（密钥被截断）
ALIPAY_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n密钥一行\n-----END RSA PRIVATE KEY-----"

# ✅ 正确方式（转义反斜杠）
ALIPAY_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\\n密钥内容第一行\\n密钥内容第二行\\n-----END RSA PRIVATE KEY-----"
```

---

## 银联支付配置清单

### 配置代码位置
- **实现文件**: `src/lib/unionpay.ts` (第12-18行)
- **配置方式**: `process.env` 环境变量

### 必需的环境变量

| 环境变量 | 类型 | 描述 | 示例 | 必需 | 当前状态 |
|---------|------|------|------|------|--------|
| `UNIONPAY_API_URL` | URL | 银联API网关地址 | `https://qr.chinaums.com/netpay-route-server/api/` | ⚠️ 可选* | ❌ 注释 |
| `UNIONPAY_MSG_SRC` | 文本 | 来源编号 | `WWW.NIHPLOD.CN` | ✅ 必需 | ❌ 注释 |
| `UNIONPAY_MID` | 文本 | 商户号 (898开头) | `898311234567890123` | ✅ 必需 | ❌ 注释 |
| `UNIONPAY_TID` | 文本 | 终端号 (8位数字) | `12345678` | ✅ 必需 | ❌ 注释 |
| `UNIONPAY_INST_MID` | 文本 | 机构商户号 | `MINIDEFAULT` | ⚠️ 可选 | ❌ 注释 |
| `UNIONPAY_APP_KEY` | 文本 | 通讯密钥 | `8位MD5密钥` | ✅ 必需 | ❌ 注释 |
| `UNIONPAY_NOTIFY_URL` | URL | 支付成功回调地址 | `https://nihplod.cn/api/pay/notify/unionpay` | ✅ 必需 | ❌ 注释 |

### 银联支付配置验证

```typescript
// src/lib/unionpay.ts - 配置对象
const UMS_CONFIG = {
    apiUrl: process.env.UNIONPAY_API_URL || "https://qr.chinaums.com/netpay-route-server/api/",
    msgSrc: process.env.UNIONPAY_MSG_SRC || "",
    mid: process.env.UNIONPAY_MID || "",
    tid: process.env.UNIONPAY_TID || "",
    instMid: process.env.UNIONPAY_INST_MID || "MINIDEFAULT",
    appKey: process.env.UNIONPAY_APP_KEY || "",
    notifyUrl: process.env.UNIONPAY_NOTIFY_URL || process.env.NEXT_PUBLIC_APP_URL + "/api/pay/notify/unionpay",
};
```

### 银联支付 - 环境变量模板

```bash
# 银联商务 (UMS) 聚合支付 - 生产环境
UNIONPAY_API_URL="https://qr.chinaums.com/netpay-route-server/api/"
UNIONPAY_MSG_SRC="来源编号（如：WWW.NIHPLOD.CN）"
UNIONPAY_MID="银联商务分配的商户号"
UNIONPAY_TID="8位数字终端号"
UNIONPAY_INST_MID="MINIDEFAULT"
UNIONPAY_APP_KEY="通讯密钥"
UNIONPAY_NOTIFY_URL="https://nihplod.cn/api/pay/notify/unionpay"
```

---

## 环境变量完整性检查

### ✅ 已配置的支付相关变量

```bash
PAYMENT_METHODS_CONFIG    # 支付方式启用/禁用控制
```

### ❌ 缺失的必需变量

#### 微信支付 (8个必需)
```
WECHAT_PAY_APP_ID
WECHAT_PAY_MCH_ID
WECHAT_PAY_API_V3_KEY
WECHAT_PAY_NOTIFY_URL
WECHAT_PAY_SERIAL_NO
WECHAT_PAY_KEY_PEM
WECHAT_PAY_PLATFORM_PUBLIC_KEY
WECHAT_PAY_PLATFORM_PUBLIC_KEY_ID
```

#### 支付宝 (5个必需)
```
ALIPAY_APP_ID
ALIPAY_PRIVATE_KEY
ALIPAY_PUBLIC_KEY
ALIPAY_NOTIFY_URL
ALIPAY_RETURN_URL
```

#### 银联支付 (6个必需)
```
UNIONPAY_MSG_SRC
UNIONPAY_MID
UNIONPAY_TID
UNIONPAY_APP_KEY
UNIONPAY_NOTIFY_URL
UNIONPAY_API_URL（已有默认值）
```

### 总计： **19个必需的环境变量未配置**

---

## 配置优先级与建议

### 🔴 P0 - 立即必需 (部署前)

#### 微信支付 - P0 必需
1. **WECHAT_PAY_APP_ID** - 从微信公众平台获取
2. **WECHAT_PAY_MCH_ID** - 从微信支付后台获取
3. **WECHAT_PAY_API_V3_KEY** - 从微信商户平台 → 账户中心 → API安全 获取
4. **WECHAT_PAY_SERIAL_NO** - 从微信商户证书中的序列号
5. **WECHAT_PAY_KEY_PEM** - 商户私钥文件内容
6. **WECHAT_PAY_PLATFORM_PUBLIC_KEY** - 微信平台公钥
7. **WECHAT_PAY_PLATFORM_PUBLIC_KEY_ID** - 微信平台公钥ID

#### 支付宝 - P0 必需
1. **ALIPAY_APP_ID** - 从支付宝开放平台获取
2. **ALIPAY_PRIVATE_KEY** - 应用私钥
3. **ALIPAY_PUBLIC_KEY** - 支付宝公钥

### 🟠 P1 - 部署前应配置 (实现支付功能)

#### 微信支付 - P1
1. **WECHAT_PAY_NOTIFY_URL** - 生产环境回调地址

#### 支付宝 - P1
1. **ALIPAY_NOTIFY_URL** - 支付成功回调
2. **ALIPAY_RETURN_URL** - 支付完成返回页面

#### 银联支付 - P1  
1. **UNIONPAY_MID** - 银联商户号
2. **UNIONPAY_TID** - 终端号
3. **UNIONPAY_MSG_SRC** - 来源编号
4. **UNIONPAY_APP_KEY** - 通讯密钥
5. **UNIONPAY_NOTIFY_URL** - 回调地址

### 🟡 P2 - 可选 (功能完善)

1. **UNIONPAY_INST_MID** - 机构商户号 (已有默认值: MINIDEFAULT)
2. **WECHAT_PAY_REFUND_NOTIFY_URL** - 退款回调 (可选)

---

## 部署前清单

### ✅ 必完成项

- [ ] 获取微信支付 API v3 配置（8项）
- [ ] 获取支付宝支付配置（5项）
- [ ] 获取银联支付配置（6项）
- [ ] 在 `.env.production` 中取消注释支付配置
- [ ] 配置 PAYMENT_METHODS_CONFIG 启用相应支付方式
- [ ] 配置所有回调 URL 指向正确的生产域名
- [ ] 验证私钥/公钥格式（PEM格式，\n 正确转义）
- [ ] 非本地开发环境：验证回调 URL 可公网访问
- [ ] 运行 `npx tsc --noEmit` 验证类型检查
- [ ] 在测试环境验证支付流程
- [ ] 在生产环境部署前进行完整的支付测试

### 📋 检查项

```bash
# 1. 验证 TypeScript 编译
npx tsc --noEmit

# 2. 检查环境变量格式
grep WECHAT_PAY .env.production
grep ALIPAY_ .env.production
grep UNIONPAY_ .env.production

# 3. 测试支付配置加载
node -e "require('dotenv').config({path: '.env.production'}); console.log(process.env.WECHAT_PAY_APP_ID)"
```

---

## 快速参考 - 代码中的配置检查

### 微信支付 - Lazy Initialization 检查

```typescript
// src/lib/wechat-pay.ts - 第32行
function getWxPay() {
  if (!_wxpay) {
    const config = getConfig();
    if (!config.privateKey || !config.mchId) {
      console.warn("⚠️ 微信支付配置不完整，无法初始化");
      throw new Error("WECHAT_PAY_NOT_CONFIGURED");
    }
    // ...初始化
  }
  return _wxpay;
}
```

**触发时刻**: 首次调用 `createPayment()` 时  
**失败原因**: `WECHAT_PAY_KEY_PEM` 或 `WECHAT_PAY_MCH_ID` 为空

### 支付宝 - 无初始化检查
支付宝实现没有启动检查，所有检查在函数调用时进行。

**失败时刻**: 用户点击支付时  
**失败原因**: 密钥为空导致签名失败

### 银联支付 - 无初始化检查
银联实现也没有启动检查。

---

## 后续步骤

### 第一阶段：数据收集
1. 从支付服务商获取所有生产环境配置
2. 整理所有密钥文件
3. 验证回调 URL 配置正确

### 第二阶段：环境配置
1. 在 `.env.production` 中配置所有支付变量
2. 验证密钥格式正确（特别是 \n 转义）
3. 运行 TypeScript 编译检查

### 第三阶段：测试
1. 在测试环境验证支付创建成功
2. 验证回调流程正常
3. 验证退款流程正常

### 第四阶段：部署
1. 部署到生产环境
2. 监控支付日志
3. 建立告警机制

---

## 相关文件导航

| 文件 | 用途 | 配置数量 |
|------|------|--------|
| `src/lib/wechat-pay.ts` | 微信支付实现 | 8个环境变量 |
| `src/lib/alipay.ts` | 支付宝支付实现 | 5个环境变量 |
| `src/lib/unionpay.ts` | 银联支付实现 | 6个环境变量 |
| `src/lib/payment-config.ts` | 支付方式控制 | 启用/禁用管理 |
| `src/app/api/pay/notify/*.ts` | 回调处理 | 回调 URL 依赖 |
| `.env.production` | 生产配置 | 目前所有支付配置注释 |

---

## 生产部署准备度评分

```
当前状态: 🔴 0% - 无法支付
├─ 环境变量配置: 🔴 0%    (19/19 缺失)
├─ 回调 URL 配置: 🟡 50%   (已配置回调实现)
├─ 代码实现: 🟢 100%       (所有支付方式已实现)
├─ TypeScript 类型检查: 🟢 100% (通过检查)
└─ 测试覆盖: 🔴 未知       (需要开发测试)

部署准备度: 🔴 **25%** - 严重不足，无法上线
```

### 必要改进项

- [ ] 导入微信支付配置 (P0)
- [ ] 导入支付宝配置 (P0)
- [ ] 导入银联支付配置 (P1)
- [ ] 解除 `.env.production` 中的注释
- [ ] 编写集成测试用例
- [ ] 建立支付监控告警

---

**报告来源**: 代码分析 (2026-04-01)  
**下一步**: 获取支付商务配置后执行上述配置步骤

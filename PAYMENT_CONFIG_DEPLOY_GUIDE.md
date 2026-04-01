# 🚀 生产环境支付配置快速部署指南

> ⚠️ **关键发现**: 所有支付配置在 `.env.production` 中被注释掉，生产环境无法接收支付

---

## 📊 当前状态总览

| 项目 | 微信支付 | 支付宝 | 银联支付 | 总体 |
|------|--------|--------|--------|------|
| 代码实现 | ✅ 完成 | ✅ 完成 | ✅ 完成 | ✅ 完成 |
| 环境变量配置 | ❌ 注释 | ❌ 注释 | ❌ 注释 | ❌ **0/19** |
| 回调实现 | ✅ 完成 | ✅ 完成 | ✅ 完成 | ✅ 完成 |
| 部署准备度 | 🔴 0% | 🔴 0% | 🔴 0% | 🔴 **25%** |

**紧急程度**: 🔴 **CRITICAL** - 必须在部署前完成

---

## 🎯 三步快速配置

### 第一步：收集支付商务配置 (1小时)

#### 微信支付 - 需要收集 8 项
```
来源: 微信支付商户平台 (https://pay.weixin.qq.com/)

☐ WECHAT_PAY_APP_ID           → 账户中心 → 企业号 (wxXXXX)
☐ WECHAT_PAY_MCH_ID           → 账户中心 → 商户号 (1XXXXXXX)
☐ WECHAT_PAY_API_V3_KEY       → 账户中心 → API安全 → API v3 密钥 (32字符)
☐ WECHAT_PAY_SERIAL_NO        → 账户中心 → API安全 → 证书序列号
☐ WECHAT_PAY_KEY_PEM          → 下载 apiclient_key.pem 并读取内容
☐ WECHAT_PAY_PLATFORM_PUBLIC_KEY → 下载微信平台公钥
☐ WECHAT_PAY_PLATFORM_PUBLIC_KEY_ID → 公钥 ID
☐ WECHAT_PAY_NOTIFY_URL       → https://nihplod.cn/api/pay/notify/wechat
```

#### 支付宝 - 需要收集 5 项
```
来源: 支付宝开放平台 (https://open.alipay.com/)

☐ ALIPAY_APP_ID               → 我的应用 → 应用 ID (2021XXXXXXX)
☐ ALIPAY_PRIVATE_KEY          → 开发设置 → 密钥管理 → 应用私钥
☐ ALIPAY_PUBLIC_KEY           → 开发设置 → 密钥管理 → 支付宝公钥
☐ ALIPAY_NOTIFY_URL           → https://nihplod.cn/api/pay/alipay-notify
☐ ALIPAY_RETURN_URL           → https://nihplod.cn/pay/success
```

#### 银联支付 - 需要收集 6 项 (可选)
```
来源: 银联商务 (https://www.chinaums.com/)

☐ UNIONPAY_MID                → 银联分配的商户号 (898XXXX)
☐ UNIONPAY_TID                → 银联分配的终端号 (8位数字)
☐ UNIONPAY_MSG_SRC            → 来源编号 (如 WWW.NIHPLOD.CN)
☐ UNIONPAY_APP_KEY            → 通讯密钥
☐ UNIONPAY_API_URL            → https://qr.chinaums.com/netpay-route-server/api/
☐ UNIONPAY_NOTIFY_URL         → https://nihplod.cn/api/pay/notify/unionpay
```

### 第二步：配置环境文件 (30分钟)

#### 方式 A: 自动配置脚本 (推荐)
```bash
# 使用提供的模板创建配置
cp .env.production.payment-template payment-config.env

# 编辑配置文件，填入实际的商务参数
nano payment-config.env

# 验证格式
npx tsc --noEmit
```

#### 方式 B: 手动编辑
1. 打开 `.env.production`
2. 找到第 7 部分"支付配置"
3. 取消注释所有支付相关行
4. 替换占位符为实际的商务配置
5. **重要**: 密钥中的 `\n` 需要转义为 `\\n`

#### 密钥格式处理 - 必须正确！

❌ **错误示例** (密钥被截断):
```bash
WECHAT_PAY_KEY_PEM="-----BEGIN RSA PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDCM3t8o
-----END RSA PRIVATE KEY-----"
```

✅ **正确示例** (转义换行符):
```bash
WECHAT_PAY_KEY_PEM="-----BEGIN RSA PRIVATE KEY-----\\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDCM3t8o\\n-----END RSA PRIVATE KEY-----"
```

### 第三步：验证并部署 (30分钟)

#### 1. 验证 TypeScript 编译
```bash
cd /path/to/nihplod.cn\ -\ master
npx tsc --noEmit
```
**预期**: 无错误输出

#### 2. 验证环境变量加载
```bash
node -e "
require('dotenv').config({path: '.env.production'});
console.log('✓ WECHAT_PAY_APP_ID:', process.env.WECHAT_PAY_APP_ID ? '已配置' : '❌ 未配置');
console.log('✓ ALIPAY_APP_ID:', process.env.ALIPAY_APP_ID ? '已配置' : '❌ 未配置');
console.log('✓ 支付方式配置:', process.env.PAYMENT_METHODS_CONFIG);
"
```
**预期**: 显示已配置的应用 ID

#### 3. 下载支付配置核对表
- 打开 `PAYMENT_CONFIG_AUDIT.md`
- 遵循 "部署前清单" 部分的所有项目
- 逐一勾选完成

#### 4. 在测试环境验证支付
```bash
# 启动测试服务器
npm run dev

# 测试微信支付流程
# 1. 创建订单
# 2. 选择微信支付
# 3. 验证能够获得支付 code_url 或 prepay_id
```

#### 5. 部署到生产
```bash
# 确保所有检查都通过
npm run build

# 部署到生产环境
# (使用你现有的部署流程)
```

---

## 📋 配置清单 - 按优先级排列

### 🔴 P0 - 立即必需 (部署前必须完成)

**微信支付**
- [ ] WECHAT_PAY_APP_ID - 必需
- [ ] WECHAT_PAY_MCH_ID - 必需
- [ ] WECHAT_PAY_API_V3_KEY - 必需
- [ ] WECHAT_PAY_KEY_PEM - 必需 (正确转义)
- [ ] WECHAT_PAY_PLATFORM_PUBLIC_KEY - 必需
- [ ] WECHAT_PAY_SERIAL_NO - 必需
- [ ] WECHAT_PAY_PLATFORM_PUBLIC_KEY_ID - 必需

**支付宝**
- [ ] ALIPAY_APP_ID - 必需
- [ ] ALIPAY_PRIVATE_KEY - 必需 (正确转义)
- [ ] ALIPAY_PUBLIC_KEY - 必需

### 🟠 P1 - 部门启用功能 (部署前应完成)

**微信支付**
- [ ] WECHAT_PAY_NOTIFY_URL - 设为生产 URL

**支付宝**
- [ ] ALIPAY_NOTIFY_URL - 设为生产 URL
- [ ] ALIPAY_RETURN_URL - 设为生产 URL

**银联支付** (可选)
- [ ] UNIONPAY_MID - 必需 (如启用)
- [ ] UNIONPAY_TID - 必需 (如启用)
- [ ] UNIONPAY_MSG_SRC - 必需 (如启用)
- [ ] UNIONPAY_APP_KEY - 必需 (如启用)
- [ ] UNIONPAY_NOTIFY_URL - 必需 (如启用)

### 🟡 P2 - 功能完善 (可以延后)

- [ ] 编写支付集成测试
- [ ] 设置 Sentry/监控告警
- [ ] 文档化支付对账流程
- [ ] 实现支付重试逻辑 (已有代码实现)

---

## ⚠️ 常见错误与解决

### 问题 1: "WECHAT_PAY_NOT_CONFIGURED" 错误

```
错误: WECHAT_PAY_NOT_CONFIGURED
原因: WECHAT_PAY_KEY_PEM 或 WECHAT_PAY_MCH_ID 为空
```

**解决方案**:
1. 检查 `.env.production` 是否正确加载
2. 验证密钥是否正确转义 (`\n` → `\\n`)
3. 检查密钥是否包含 `BEGIN RSA PRIVATE KEY` 头尾

### 问题 2: 支付宝签名验证失败

```
错误: [Alipay] 签名验证失败
原因: ALIPAY_PRIVATE_KEY 或 ALIPAY_PUBLIC_KEY 格式错误
```

**解决方案**:
1. 验证密钥格式是否为 PEM
2. 确保密钥中的 `\n` 转义正确
3. 检查公钥是否来自支付宝官方平台

### 问题 3: 回调 URL 无法访问

```
状态: 支付成功但订单状态未更新
原因: 回调 URL 不可公网访问或域名错误
```

**解决方案**:
1. 验证 `WECHAT_PAY_NOTIFY_URL` 等回调 URL 指向生产域名
2. 确保防火墙允许第三方服务访问
3. 检查 `/api/pay/notify/*` 路由是否正确处理

### 问题 4: 环境变量包含特殊字符

```
症状: 支付接口返回参数错误
原因: 密钥中的 + / = 等特殊字符未正确处理
```

**解决方案**:
1. 确保在 `.env.production` 中用引号包裹长密钥
2. 验证密钥内容没有被截断或修改
3. 使用配置模板中的格式

---

## 📞 获取商务配置的详细步骤

### 微信支付配置获取

1. **登录微信商户平台**
   ```
   https://pay.weixin.qq.com/
   用户名: 企业微信或管理员账号
   ```

2. **获取 App ID**
   - 路径: 账户中心 → 企业号
   - 查找格式为 `wx` 开头的字符串

3. **获取商户号和 API v3 密钥**
   - 路径: 账户中心 → API安全
   - 页面项目:
     - 商户号 (WECHAT_PAY_MCH_ID)
     - API v3 密钥 (WECHAT_PAY_API_V3_KEY)
     - 证书序列号 (WECHAT_PAY_SERIAL_NO)

4. **下载证书**
   - 路径: 账户中心 → API安全 → 证书
   - 下载文件: `apiclient_key.pem` (私钥)
   - 获取微信平台公钥

5. **处理证书内容**
   ```bash
   # 查看私钥内容
   cat apiclient_key.pem
   
   # 复制 BEGIN 到 END 之间的所有内容
   # 在 .env.production 中用 \\n 替换所有换行符
   ```

### 支付宝配置获取

1. **登录支付宝开放平台**
   ```
   https://open.alipay.com/
   用户名: 企业支付宝账号
   ```

2. **创建或查看应用**
   - 路径: 我的应用 → 应用列表
   - 点击应用名称进入详情

3. **获取 App ID**
   - 在应用详情页面顶部显示
   - 格式: `2021` 开头的数字

4. **生成/查看密钥**
   - 路径: 开发设置 → 密钥管理
   - 选项:
     - 生成应用私钥和应用公钥 (首次需生成)
     - 从支付宝获取支付宝公钥

5. **处理密钥内容**
   ```bash
   # 复制生成的私钥和公钥
   # 在 .env.production 中用 \\n 替换所有换行符
   ```

### 银联支付配置获取 (可选)

1. **联系银联商务销售**
   - 申请聚合支付服务
   - 获取商户号和终端号

2. **获取配置参数**
   - 商户号 (MID): 通常以 898 开头
   - 终端号 (TID): 8 位数字
   - 通讯密钥 (APP_KEY): 来自银联管理后台

---

## 🔗 相关文件导航

| 文件 | 用途 | 需修改 |
|------|------|-------|
| `.env.production` | 生产配置 | ✅ **需要** |
| `.env.production.payment-template` | 配置模板 | 参考 |
| `PAYMENT_CONFIG_AUDIT.md` | 完整审计报告 | 参考 |
| `src/lib/wechat-pay.ts` | 微信支付实现 | ❌ 无需 |
| `src/lib/alipay.ts` | 支付宝实现 | ❌ 无需 |
| `src/lib/unionpay.ts` | 银联支付实现 | ❌ 无需 |

---

## ✅ 部署前最终检查

在部署到生产环境前，请完成以下检查:

```bash
# 1. 验证配置已提供
grep -c "WECHAT_PAY_APP_ID=" .env.production
grep -c "ALIPAY_APP_ID=" .env.production
grep -c "PAYMENT_METHODS_CONFIG=" .env.production

# 2. 验证密钥格式
grep "WECHAT_PAY_KEY_PEM=" .env.production | grep -q "\\\\n" && echo "✓ 微信密钥格式正确" || echo "✗ 微信密钥格式错误"

# 3. 验证 TypeScript 编译
npx tsc --noEmit && echo "✓ TypeScript 编译通过" || echo "✗ 编译失败"

# 4. 验证环境变量加载
node -e "require('dotenv').config({path: '.env.production'}); console.log(process.env.WECHAT_PAY_APP_ID ? '✓' : '✗')"

# 5. 检查所有回调 URL
grep "NOTIFY_URL=" .env.production
grep "RETURN_URL=" .env.production
```

---

## 🚀 部署步骤

1. **验证所有配置完整** ✅
2. **在测试环境验证支付流程** ✅
3. **确认无 TypeScript 错误** ✅
4. **部署代码** ✅
5. **监控生产日志** ✅
6. **验收支付功能** ✅

**预期**: 用户能够选择支付方式 → 完成支付 → 订单状态自动更新

---

## 📞 需要帮助?

如果遇到问题，请:

1. 检查 `PAYMENT_CONFIG_AUDIT.md` 中的完整配置清单
2. 查看本指南中的"常见错误"部分
3. 验证环境变量格式和内容
4. 检查生产环境日志中的支付错误消息

---

**最后更新**: 2026-04-01  
**文档位置**: `PAYMENT_CONFIG_DEPLOY_GUIDE.md`  
**关键词**: #支付配置 #生产部署 #微信支付 #支付宝支付

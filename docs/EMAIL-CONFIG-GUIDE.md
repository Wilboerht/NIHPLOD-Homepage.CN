# 📧 邮件服务配置完整指南（中国大陆版）

## 目录
1. [方案选择](#方案选择)
2. [QQ邮箱SMTP配置（推荐）](#qq邮箱smtp配置推荐)
3. [环境变量配置](#环境变量配置)
4. [DNS记录配置](#dns记录配置)
5. [验证测试](#验证测试)
6. [常见问题](#常见问题)

---

## 方案选择

### 🥇 推荐方案：QQ邮箱 SMTP

| 项目 | 说明 |
|------|------|
| **服务商** | 腾讯QQ邮箱 |
| **SMTP服务器** | `smtp.qq.com` |
| **端口** | 465 (SSL) |
| **免费额度** | 无限制（个人邮箱即可） |
| **配置难度** | ⭐⭐（非常简单） |
| **适用场景** | 所有阶段 |

---

## QQ邮箱SMTP配置（推荐）

### 第一步：准备邮箱

#### 方案A：使用个人QQ邮箱（快速测试）

1. **注册新QQ号**（建议）  
   - 如果已有QQ号可跳过  
   - 新注册一个专门用于业务的邮箱  
   - 例如：`nihplod.service@qq.com`

2. **登录QQ邮箱**  
   - 访问：https://mail.qq.com
   - 使用新QQ号登录

3. **开启SMTP服务**  
   - 点击顶部菜单 **"设置"**  
   - 选择 **"账户"**  
   - 向下滚动找到 **"POP3/IMAP/SMTP服务"**  
   - 点击 **"开启"**  
   - 发送短信验证（按提示操作）  
   - **记下生成的授权码**（类似：`abcd efgh ijkl mnop`）

#### 方案B：使用企业邮箱（生产推荐）

1. **注册腾讯企业邮**  
   - 访问：https://exmail.qq.com  
   - 点击 **"免费注册"**  
   - 填写企业信息  
   - 验证域名所有权（通过DNS记录）

2. **创建邮箱账号**  
   - 例如：`noreply@nihplod.cn`  
   - 设置密码

3. **开启SMTP服务**  
   - 登录企业邮管理后台  
   - 进入 **"邮箱设置" → "POP3/IMAP/SMTP"**  
   - 开启SMTP服务  
   - 获取SMTP授权码

---

### 第二步：配置环境变量

找到项目根目录的 `.env.local` 文件（如果没有，从 `.env.example` 复制一个）：

```bash
# 复制 .env.example 为 .env.local
cp .env.example .env.local
```

然后编辑 `.env.local`，修改邮件配置部分：

```env
# ----- 邮件配置 (SMTP) -----
# 使用 QQ邮箱 SMTP（推荐中国大陆）
SMTP_HOST=smtp.qq.com
SMTP_PORT=465
SMTP_USER=你的QQ邮箱@qq.com          # 替换为你的QQ邮箱
SMTP_PASSWORD=你的SMTP授权码         # 替换为授权码（去掉空格）
SMTP_FROM=noreply@nihplod.cn
SMTP_FROM_NAME=NIHPLOD 旎柏
NOTIFICATION_EMAIL=admin@nihplod.cn  # 管理员接收通知的邮箱
```

**重要提示**：
- `SMTP_PASSWORD` 填写授权码时 **去掉空格**
- 如果使用企业邮，`SMTP_HOST` 改为 `smtp.exmail.qq.com`
- `SMTP_PORT` 保持为 `465`（SSL加密）

---

### 第三步：配置DNS记录（SPF）

防止邮件被标记为垃圾邮件！

#### 在您的域名DNS管理后台添加记录：

**腾讯云DNSPod**：
1. 登录：https://dnspod.cloud.tencent.com
2. 找到您的域名 `nihplod.cn`
3. 点击 **"解析"** → **"添加记录"**
4. 填写：

| 字段 | 值 |
|------|-----|
| 记录类型 | TXT |
| 主机记录 | @ |
| 记录值 | `v=spf1 include:_spf.qq.com -all` |
| TTL | 10分钟 |

**阿里云DNS**：
1. 登录：https://dns.aliyun.com
2. 找到您的域名
3. 点击 **"解析配置"** → **"添加解析"**
4. 填写相同信息

**CloudFlare**：
1. 登录：https://dash.cloudflare.com
2. 找到您的域名
3. 进入 **"DNS"** → **"添加记录"**
4. 填写相同信息

#### 验证SPF记录是否生效：

```bash
# Windows PowerShell
nslookup -type=txt nihplod.cn

# 或使用在线工具
# https://mxtoolbox.com/spf.aspx
```

预期返回：
```
v=spf1 include:_spf.qq.com -all
```

---

### 第四步：配置DKIM（可选但推荐）

DKIM进一步提高邮件送达率，防止被标记为垃圾邮件。

#### 在QQ邮箱管理后台配置：

1. **登录QQ邮箱** → **"设置"** → **"账户"** → **"域名管理"**
2. 点击 **"添加域名"**
3. 输入您的域名：`nihplod.cn`
4. 按提示添加CNAME记录：

| 记录类型 | 主机记录 | 记录值 |
|---------|---------|-------|
| CNAME | qiji._domainkey | qiji._domainkey.exmail.qq.com |

5. 等待DNS生效（5-10分钟）
6. 在QQ邮箱后台点击 **"验证"**

#### 验证DKIM是否生效：

```bash
nslookup -type=txt qiji._domainkey.nihplod.cn
```

---

## 验证测试

### 测试邮件配置

项目已提供验证脚本，运行以下命令：

```bash
# 使用 npx 运行
npx tsx scripts/verify-email-config.ts

# 或使用 ts-node（如果安装了）
npx ts-node scripts/verify-email-config.ts
```

**预期输出**：
```
📧 开始验证邮件服务配置...

SMTP服务器: smtp.qq.com:465
发件人: nihplod.service@qq.com

⏳ 正在验证SMTP connection...
✅ SMTP 连接验证成功！

📝 正在发送测试邮件...
✅ 测试邮件发送成功！
送达时间: 2026-3-11 14:30:00
邮件ID: <xxxxx@smtp.qq.com>

📧 请检查 nihplod.service@qq.com 邮箱查收测试邮件
```

### 检查收件箱

1. 登录您配置的邮箱（如：`nihplod.service@qq.com`）
2. 检查 **"收件箱"**
3. 如果没有收到，检查 **"垃圾邮件"** 文件夹
4. 确认邮件内容包含测试信息

---

## 常见问题

### ❌ 1. 认证失败 (AUTHENTICATION_ERROR)

**错误信息**：
```
AUTHENTICATION_ERROR: Invalid login credentials
```

**解决方法**：
1. 检查 `SMTP_USER` 是否是正确的QQ邮箱地址
2. 检查 `SMTP_PASSWORD` 是否是 **授权码**（不是登录密码）
3. 确认授权码没有空格
4. 确认QQ邮箱已开启SMTP服务
5. 重新生成授权码并更新配置

---

### ❌ 2. 连接超时 (ETIMEDOUT)

**错误信息**：
```
ETIMEDOUT: Connection timed out
```

**解决方法**：
1. 检查服务器网络是否正常
2. 确认服务器可以访问 `smtp.qq.com`：
   ```bash
   ping smtp.qq.com
   telnet smtp.qq.com 465
   ```
3. 检查服务器防火墙是否放行 **465端口**
4. 如果使用云服务器（阿里云/腾讯云），检查 **安全组** 设置

---

### ❌ 3. 发件人错误 (EMailable)

**错误信息**：
```
501 mail from address must be same as authorization user
```

**解决方法**：
1. `SMTP_FROM` 地址必须与 `SMTP_USER` 在同一域名
2. 例如：如果 `SMTP_USER` 是 `xxx@qq.com`，则 `SMTP_FROM` 可以是 `service@nihplod.cn`
3. 如果使用企业邮，两者都可以是 `@nihplod.cn`

---

### ❌ 4. 邮件被标记为垃圾邮件

**原因**：
- 未配置SPF记录
- 未配置DKIM记录
- 邮件内容包含spam关键词

**解决方法**：
1. ✅ 配置SPF记录（必须）
2. ✅ 配置DKIM记录（推荐）
3. 避免使用"免费"、"优惠"、"促销"等敏感词
4. 使用HTML格式发送邮件（已配置）

---

### ❌ 5. 域名验证失败

**原因**：
- DNS记录未生效
- 记录值填写错误

**解决方法**：
1. 等待DNS生效（5-10分钟，最多24小时）
2. 使用 `nslookup` 验证记录：
   ```bash
   nslookup -type=txt nihplod.cn
   ```
3. 确认记录值完全正确（包括引号）

---

## 配置检查清单

- [ ] 1. 注册QQ邮箱或企业邮
- [ ] 2. 开启SMTP服务并获取授权码
- [ ] 3. 配置 `.env.local` 环境变量
- [ ] 4. 添加SPF DNS记录
- [ ] 5. （可选）添加DKIM DNS记录
- [ ] 6. 运行验证脚本 `npx tsx scripts/verify-email-config.ts`
- [ ] 7. 检查收件箱确认收到测试邮件

---

## 完整配置示例

### .env.local（QQ邮箱版）
```env
# 邮件配置 (QQ邮箱 SMTP)
SMTP_HOST=smtp.qq.com
SMTP_PORT=465
SMTP_USER=nihplod.service@qq.com
SMTP_PASSWORD=abcdefg123456789  # 示例，实际为授权码
SMTP_FROM=noreply@nihplod.cn
SMTP_FROM_NAME=NIHPLOD 旎柏
NOTIFICATION_EMAIL=admin@nihplod.cn
```

### .env.production（企业邮版）
```env
# 邮件配置 (腾讯企业邮 SMTP)
SMTP_HOST=smtp.exmail.qq.com
SMTP_PORT=465
SMTP_USER=noreply@nihplod.cn
SMTP_PASSWORD=your-smtp-password
SMTP_FROM=noreply@nihplod.cn
SMTP_FROM_NAME=NIHPLOD 旎柏
NOTIFICATION_EMAIL=admin@nihplod.cn
```

---

## 需要帮助？

如果遇到问题，请提供：
1. 完整的错误信息
2. `.env.local` 中的相关配置（隐藏敏感信息）
3. DNS记录截图
4. 验证脚本的输出

---

## 相关链接

- QQ邮箱设置：https://mail.qq.com
- 腾讯企业邮：https://exmail.qq.com
- SPF验证工具：https://mxtoolbox.com/spf.aspx
- DNS查询：https://dnschecker.org/

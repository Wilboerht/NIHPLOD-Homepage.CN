# 嵌入式用户中心 postMessage 通信协议

NIHPLOD SSO 嵌入式用户中心 (`/account/embed`) 通过 `postMessage` 与父窗口（子项目）进行通信。

## 使用方式

在子项目页面中使用 `<iframe>` 嵌入：

```html
<iframe
  src="https://nihplod.cn/account/embed"
  width="100%"
  height="600"
  allow="publickey-credentials-get"
  style="border: none;"
></iframe>
```

## 通信协议

所有消息通过 `window.postMessage(message, targetOrigin)` 发送，方向为 **iframe → 父窗口**。

### 1. NIHPLOD_SSO_READY

iframe 加载完成时触发。

**Payload:**
```json
{
  "type": "NIHPLOD_SSO_READY"
}
```

**父窗口处理示例:**
```javascript
window.addEventListener("message", (event) => {
  if (event.origin !== "https://nihplod.cn") return;
  if (event.data?.type === "NIHPLOD_SSO_READY") {
    console.log("SSO 用户中心已加载");
  }
});
```

---

### 2. NIHPLOD_SSO_LOGOUT

用户在嵌入页面中执行登出时触发。

**Payload:**
```json
{
  "type": "NIHPLOD_SSO_LOGOUT"
}
```

**父窗口处理示例:**
```javascript
window.addEventListener("message", (event) => {
  if (event.origin !== "https://nihplod.cn") return;
  if (event.data?.type === "NIHPLOD_SSO_LOGOUT") {
    // 清除子项目本地登录状态
    localStorage.removeItem("token");
    window.location.href = "/login";
  }
});
```

---

### 3. NIHPLOD_SSO_REVOKE

用户撤销对子项目的授权时触发。

**Payload:**
```json
{
  "type": "NIHPLOD_SSO_REVOKE",
  "clientId": "your-client-id"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `type` | `string` | 固定为 `"NIHPLOD_SSO_REVOKE"` |
| `clientId` | `string` | 被撤销授权的 OAuth Client ID |

**父窗口处理示例:**
```javascript
window.addEventListener("message", (event) => {
  if (event.origin !== "https://nihplod.cn") return;
  if (event.data?.type === "NIHPLOD_SSO_REVOKE") {
    // 用户已撤销授权，清理本地状态
    localStorage.removeItem("token");
    alert("授权已撤销，请重新登录");
    window.location.href = "/login";
  }
});
```

---

## 安全说明

- **Origin 校验**: 父窗口必须校验 `event.origin === "https://nihplod.cn"`，防止恶意 iframe 伪造消息。
- **targetOrigin**: 嵌入页面从 `document.referrer` 推导父窗口 origin 作为 `postMessage` 的 `targetOrigin`，确保消息只送达实际嵌入的父窗口。可通过环境变量 `NEXT_PUBLIC_EMBED_ALLOWED_ORIGINS`（逗号分隔的 origin 列表）配置白名单；配置后父窗口 origin 不在白名单内时不发送消息并输出 `console.warn`。注意：服务端还需配套设置 `EMBED_ALLOWED_ORIGINS`，使 `/account/embed` 的 CSP `frame-ancestors` 放行对应父窗口源。
- **CSRF 防护**: 所有写操作（登出、撤销授权）均通过 CSRF Token（`X-CSRF-Token` header）进行服务端校验。

# URL 规范化与收录运维清单

本文档记录需要在**网关层（Nginx / 负载均衡 / CDN）**完成的 SEO 配置，应用代码不做处理。

## 1. http → https 与 www → apex 的 301 重定向

现状（实测）：
- `http://nihplod.cn` 直接 200 返回整站
- `https://www.nihplod.cn` 直接 200 返回整站（canonical 已指向 `https://nihplod.cn`，但没有跳转）

影响：同一内容存在多个可访问 URL，链接权重分散；HSTS preload 要求站点在 http 上返回 301 跳转。

### Nginx 参考配置

```nginx
# HTTP：统一 301 到 https 正式域名
server {
    listen 80;
    listen [::]:80;
    server_name nihplod.cn www.nihplod.cn;
    return 301 https://nihplod.cn$request_uri;
}

# HTTPS www：统一 301 到 apex
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name www.nihplod.cn;

    # 证书配置沿用现有证书
    ssl_certificate     /path/to/nihplod.cn.pem;
    ssl_certificate_key /path/to/nihplod.cn.key;

    return 301 https://nihplod.cn$request_uri;
}
```

若使用阿里云 CDN / SLB，则在控制台配置「强制 HTTPS 跳转」+「泛域名或 www 回源重定向」。

### 验证命令

```bash
curl -sI http://nihplod.cn/            | head -n 5   # 期望 HTTP/1.1 301 + Location: https://nihplod.cn/
curl -sI https://www.nihplod.cn/       | head -n 5   # 期望 HTTP/1.1 301 + Location: https://nihplod.cn/
curl -sI https://nihplod.cn/           | head -n 5   # 期望 200
```

## 2. 已知性能债务（仅记录，暂不处理）

由于 CSP 采用 per-request nonce，页面服务端组件通过 `headers()` 读取 nonce，导致所有前台页面退化为**动态 SSR**（构建清单中仅 `robots.txt`、`sitemap.xml` 被预渲染），`revalidate` 的 ISR 缓存对页面不生效。

- 现状可接受：内容始终最新，无收录硬伤；代价是每请求回源与 TTFB 偏高
- 后续可选方案：采用 Next.js PPR（`cacheComponents`）将 nonce 读取限制在动态边界，或对 JSON-LD 改用构建期 CSP hash
- 决策前建议先做 TTFB / 并发压测

## 3. 搜索引擎主动推送配置

- 百度：`BAIDU_PUSH_TOKEN`（百度站长平台 → 数据引入 → 链接提交）
- IndexNow（Bing / Yandex）：`INDEXNOW_KEY`，必须与 `public/<key>.txt` 文件名和内容一致（仓库内置 `68c266ab0b3701b13135730d0ab10f2f`）
- 提交入口：
  - admin 产品/职位/分类增删改后自动推送
  - 定时全量：`POST /api/baidu/push`（`Authorization: Bearer <CRON_SECRET>`），同时提交百度与 IndexNow

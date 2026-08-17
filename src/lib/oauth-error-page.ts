/**
 * OAuth 授权失败的品牌化 HTML 错误页
 *
 * 当无法 302 回传错误到 redirect_uri 时（client_id/redirect_uri 无法识别、限流、500），
 * 浏览器直接访问（Accept 含 text/html）渲染品牌化中文错误页；API 调用仍返回 JSON。
 * 页面不提供任何外部跳转（仅返回首页按钮），避免引入 open redirect。
 */
import { NextRequest, NextResponse } from "next/server";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** 渲染品牌化错误页 HTML（项目风格：米色背景 + 炭灰文字） */
export function renderOAuthErrorPage(error: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>授权失败 - NIHPLOD</title>
<style>
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
         background: #F8F7F3; font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
         color: #00263E; }
  .card { max-width: 420px; width: calc(100% - 48px); background: #fff; border-radius: 16px;
          padding: 48px 32px; text-align: center; box-shadow: 0 8px 30px rgba(0, 38, 62, 0.08); }
  h1 { margin: 0 0 12px; font-size: 20px; font-weight: 500; letter-spacing: 0.1em; }
  p { margin: 0 0 8px; font-size: 14px; line-height: 1.8; color: rgba(0, 38, 62, 0.65); }
  .code { margin-top: 16px; font-size: 12px; color: rgba(0, 38, 62, 0.35); }
  .code code { background: rgba(0, 38, 62, 0.06); border-radius: 4px; padding: 2px 6px; }
  a.btn { display: inline-block; margin-top: 28px; padding: 12px 40px; background: #00263E;
          color: #fff; text-decoration: none; font-size: 14px; letter-spacing: 0.12em;
          border-radius: 2px; }
  a.btn:hover { background: rgba(0, 38, 62, 0.9); }
</style>
</head>
<body>
  <div class="card">
    <h1>授权失败</h1>
    <p>应用配置有误或链接已失效。</p>
    <p>请返回应用重新发起登录，或联系应用提供方确认配置。</p>
    <p class="code">错误码（反馈问题时请附上）：<code>${escapeHtml(error)}</code></p>
    <a class="btn" href="/">返回首页</a>
  </div>
</body>
</html>`;
}

/**
 * 按请求方类型返回错误响应：
 * - 浏览器（Accept 含 text/html）：品牌化 HTML 错误页
 * - API 调用：OAuth 2.0 规范 JSON 错误
 */
export function respondOAuthError(
  request: NextRequest,
  status: number,
  error: string,
  errorDescription: string
): NextResponse {
  const accept = request.headers.get("accept") || "";
  if (accept.includes("text/html")) {
    return new NextResponse(renderOAuthErrorPage(error), {
      status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }
  return NextResponse.json({ error, error_description: errorDescription }, { status });
}

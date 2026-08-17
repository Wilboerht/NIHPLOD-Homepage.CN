import { cookies } from "next/headers";
import { DEFAULT_ACCESS_TOKEN_COOKIE_NAME, toInsecureCookieName } from "@nihplod/sso-sdk/next";

/**
 * Next.js 首页 — Middleware 接入方式（推荐）
 *
 * 本示例统一使用 Middleware + Route Handler 的 BFF 模式：
 * - token 存储在 httpOnly Cookie 中，浏览器 JS 无法读取，客户端不使用 SsoClient
 * - 未登录时点击“登录”会访问受保护路径 /dashboard，
 *   Middleware（src/middleware.ts）自动重定向到 SSO 授权页
 * - 授权成功后由 /api/auth/callback 写 Cookie 并跳回 /dashboard
 *
 * 注意：客户端 SsoClient.login() 与 Middleware 方式互斥——
 * 前者把 PKCE state 存在浏览器 sessionStorage，后者存在 httpOnly Cookie，
 * 混用会导致回调校验失败。Next.js 项目请只使用 Middleware 方式。
 */
export const dynamic = "force-dynamic";

// 本地 HTTP 开发（insecureLocalDev）下 Cookie 名称会去除 __Host- 前缀
const isHttpLocalDev = (process.env.SSO_REDIRECT_URI || "").startsWith("http://");
const ACCESS_TOKEN_COOKIE = isHttpLocalDev
  ? toInsecureCookieName(DEFAULT_ACCESS_TOKEN_COOKIE_NAME)
  : DEFAULT_ACCESS_TOKEN_COOKIE_NAME;

export default async function Home() {
  const cookieStore = await cookies();
  const isAuthenticated = Boolean(
    cookieStore.get(ACCESS_TOKEN_COOKIE)?.value
  );

  return (
    <div style={styles.container}>
      <h1>Next.js SSO 接入示例</h1>
      {isAuthenticated ? (
        <div style={styles.card}>
          <p>已登录（token 在 httpOnly Cookie 中，JS 不可读取）</p>
          <div style={styles.buttons}>
            <a href="/dashboard" style={styles.btnPrimary}>
              进入控制台
            </a>
            {/* 使用 POST 触发登出，避免 GET 被跨站预取/图片请求触发（CSRF） */}
            <form action="/api/auth/logout" method="post">
              <button type="submit" style={styles.btnDanger}>
                退出登录
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div style={styles.card}>
          <p>未登录</p>
          {/* /dashboard 受 Middleware 保护，未登录访问会自动跳转 SSO 登录页 */}
          <a href="/dashboard" style={styles.btnPrimary}>
            使用 NIHPLOD 账号登录
          </a>
        </div>
      )}
      <div style={styles.info}>
        <p>本示例使用 Middleware 方式接入 SSO：</p>
        <ol>
          <li>访问受保护路径时未登录 → Middleware 自动跳转 SSO 授权页（PKCE + state 存 httpOnly Cookie）</li>
          <li>授权成功 → /api/auth/callback 交换 token 并写入 httpOnly Cookie → 跳回原页面</li>
          <li>退出登录 → POST /api/auth/logout 撤销 refresh_token、清除 Cookie 并跳转 SSO 中心登出</li>
        </ol>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    fontFamily: "system-ui, sans-serif",
    gap: "1rem",
    padding: "2rem",
  },
  card: {
    backgroundColor: "#f3f4f6",
    padding: "2rem",
    borderRadius: "12px",
    textAlign: "center",
    minWidth: 320,
  },
  buttons: { display: "flex", gap: "0.75rem", justifyContent: "center", marginTop: "1rem" },
  btnPrimary: {
    padding: "10px 20px",
    backgroundColor: "#2563eb",
    color: "white",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    textDecoration: "none",
    fontSize: "14px",
    display: "inline-block",
    marginTop: "0.75rem",
  },
  btnDanger: {
    padding: "10px 20px",
    backgroundColor: "#ef4444",
    color: "white",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "14px",
  },
  info: {
    marginTop: "2rem",
    color: "#666",
    maxWidth: 500,
    lineHeight: 1.8,
  },
};

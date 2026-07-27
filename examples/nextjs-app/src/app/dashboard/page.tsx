/**
 * Dashboard 页面 — 受 Middleware 保护
 *
 * 未登录访问此页面时，Middleware 自动重定向到 SSO 登录页。
 */
export default function DashboardPage() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        fontFamily: "system-ui, sans-serif",
        gap: "1rem",
        padding: "2rem",
      }}
    >
      <h1>控制台</h1>
      <div
        style={{
          backgroundColor: "#f0fdf4",
          border: "1px solid #86efac",
          borderRadius: "12px",
          padding: "2rem",
          textAlign: "center",
          maxWidth: 400,
        }}
      >
        <p style={{ color: "#166534", marginBottom: "0.5rem" }}>
          ✅ 登录成功！你正在访问受 Middleware 保护的页面。
        </p>
        <p style={{ color: "#166534", fontSize: "14px" }}>
          token 已通过 httpOnly cookie 存储，JavaScript 无法直接读取。
        </p>
      </div>
      <a
        href="/"
        style={{
          color: "#2563eb",
          textDecoration: "underline",
          marginTop: "1rem",
        }}
      >
        ← 返回首页
      </a>
    </div>
  );
}

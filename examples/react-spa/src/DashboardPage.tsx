import { RequireAuth } from "@nihplod/sso-sdk/react";
import { useSso } from "@nihplod/sso-sdk/react";

/**
 * 受保护页面示例
 *
 * 使用 <RequireAuth> 包裹，未登录用户会自动跳转到 SSO 登录页。
 */
export function DashboardPage() {
  return (
    <RequireAuth>
      <DashboardContent />
    </RequireAuth>
  );
}

function DashboardContent() {
  const { user, logout, getAccessToken } = useSso();

  const callApi = async () => {
    const token = await getAccessToken();
    if (!token) return;
    // 示例：用 access_token 调用子项目后端 API
    const res = await fetch("/api/protected", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    console.log("API response:", data);
  };

  return (
    <div style={styles.container}>
      <h1>控制台</h1>
      <p>欢迎, {user?.nickname}！这是受保护页面。</p>
      <div style={styles.actions}>
        <button style={styles.button} onClick={callApi}>
          调用受保护 API
        </button>
        <button
          style={{ ...styles.button, backgroundColor: "#ef4444" }}
          onClick={() => logout(true)}
        >
          退出登录
        </button>
      </div>
      {/* react-spa 非 Next.js 应用，无 next/link 可用 */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/" style={styles.link}>
        ← 返回首页
      </a>
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
  },
  actions: { display: "flex", gap: "1rem", marginTop: "1rem" },
  button: {
    padding: "10px 20px",
    fontSize: "14px",
    backgroundColor: "#2563eb",
    color: "white",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
  },
  link: { color: "#2563eb", textDecoration: "underline" },
};

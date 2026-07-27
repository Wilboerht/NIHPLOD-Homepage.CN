import { useSso } from "@nihplod/sso-sdk/react";

/** 首页：展示登录按钮或用户信息 */
export function HomePage() {
  const { user, isAuthenticated, isLoading, login, logout } = useSso();

  if (isLoading) {
    return (
      <div style={styles.container}>
        <p>加载中...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div style={styles.container}>
        <h1>SSO 接入示例 — React SPA</h1>
        <p style={styles.desc}>
          点击下方按钮使用 NIHPLOD 账号登录
        </p>
        <button style={styles.button} onClick={() => login()}>
          使用 NIHPLOD 账号登录
        </button>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <h1>欢迎回来, {user?.nickname || "用户"}！</h1>
      <div style={styles.userInfo}>
        <p>用户 ID: {user?.sub}</p>
        {user?.phone && <p>手机号: {user.phone}</p>}
        {user?.avatar && (
          <img
            src={user.avatar}
            alt="头像"
            style={{ width: 64, height: 64, borderRadius: "50%" }}
          />
        )}
      </div>
      <div style={styles.actions}>
        <a href="/dashboard" style={styles.link}>
          进入控制台 →
        </a>
        <button style={styles.logoutBtn} onClick={() => logout(true)}>
          退出登录
        </button>
      </div>
    </div>
  );
}

/** 内联样式（简化） */
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
  desc: { color: "#666", maxWidth: 400, textAlign: "center" },
  button: {
    padding: "12px 24px",
    fontSize: "16px",
    backgroundColor: "#2563eb",
    color: "white",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
  },
  userInfo: {
    backgroundColor: "#f3f4f6",
    padding: "1.5rem",
    borderRadius: "12px",
    textAlign: "center",
  },
  actions: { display: "flex", gap: "1rem", marginTop: "1rem" },
  link: { color: "#2563eb", textDecoration: "underline" },
  logoutBtn: {
    padding: "8px 16px",
    backgroundColor: "#ef4444",
    color: "white",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
  },
};

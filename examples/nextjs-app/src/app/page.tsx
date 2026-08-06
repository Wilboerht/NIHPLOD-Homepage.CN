"use client";

import { useState, useEffect } from "react";
import { SsoClient } from "@nihplod/sso-sdk";

/**
 * Next.js 首页 — 客户端 SDk 示例
 *
 * 展示两种接入方式：
 * 1. Middleware（全站保护，配置在 src/middleware.ts）
 * 2. 客户端 SDK（按需登录，本页面演示）
 */
const sso = new SsoClient({
  clientId: process.env.NEXT_PUBLIC_SSO_CLIENT_ID || "your-client-id",
  redirectUri: process.env.NEXT_PUBLIC_SSO_REDIRECT_URI || "http://localhost:3002/api/auth/callback",
  ssoBaseUrl: process.env.NEXT_PUBLIC_SSO_BASE_URL || "https://nihplod.cn",
  scopes: "openid profile",
});

export default function Home() {
  const [user, setUser] = useState<{ nickname?: string; sub?: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (sso.isAuthenticated()) {
      sso.getUserInfo().then(setUser).catch(() => {}).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  if (loading) return <div style={styles.container}><p>加载中...</p></div>;

  return (
    <div style={styles.container}>
      <h1>Next.js SSO 接入示例</h1>
      {user ? (
        <div style={styles.card}>
          <p>已登录: {user.nickname || user.sub}</p>
          <div style={styles.buttons}>
            <a href="/dashboard" style={styles.btnPrimary}>进入控制台</a>
            <button
              onClick={async () => {
                await fetch("/api/auth/logout", { method: "POST" });
                window.location.href = "/";
              }}
              style={styles.btnDanger}
            >
              退出登录
            </button>
          </div>
        </div>
      ) : (
        <div style={styles.card}>
          <p>未登录</p>
          <button style={styles.btnPrimary} onClick={() => sso.login()}>
            使用 NIHPLOD 账号登录
          </button>
        </div>
      )}
      <div style={styles.info}>
        <p>本示例展示了两种 SSO 集成方式：</p>
        <ol>
          <li><strong>Middleware 方式</strong>：全站自动保护，访问 /dashboard 未登录时自动跳转 SSO</li>
          <li><strong>客户端 SDK</strong>：本页面按需登录，灵活性更高</li>
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

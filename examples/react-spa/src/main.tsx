import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import { SsoProvider } from "@nihplod/sso-sdk/react";
import { CallbackPage } from "@nihplod/sso-sdk/react";
import { HomePage } from "./HomePage";
import { DashboardPage } from "./DashboardPage";

/**
 * 回调路由：传入 onSuccess 跳过默认的整页跳转，
 * 由 react-router 接管（不丢失 SPA 应用状态）。
 * token 默认存 sessionStorage，即使整页跳转/刷新登录态也会保留。
 */
function CallbackRoute() {
  const navigate = useNavigate();
  return <CallbackPage onSuccess={() => navigate("/", { replace: true })} />;
}

/**
 * ⚠️ 使用前请替换为你的实际配置
 *
 * 1. 在管理后台注册 OAuth Client：https://nihplod.cn/admin/oauth-clients
 * 2. 将 clientId 和 redirectUri 替换为实际值
 * 3. 确保 redirectUri 与注册时完全一致
 */
const SSO_CONFIG = {
  clientId: "your-client-id", // ← 替换为实际 Client ID
  redirectUri: "http://localhost:3001/callback", // ← 替换为实际回调 URL
  ssoBaseUrl: "https://nihplod.cn",
  scopes: "openid profile phone",
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <SsoProvider config={SSO_CONFIG}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/callback" element={<CallbackRoute />} />
          <Route path="/dashboard" element={<DashboardPage />} />
        </Routes>
      </BrowserRouter>
    </SsoProvider>
  </React.StrictMode>
);

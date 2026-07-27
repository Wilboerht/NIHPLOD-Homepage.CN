import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SsoProvider } from "@nihplod/sso-sdk/react";
import { CallbackPage } from "@nihplod/sso-sdk/react";
import { HomePage } from "./HomePage";
import { DashboardPage } from "./DashboardPage";

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
          <Route path="/callback" element={<CallbackPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
        </Routes>
      </BrowserRouter>
    </SsoProvider>
  </React.StrictMode>
);

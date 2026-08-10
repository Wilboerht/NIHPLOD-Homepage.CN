/**
 * CallbackPage — 通用 OAuth 回调页面组件
 *
 * 子项目只需在回调路由渲染此组件即可完成 code → token 交换。
 * 交换成功后自动跳转到 returnUrl 或首页。
 *
 * @example
 * ```tsx
 * // 在回调页面路由中：
 * import { CallbackPage } from "@nihplod/sso-sdk/react";
 * export default function AuthCallback() {
 *   return <CallbackPage />;
 * }
 * ```
 */

"use client";

import React, { useEffect, useState } from "react";
import { useSso } from "./SsoProvider";
import { getReturnUrl, removeReturnUrl } from "../core/storage";
import { SsoError } from "../core/errors";

export function CallbackPage() {
  const { client, refreshUser } = useSso();
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(true);

  useEffect(() => {
    // 弹窗模式：通过 postMessage 将回调 URL 传回主窗口，不自行处理
    if (window.opener && !window.opener.closed) {
      const nonce = new URL(window.location.href).searchParams.get("popup_nonce");
      window.opener.postMessage(
        { type: "nihplod_sso_popup_callback", callbackUrl: window.location.href, nonce: nonce || undefined },
        // 弹窗与主窗口同源（都在子项目域名下），open 注入的 opener 关系保留 origin 访问能力
        window.opener.location.origin
      );
      // 微任务延迟，避免 effect 内同步 setState
      Promise.resolve().then(() => setProcessing(false));
      return;
    }

    let cancelled = false;

    async function handleCallback() {
      try {
        await client.handleCallback(window.location.href);

        if (cancelled) return;

        // 刷新用户信息
        await refreshUser();

        // 跳转到 returnUrl 或首页
        const returnUrl = getReturnUrl();
        removeReturnUrl();
        window.location.href = returnUrl || "/";
      } catch (err) {
        if (cancelled) return;
        if (err instanceof SsoError) {
          // SsoError 携带 code + description，可直接展示
          setError(err.description || `SSO 错误 (${err.code})`);
        } else if (err instanceof TypeError && err.message.includes("fetch")) {
          // 网络错误：断网、DNS 失败、CORS 等
          setError("网络连接失败，请检查网络后重试");
        } else if (err instanceof Error) {
          setError(`登录回调处理失败: ${err.message}`);
        } else {
          setError("登录回调处理失败，请重试");
        }
        setProcessing(false);
      }
    }

    handleCallback();

    return () => { cancelled = true; };
  }, [client, refreshUser]);

  if (error) {
    return React.createElement(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          fontFamily: "system-ui, sans-serif",
        },
      },
      React.createElement(
        "p",
        { style: { color: "#dc2626", marginBottom: "1rem" } },
        error
      ),
      React.createElement(
        "a",
        { href: "/", style: { color: "#2563eb", textDecoration: "underline" } },
        "返回首页"
      )
    );
  }

  if (processing) {
    return React.createElement(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          fontFamily: "system-ui, sans-serif",
        },
      },
      React.createElement("p", null, "正在处理登录回调...")
    );
  }

  return null;
}

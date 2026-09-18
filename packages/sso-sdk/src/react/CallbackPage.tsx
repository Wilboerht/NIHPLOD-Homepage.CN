/**
 * CallbackPage — 通用 OAuth 回调页面组件
 *
 * 子项目只需在回调路由渲染此组件即可完成 code → token 交换。
 * 交换成功后默认整页跳转到 returnUrl 或首页；
 * 传入 onSuccess 可跳过默认跳转，由 SPA 路由接管（保持应用状态）。
 *
 * @example
 * ```tsx
 * // 在回调页面路由中：
 * import { CallbackPage } from "@nihplod/sso-sdk/react";
 * export default function AuthCallback() {
 *   return <CallbackPage />;
 * }
 * ```
 *
 * @example SPA 路由接管跳转（不整页刷新）：
 * ```tsx
 * <CallbackPage onSuccess={() => navigate("/dashboard", { replace: true })} />
 * ```
 */

"use client";

import React, { useEffect, useRef, useState } from "react";
import { useSso } from "./SsoProvider";
import { getReturnUrl, removeReturnUrl, type TokenData } from "../core/storage";
import { isTrustedReturnUrl } from "../core/security";
import { SsoError } from "../core/errors";

export interface CallbackPageProps {
  /**
   * 登录成功回调。传入后跳过默认的整页跳转（window.location.href），
   * 由调用方用 SPA 路由接管跳转，避免丢失应用内状态。
   */
  onSuccess?: (tokenData: TokenData) => void;

  /** 登录失败回调（错误同时会展示在错误页，除非提供了 renderError） */
  onError?: (error: Error) => void;

  /**
   * 自定义错误页渲染。不传时使用默认错误 UI（DefaultCallbackError）。
   */
  renderError?: (error: string) => React.ReactNode;
}

/** 默认错误页 UI（可通过 renderError 完全替换） */
export function DefaultCallbackError({ error }: { error: string }) {
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

export function CallbackPage({ onSuccess, onError, renderError }: CallbackPageProps = {}) {
  const { client, refreshUser } = useSso();
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(true);
  // 弹窗模式：postMessage 已发送但超时未收到主窗口 ACK（主窗口监听未挂载等），
  // 提示用户手动关闭窗口，避免弹窗悬挂
  const [awaitingManualClose, setAwaitingManualClose] = useState(false);

  // useLatest 惯例：用 ref 保存最新的 onSuccess/onError，
  // 避免调用方传内联回调时父组件重渲染导致下方 effect 重跑、
  // 已消费的 code 被重复交换 token（闪现假错误页）。
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onSuccessRef.current = onSuccess;
    onErrorRef.current = onError;
  });

  useEffect(() => {
    // 弹窗模式：通过 postMessage 将回调 URL 传回主窗口，不自行处理
    if (window.opener && !window.opener.closed) {
      const nonce = new URL(window.location.href).searchParams.get("popup_nonce");
      // opener 与弹窗同源时可直接读 origin；跨源访问会抛 SecurityError，回退到当前 origin
      let targetOrigin = window.location.origin;
      try {
        targetOrigin = window.opener.location.origin;
      } catch {
        // 跨源 opener：使用当前 origin（postMessage 会校验，不会泄露给第三方）
      }

      // postMessage 只发一次可能赶上主窗口监听未挂载而丢失；
      // 每 500ms 重发直到收到主窗口 ACK，超时 10s 提示手动关闭窗口
      const message = {
        type: "nihplod_sso_popup_callback",
        callbackUrl: window.location.href,
        nonce: nonce || undefined,
      };
      let acked = false;
      const send = () => {
        if (acked || !window.opener || window.opener.closed) return;
        window.opener.postMessage(message, targetOrigin);
      };
      send();
      const resendTimer = setInterval(send, 500);
      const ackTimeout = setTimeout(() => {
        if (acked) return;
        clearInterval(resendTimer);
        setAwaitingManualClose(true);
      }, 10_000);

      const handleAck = (event: MessageEvent) => {
        // origin 与 nonce 校验与主窗口侧对称：nonce 缺失时不校验（兼容旧主窗口），存在时必须匹配
        if (event.origin !== targetOrigin) return;
        if (!event.data || event.data.type !== "nihplod_sso_popup_ack") return;
        if (nonce && event.data.nonce !== nonce) return;
        acked = true;
        clearInterval(resendTimer);
        clearTimeout(ackTimeout);
      };
      window.addEventListener("message", handleAck);

      // 微任务延迟，避免 effect 内同步 setState
      Promise.resolve().then(() => setProcessing(false));

      return () => {
        clearInterval(resendTimer);
        clearTimeout(ackTimeout);
        window.removeEventListener("message", handleAck);
      };
    }

    let cancelled = false;

    async function handleCallback() {
      try {
        const tokenData = await client.handleCallback(window.location.href);

        if (cancelled) return;

        // 静默探测（prompt=none）无 SSO 会话：handleCallback 返回 null。
        // 跳回 returnUrl 并附 sso_probe=no_session，子站据此按"未登录"展示
        if (tokenData === null) {
          const clientId = client.config.clientId;
          const probeReturnUrl = getReturnUrl(clientId);
          removeReturnUrl(clientId);
          const target =
            probeReturnUrl && isTrustedReturnUrl(probeReturnUrl, window.location.origin)
              ? probeReturnUrl
              : "/";
          window.location.href =
            target + (target.includes("?") ? "&" : "?") + "sso_probe=no_session";
          return;
        }

        // 刷新用户信息
        await refreshUser();

        if (cancelled) return;

        // 读取并清除 returnUrl（按 clientId 隔离，与 login() 写入的 key 对应）
        const clientId = client.config.clientId;
        const returnUrl = getReturnUrl(clientId);
        removeReturnUrl(clientId);

        // 传入 onSuccess 时由调用方接管跳转（SPA 路由），跳过默认整页跳转
        const onSuccessCb = onSuccessRef.current;
        if (onSuccessCb) {
          onSuccessCb(tokenData);
          return;
        }

        // 默认：整页跳转到 returnUrl 或首页（开放重定向防护：仅相对路径或同源）
        // token 默认存 sessionStorage，整页跳转后登录态仍保留
        window.location.href =
          returnUrl && isTrustedReturnUrl(returnUrl, window.location.origin)
            ? returnUrl
            : "/";
      } catch (err) {
        if (cancelled) return;
        const errorObj = err instanceof Error ? err : new Error(String(err));
        onErrorRef.current?.(errorObj);
        if (errorObj instanceof SsoError) {
          // SsoError 携带 code + description，可直接展示
          setError(errorObj.description || `SSO 错误 (${errorObj.code})`);
        } else {
          setError(`登录回调处理失败: ${errorObj.message}`);
        }
        setProcessing(false);
      }
    }

    handleCallback();

    return () => { cancelled = true; };
  }, [client, refreshUser]);

  if (error) {
    if (renderError) return React.createElement(React.Fragment, null, renderError(error));
    return React.createElement(DefaultCallbackError, { error });
  }

  if (awaitingManualClose) {
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
      React.createElement("p", null, "登录已完成，请手动关闭此窗口")
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

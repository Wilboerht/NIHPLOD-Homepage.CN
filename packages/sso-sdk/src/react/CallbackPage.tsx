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

/** 将 SDK 错误码映射为用户可读文案（避免向终端用户暴露 state/CSRF/PKCE 等技术术语） */
const CALLBACK_ERROR_HINTS: Partial<Record<string, string>> = {
  state_mismatch: "登录会话校验失败，请重新登录",
  pkce_required: "登录会话不完整，请重新登录",
  user_denied_authorization: "你已取消登录",
  session_expired: "登录已过期，请重新登录",
  authorization_code_expired: "登录信息已过期，请重新登录",
  authorization_code_used: "登录信息已被使用，请重新登录",
  token_request_failed: "登录失败，请重新登录",
  userinfo_failed: "登录信息获取失败，请重试",
  not_authenticated: "请先登录后再访问",
  network_error: "网络异常，请检查网络后重试",
  rate_limited: "操作过于频繁，请稍后重试",
  popup_blocked: "登录窗口被浏览器拦截，请允许弹窗后重试",
  popup_closed: "登录窗口已关闭，请重新登录",
  client_disabled: "该应用已停用，请联系管理员",
  account_disabled: "账号暂时无法使用，请联系客服",
  sso_server_error: "登录服务暂时不可用，请稍后重试",
  invalid_config: "应用配置有误，请联系管理员",
  no_refresh_token: "登录已过期，请重新登录",
};

/** 统一将回调异常转换为面向用户的中文提示 */
export function getCallbackErrorMessage(err: unknown): string {
  if (err instanceof SsoError) {
    const hint = CALLBACK_ERROR_HINTS[err.code];
    if (hint) return hint;
    if (err.code.startsWith("id_token")) return "登录校验失败，请重新登录";
    // 描述为中文（业务可控文案）时直接展示，否则回退通用文案
    if (/[\u4e00-\u9fff]/.test(err.description)) return err.description;
    return "登录失败，请重新登录";
  }
  return "登录失败，请重试";
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
        padding: "2rem",
        textAlign: "center",
      },
    },
    React.createElement(
      "p",
      { style: { color: "#dc2626", marginBottom: "1.5rem" } },
      error
    ),
    React.createElement(
      "div",
      { style: { display: "flex", gap: "0.75rem" } },
      React.createElement(
        "a",
        {
          href: "/",
          style: {
            display: "inline-block",
            padding: "0.6rem 1.4rem",
            background: "#2c2c2c",
            color: "#fff",
            fontSize: "0.8125rem",
            textDecoration: "none",
          },
        },
        "重新登录"
      ),
      React.createElement(
        "button",
        {
          type: "button",
          onClick: () => {
            if (window.history.length > 1) window.history.back();
            else window.location.href = "/";
          },
          style: {
            display: "inline-block",
            padding: "0.6rem 1.4rem",
            border: "1px solid rgba(44, 44, 44, 0.25)",
            background: "transparent",
            color: "#2c2c2c",
            fontSize: "0.8125rem",
            cursor: "pointer",
          },
        },
        "返回上一页"
      )
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

  // React StrictMode 开发模式下 effect 会执行两次（mount → cleanup → mount）。
  // 授权码只能消费一次：用共享的 in-flight Promise 保证只交换一次；
  // 第二次挂载复用同一 Promise 继续做后处理（跳转/onSuccess），
  // 避免第一次运行被 cleanup 标记取消后整个流程停在 loading。
  const callbackPromiseRef = useRef<Promise<TokenData | null> | null>(null);
  // 后处理（跳转 / onSuccess / 错误展示）只执行一次，防止 effect 因依赖变化重跑时重复执行
  const postProcessedRef = useRef(false);
  const errorHandledRef = useRef(false);

  useEffect(() => {
    // 弹窗模式：仅在携带 popup_nonce 时启用（loginPopup 生成并回传）。
    // 无 nonce 时按普通回调处理，避免被同源页面以 window.open 打开时悬挂。
    const popupNonce = new URL(window.location.href).searchParams.get("popup_nonce");
    if (window.opener && !window.opener.closed && popupNonce) {
      const nonce = popupNonce;
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
        nonce,
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
        // origin / 来源窗口 / nonce 三重校验，与主窗口侧对称
        if (event.source !== window.opener) return;
        if (event.origin !== targetOrigin) return;
        if (!event.data || event.data.type !== "nihplod_sso_popup_ack") return;
        if (event.data.nonce !== nonce) return;
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
        if (!callbackPromiseRef.current) {
          callbackPromiseRef.current = client.handleCallback(window.location.href);
        }
        const tokenData = await callbackPromiseRef.current;

        if (cancelled || postProcessedRef.current) return;
        postProcessedRef.current = true;

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
        if (cancelled || errorHandledRef.current) return;
        errorHandledRef.current = true;
        // 失败后清空 Promise，允许显式重试（如组件重新挂载且授权码未被消费的场景）
        callbackPromiseRef.current = null;
        const errorObj = err instanceof Error ? err : new Error(String(err));
        onErrorRef.current?.(errorObj);
        setError(getCallbackErrorMessage(errorObj));
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

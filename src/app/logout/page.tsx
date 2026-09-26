/**
 * OIDC RP-Initiated Logout 入口
 * /logout
 *
 * 接收标准参数：
 * - post_logout_redirect_uri: 登出后跳转地址
 * - id_token_hint: 当前用户的 ID Token（可选）
 * - client_id: 发起登出的子项目 Client ID（可选）
 * - state: 防 CSRF 状态参数（可选）
 *
 * 用户确认后调用主站登出 API，然后重定向到 /logout/confirm
 * 做 frontchannel 单点登出，最终回到 post_logout_redirect_uri。
 */
"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { hasUnsafeUrlChars, isSafeRelativePath } from "@/lib/url-safety";

function getCsrfTokenFromCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)__Host-csrf_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function ensureCsrfToken(): Promise<string | null> {
  const existing = getCsrfTokenFromCookie();
  if (existing) return existing;
  try {
    const res = await fetch("/api/auth/csrf", { credentials: "include" });
    if (res.ok) return getCsrfTokenFromCookie();
  } catch {
    // ignore
  }
  return null;
}

async function checkTrustedLogoutUri(uri: string, clientId: string | null): Promise<boolean> {
  if (!uri) return true;
  // 站内相对路径：必须拒绝反斜杠/控制字符（"/\evil.com" 会被浏览器解析为跨站）
  if (isSafeRelativePath(uri)) return true;
  if (hasUnsafeUrlChars(uri)) return false;
  try {
    const url = new URL("/api/oauth/check-post-logout-uri", window.location.origin);
    if (clientId) url.searchParams.set("client_id", clientId);
    url.searchParams.set("post_logout_redirect_uri", uri);
    const res = await fetch(url.toString());
    if (!res.ok) return false;
    const data = await res.json();
    return !!data.trusted;
  } catch {
    return false;
  }
}

function LogoutContent() {
  const searchParams = useSearchParams();

  const postLogoutRedirectUri = searchParams.get("post_logout_redirect_uri") || "";
  const clientId = searchParams.get("client_id") || "";
  const state = searchParams.get("state") || "";
  // id_token_hint 由 end-session 经 URL fragment 传入（凭证不进 query/浏览器历史），
  // 客户端从 location.hash 读取（惰性初始化，仅在挂载时读取一次）；
  // 读不到时按无 hint 处理（既有行为）
  const [idTokenHint] = useState(() => {
    if (typeof window === "undefined") return "";
    const hash = window.location.hash;
    if (hash.length <= 1) return "";
    return new URLSearchParams(hash.slice(1)).get("id_token_hint") || "";
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // 分层退出：默认仅退出当前设备；勾选后升级为全设备登出
  // （撤销所有 refresh token 并 backchannel 通知全部已授权平台）
  const [allDevices, setAllDevices] = useState(false);
  const [trustedUri, setTrustedUri] = useState<string | null>(null);
  const [trustCheckDone, setTrustCheckDone] = useState(false);
  // id_token_hint 验签通过但其 sub 与当前 SSO 会话用户不一致时给出提示
  const [hintMismatch, setHintMismatch] = useState(false);
  // id_token_hint 验签通过且与当前会话身份一致：按 OIDC 最佳实践跳过确认页，
  // 自动执行登出（用户已在子站点过"退出"，再次确认属于冗余交互）
  const [hintVerified, setHintVerified] = useState(false);
  const autoConfirmRef = useRef(false);
  // 会话探测：无会话时无需确认，直接回跳
  const [sessionState, setSessionState] = useState<"unknown" | "active" | "none">("unknown");

  // 取消/无会话时的回跳：优先回可信的 post_logout_redirect_uri（附 state），否则回首页
  const goBack = () => {
    if (trustedUri) {
      const url = new URL(trustedUri, window.location.origin);
      if (state) url.searchParams.set("state", state);
      window.location.href = url.toString();
    } else {
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/";
    }
  };

  useEffect(() => {
    ensureCsrfToken().catch(() => {});
  }, []);

  // 探测当前会话（复用现有用户资料接口）：未登录则跳过确认直接回跳
  useEffect(() => {
    fetch("/api/user/profile", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setSessionState(d?.success ? "active" : "none"))
      .catch(() => setSessionState("none"));
  }, []);

  useEffect(() => {
    checkTrustedLogoutUri(postLogoutRedirectUri, clientId || null).then((trusted) => {
      setTrustedUri(trusted ? postLogoutRedirectUri : null);
      setTrustCheckDone(true);
    });
  }, [postLogoutRedirectUri, clientId]);

  // 无会话：等可信地址校验完成后直接回跳，不做无意义的"确认退出"
  useEffect(() => {
    if (sessionState === "none" && trustCheckDone) {
      goBack();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionState, trustCheckDone, trustedUri, state]);

  // 验证 id_token_hint（OIDC RP-Initiated Logout）：
  // 验证失败不阻断登出，照常走确认流程并忽略 hint；
  // 验证通过但身份与当前会话不一致时提示用户确认。
  // hint 经 POST body 传递（不再放 query，避免进入访问日志）
  useEffect(() => {
    if (!idTokenHint) return;
    fetch("/api/oauth/logout/verify-hint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id_token_hint: idTokenHint,
        ...(clientId ? { client_id: clientId } : {}),
      }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.valid && data?.matchesSession === true) {
          setHintVerified(true);
        } else if (data?.valid && data?.matchesSession === false) {
          setHintMismatch(true);
        }
      })
      .catch(() => {
        // 验证接口异常时忽略 hint，不影响正常登出流程
      });
  }, [idTokenHint, clientId]);

  const handleLogout = async () => {
    setLoading(true);
    setError("");
    try {
      const csrfToken = await ensureCsrfToken();
      if (!csrfToken) {
        setError("安全令牌获取失败，请刷新页面后重试");
        setLoading(false);
        return;
      }
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      headers["X-CSRF-Token"] = csrfToken;

      const res = await fetch("/api/auth/logout", {
        method: "POST",
        headers,
        credentials: "include",
        // 默认仅结束当前设备会话：RP-Initiated Logout 的最佳实践，避免在子站
        // 点一次退出就把用户手机/其他电脑的主站会话全部踢掉；
        // 用户勾选"退出所有设备"时升级为全设备登出（通知全部已授权平台）。
        // clientId 用于闭环撤销该子站的 OAuth 会话/refresh token（主站会话多为
        // 内部登录，refresh token 无 clientId，需按发起方兜底撤销）
        body: JSON.stringify({ allDevices, ...(clientId ? { clientId } : {}) }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error?.message || "登出失败");
      }

      // 清除所有客户端存储数据（auth_hint、偏好等）
      try {
        localStorage.clear();
      } catch {}

      // 跳转到 frontchannel logout 确认页（仅传递可信的重定向地址）
      const confirmUrl = new URL("/logout/confirm", window.location.origin);
      if (trustedUri) {
        confirmUrl.searchParams.set("post_logout_redirect_uri", trustedUri);
      }
      if (state) {
        confirmUrl.searchParams.set("state", state);
      }
      // client_id 仅用于日志/展示，不直接暴露 frontchannel URLs
      if (clientId) {
        confirmUrl.searchParams.set("client_id", clientId);
      }
      window.location.href = confirmUrl.toString();
    } catch (err) {
      setError(err instanceof Error ? err.message : "登出失败");
      setLoading(false);
    }
  };

  // 免确认自动登出：hint 已验证且与当前会话身份一致时，等会话探测与
  // 回跳地址校验就绪后自动执行。仅触发一次；失败时回落到确认界面由用户手动重试。
  // 安全性：无 hint / hint 无效 / hint 身份与会话不一致时均不进入此分支，
  // 攻击者无法伪造与受害者会话匹配的 id_token_hint（签名有效且 sub 一致）。
  useEffect(() => {
    if (
      hintVerified &&
      sessionState === "active" &&
      trustCheckDone &&
      !autoConfirmRef.current
    ) {
      autoConfirmRef.current = true;
      handleLogout();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hintVerified, sessionState, trustCheckDone]);

  // 会话探测中 / 无会话正在回跳：显示加载态而非确认框
  if (sessionState !== "active") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
      </div>
    );
  }

  // 免确认自动登出进行中：显示过渡态（出错时回落到下方确认界面）
  if (hintVerified && !error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="flex items-center gap-3 text-gray-500">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
          <span>正在退出登录...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-lg">
        <h1 className="mb-2 text-2xl font-bold text-gray-900">退出登录</h1>
        <p className="mb-6 text-gray-500">确定要退出当前设备的登录吗？</p>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {hintMismatch && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm text-amber-700">
              发起登出的应用所标识的账号与当前登录账号不一致，请确认后再退出。
            </p>
          </div>
        )}

        <label
          className={`mb-6 flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 text-left transition-colors ${
            allDevices
              ? "border-red-300 bg-red-50/60"
              : "border-gray-200 bg-gray-50 hover:border-gray-300"
          }`}
        >
          <input
            type="checkbox"
            checked={allDevices}
            onChange={(e) => setAllDevices(e.target.checked)}
            disabled={loading}
            className="mt-0.5 h-4 w-4 shrink-0 accent-red-600"
          />
          <span className="text-sm leading-snug text-gray-700">
            同时退出所有设备和已授权的平台
            <span className="mt-1 block text-xs leading-relaxed text-gray-400">
              勾选后将退出所有设备上的登录，并通知所有已授权的平台同步退出
            </span>
          </span>
        </label>

        <div className="flex justify-center gap-3">
          <button
            onClick={goBack}
            disabled={loading}
            className="rounded-lg border border-gray-300 px-6 py-3 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={handleLogout}
            disabled={loading || !trustCheckDone}
            className="rounded-lg bg-red-600 px-6 py-3 text-white hover:bg-red-700 disabled:opacity-50"
          >
            {!trustCheckDone ? "验证中..." : loading ? "处理中..." : "确认退出"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function LogoutPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gray-50">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
        </div>
      }
    >
      <LogoutContent />
    </Suspense>
  );
}

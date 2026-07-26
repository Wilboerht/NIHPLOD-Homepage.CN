/**
 * useSSO — React Hook for NIHPLOD SSO
 *
 * 管理用户登录状态，提供 login/logout 方法。
 * 需配合 <SSOProvider> 包裹应用根组件使用。
 */
"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";

// ============================================
// Types
// ============================================

/** SSO 配置 */
export interface SSOConfig {
  /** 主站 URL（如 https://nihplod.cn） */
  providerUrl: string;
  /** 子项目的 client_id */
  clientId: string;
  /** 子项目的回调 URL */
  redirectUri: string;
  /** 请求的 scope（空格分隔，如 "openid profile phone"） */
  scope?: string;
}

/** 用户信息 */
export interface SSOUser {
  /** 用户 ID */
  sub: string;
  /** 手机号（脱敏，如 138****1234） */
  phone?: string;
  /** 昵称 */
  nickname?: string;
  /** 头像 URL */
  avatar?: string;
  /** 会员等级 */
  membershipLevel?: string;
  /** 总积分 */
  totalPoints?: number;
}

/** useSSO hook 返回值 */
export interface UseSSOReturn {
  /** 当前用户信息 */
  user: SSOUser | null;
  /** 是否已登录 */
  isLoggedIn: boolean;
  /** 是否正在加载中 */
  isLoading: boolean;
  /** 错误信息 */
  error: string | null;
  /** 跳转到主站登录页 */
  login: () => void;
  /** 登出 */
  logout: () => void;
  /** 手动刷新用户信息 */
  refresh: () => Promise<void>;
}

// ============================================
// Context
// ============================================

interface SSOContextValue {
  config: SSOConfig;
  user: SSOUser | null;
  setUser: (user: SSOUser | null) => void;
  accessToken: string | null;
  setAccessToken: (token: string | null) => void;
  refreshToken: string | null;
  setRefreshToken: (token: string | null) => void;
}

const SSOContext = createContext<SSOContextValue | null>(null);

/**
 * 获取 SSO Context（仅在 <SSOProvider> 内部可用）
 */
export function useSSOContext(): SSOContextValue {
  const ctx = useContext(SSOContext);
  if (!ctx) {
    throw new Error("useSSOContext 必须在 <SSOProvider> 内部使用");
  }
  return ctx;
}

// ============================================
// PKCE Helpers
// ============================================

function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

function generateCodeChallenge(verifier: string): string {
  // 注意：这是同步版本，实际 SHA-256 需要异步
  // 此处提供简化实现，生产环境建议使用 Web Crypto API
  return verifier; // 简化：生产应使用 crypto.subtle.digest
}

async function generateCodeChallengeAsync(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(hash));
}

function base64UrlEncode(buffer: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < buffer.length; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function generateState(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

// ============================================
// Token Storage (localStorage)
// ============================================

const TOKEN_STORAGE_KEY = "nihplod_sso_tokens";

interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

function saveTokens(tokens: StoredTokens): void {
  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(tokens));
  } catch {
    // localStorage 不可用
  }
}

function loadTokens(): StoredTokens | null {
  try {
    const raw = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!raw) return null;
    const tokens = JSON.parse(raw) as StoredTokens;
    // 检查 token 是否已过期
    if (tokens.expiresAt && tokens.expiresAt < Date.now()) {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      return null;
    }
    return tokens;
  } catch {
    return null;
  }
}

function clearTokens(): void {
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // noop
  }
}

// ============================================
// SSOProvider
// ============================================

interface SSOProviderProps {
  config: SSOConfig;
  children: React.ReactNode;
}

/**
 * SSO Provider — 包裹应用根组件
 *
 * ```tsx
 * <SSOProvider config={{
 *   providerUrl: "https://nihplod.cn",
 *   clientId: "advisor",
 *   redirectUri: "https://advisor.nihplod.cn/callback",
 *   scope: "openid profile phone",
 * }}>
 *   <App />
 * </SSOProvider>
 * ```
 */
export function SSOProvider({ config, children }: SSOProviderProps) {
  const [user, setUser] = useState<SSOUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);

  // 初始化时从 localStorage 恢复 token
  useEffect(() => {
    const stored = loadTokens();
    if (stored) {
      setAccessToken(stored.accessToken);
      setRefreshToken(stored.refreshToken);
    }
  }, []);

  const value: SSOContextValue = {
    config,
    user,
    setUser,
    accessToken,
    setAccessToken,
    refreshToken,
    setRefreshToken,
  };

  return React.createElement(SSOContext.Provider, { value }, children);
}

// ============================================
// useSSO Hook
// ============================================

/**
 * useSSO — 用户登录状态管理 Hook
 *
 * 返回当前用户信息、登录状态和 login/logout 方法。
 *
 * ```tsx
 * function MyComponent() {
 *   const { user, isLoggedIn, isLoading, login, logout } = useSSO();
 *
 *   if (isLoading) return <div>加载中...</div>;
 *   if (!isLoggedIn) return <button onClick={login}>登录</button>;
 *   return <div>欢迎, {user?.nickname}!</div>;
 * }
 * ```
 */
export function useSSO(): UseSSOReturn {
  const { config, user, setUser, accessToken, setAccessToken, refreshToken, setRefreshToken } = useSSOContext();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const initializedRef = useRef(false);

  // 处理回调（URL 中的 code 参数）
  const handleCallback = useCallback(async (code: string, codeVerifier: string) => {
    try {
      const tokenRes = await fetch(`${config.providerUrl}/api/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          client_id: config.clientId,
          redirect_uri: config.redirectUri,
          code_verifier: codeVerifier,
        }),
      });

      if (!tokenRes.ok) {
        const err = await tokenRes.json().catch(() => ({}));
        throw new Error(err.error_description || "Token 交换失败");
      }

      const tokenData = await tokenRes.json();

      // 保存 token
      const storedTokens: StoredTokens = {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: Date.now() + (tokenData.expires_in || 900) * 1000,
      };
      saveTokens(storedTokens);
      setAccessToken(tokenData.access_token);
      setRefreshToken(tokenData.refresh_token);

      // 获取用户信息
      const userRes = await fetch(`${config.providerUrl}/api/oauth/userinfo`, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });

      if (userRes.ok) {
        const userData = await userRes.json();
        setUser(userData);
      }

      // 清理 URL 中的 code 参数
      const url = new URL(window.location.href);
      url.searchParams.delete("code");
      url.searchParams.delete("state");
      window.history.replaceState({}, "", url.toString());

      // 清理 PKCE
      sessionStorage.removeItem("nihplod_sso_code_verifier");
      sessionStorage.removeItem("nihplod_sso_state");
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
      clearTokens();
    }
  }, [config, setUser, setAccessToken, setRefreshToken]);

  // 初始化：检查是否有 code 参数（从主站回调回来）
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const savedState = sessionStorage.getItem("nihplod_sso_state");
    const codeVerifier = sessionStorage.getItem("nihplod_sso_code_verifier");

    if (code && state && codeVerifier) {
      // 校验 state 防止 CSRF
      if (state !== savedState) {
        setError("State 不匹配，登录被拒绝");
        setIsLoading(false);
        return;
      }

      handleCallback(code, codeVerifier).finally(() => setIsLoading(false));
      return;
    }

    // 尝试用已有 access token 获取用户信息
    if (accessToken) {
      fetch(`${config.providerUrl}/api/oauth/userinfo`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data) setUser(data);
        })
        .catch(() => {
          // Token 无效，清除
          clearTokens();
          setAccessToken(null);
        })
        .finally(() => setIsLoading(false));
      return;
    }

    setIsLoading(false);
  }, [accessToken, config.providerUrl, handleCallback, setUser, setAccessToken]);

  // 登录：重定向到主站 authorize 页面
  const login = useCallback(async () => {
    try {
      const state = generateState();
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = await generateCodeChallengeAsync(codeVerifier);

      // 保存 PKCE 参数
      sessionStorage.setItem("nihplod_sso_code_verifier", codeVerifier);
      sessionStorage.setItem("nihplod_sso_state", state);

      const authUrl = new URL(`${config.providerUrl}/api/oauth/authorize`);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("client_id", config.clientId);
      authUrl.searchParams.set("redirect_uri", config.redirectUri);
      authUrl.searchParams.set("scope", config.scope || "openid profile");
      authUrl.searchParams.set("state", state);
      authUrl.searchParams.set("code_challenge", codeChallenge);
      authUrl.searchParams.set("code_challenge_method", "S256");

      window.location.href = authUrl.toString();
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录跳转失败");
    }
  }, [config]);

  // 登出
  const logout = useCallback(() => {
    clearTokens();
    setAccessToken(null);
    setRefreshToken(null);
    setUser(null);

    // 可选的：通知主站登出
    if (refreshToken) {
      fetch(`${config.providerUrl}/api/oauth/logout/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: config.clientId,
          refresh_token: refreshToken,
        }),
      }).catch(() => {
        // 静默失败
      });
    }
  }, [config, refreshToken, setAccessToken, setRefreshToken, setUser]);

  // 手动刷新用户信息
  const refresh = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    try {
      const userRes = await fetch(`${config.providerUrl}/api/oauth/userinfo`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (userRes.ok) {
        const userData = await userRes.json();
        setUser(userData);
      }
    } catch {
      // noop
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, config.providerUrl, setUser]);

  return {
    user,
    isLoggedIn: !!user,
    isLoading,
    error,
    login,
    logout,
    refresh,
  };
}

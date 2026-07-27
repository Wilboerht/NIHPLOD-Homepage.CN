/**
 * SsoProvider - React Context Provider
 *
 * 包裹子项目根组件，提供全局 SSO 认证状态管理：
 * - 自动管理 token 刷新定时器（过期前 60s 静默刷新）
 * - 监听 storage 事件实现跨 Tab 同步
 * - 提供 useSso() hook
 */

"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { SsoClient } from "../core/SsoClient";
import { getTokenData, removeTokenData } from "../core/storage";
import type { SsoClientConfig, SsoUser } from "../core/SsoClient";

// ============================================
// Context 类型
// ============================================

export interface SsoContextValue {
  /** 当前用户信息 */
  user: SsoUser | null;

  /** 是否已认证 */
  isAuthenticated: boolean;

  /** 是否正在加载（初始化/刷新中） */
  isLoading: boolean;

  /** 发起登录 */
  login: (returnUrl?: string) => Promise<void>;

  /** 登出 */
  logout: (redirectToSso?: boolean) => Promise<void>;

  /** 刷新用户信息 */
  refreshUser: () => Promise<void>;

  /** 获取 access_token（自动刷新过期 token） */
  getAccessToken: () => Promise<string | null>;

  /** SsoClient 实例（高级用法） */
  client: SsoClient;
}

const SsoContext = createContext<SsoContextValue | null>(null);

// ============================================
// Provider Props
// ============================================

export interface SsoProviderProps {
  /** SSO 客户端配置 */
  config: SsoClientConfig;

  /** 子组件 */
  children: ReactNode;

  /**
   * 自动刷新阈值（秒）
   * access_token 过期前多少秒触发静默刷新。
   * 默认 60 秒。
   */
  refreshThreshold?: number;

  /**
   * API 请求函数（可选）
   * 用于在 token 刷新后自动重试失败的 API 请求。
   */
  onTokenRefreshed?: (token: string) => void;
}

// ============================================
// Provider 实现
// ============================================

export function SsoProvider({
  config,
  children,
  refreshThreshold = 60,
  onTokenRefreshed,
}: SsoProviderProps) {
  const [user, setUser] = useState<SsoUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const clientRef = useRef(new SsoClient(config));
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedRef = useRef(false);

  const client = clientRef.current;

  // 加载用户信息
  const loadUser = useCallback(async () => {
    if (!client.isAuthenticated()) {
      setUser(null);
      setIsAuthenticated(false);
      setIsLoading(false);
      return;
    }

    try {
      const u = await client.getUserInfo();
      setUser(u);
      setIsAuthenticated(true);
    } catch {
      setUser(null);
      setIsAuthenticated(false);
      removeTokenData(client.config.clientId);
    } finally {
      setIsLoading(false);
    }
  }, [client]);

  // 初始化
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    // 检查是否有有效的 token（不发起网络请求）
    if (client.isAuthenticated()) {
      loadUser();
    } else {
      setIsLoading(false);
    }
  }, [client, loadUser]);

  // Token 自动刷新定时器（setTimeout 递归调度，避免 setInterval 堆积）
  useEffect(() => {
    let active = true;

    const scheduleNextRefresh = () => {
      if (!active) return;

      // 清除已有定时器
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }

      const tokenData = getTokenData(client.config.clientId);
      if (!tokenData) return;

      // 计算距离过期还有多少秒
      const remainingSec = (tokenData.expires_at - Date.now()) / 1000;

      if (remainingSec <= 0) {
        // 已过期，立即刷新
        client
          .refreshToken()
          .then((td) => {
            onTokenRefreshed?.(td.access_token);
            loadUser();
          })
          .catch(() => {});
        return;
      }

      if (remainingSec <= refreshThreshold) {
        // 即将过期，立即刷新
        client
          .refreshToken()
          .then((td) => {
            onTokenRefreshed?.(td.access_token);
            loadUser();
          })
          .catch(() => {});
        return;
      }

      // 在过期前 refreshThreshold 秒触发刷新
      const delayMs = (remainingSec - refreshThreshold) * 1000;

      refreshTimerRef.current = setTimeout(() => {
        const td = getTokenData(client.config.clientId);
        if (!td) return;

        const secLeft = (td.expires_at - Date.now()) / 1000;
        if (secLeft <= refreshThreshold) {
          client
            .refreshToken()
            .then((newTd) => {
              onTokenRefreshed?.(newTd.access_token);
              loadUser();
            })
            .catch(() => {});
          // 刷新后重新调度下一次
          scheduleNextRefresh();
        }
      }, Math.max(delayMs, 1000));
    };

    scheduleNextRefresh();

    return () => {
      active = false;
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [client, loadUser, refreshThreshold, onTokenRefreshed]);

  // 监听 storage 事件实现跨 Tab 同步
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key?.startsWith("nihplod_sso_")) {
        loadUser();
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [loadUser]);

  // 登录
  const login = useCallback(
    async (returnUrl?: string) => {
      await client.login(returnUrl);
    },
    [client]
  );

  // 登出
  const logout = useCallback(
    async (redirectToSso: boolean = false) => {
      await client.logout(redirectToSso);
      setUser(null);
      setIsAuthenticated(false);
    },
    [client]
  );

  // 刷新用户信息
  const refreshUser = useCallback(async () => {
    await loadUser();
  }, [loadUser]);

  // 获取 access_token
  const getAccessToken = useCallback(async (): Promise<string | null> => {
    return client.getAccessToken();
  }, [client]);

  const value: SsoContextValue = {
    user,
    isAuthenticated,
    isLoading,
    login,
    logout,
    refreshUser,
    getAccessToken,
    client,
  };

  return React.createElement(SsoContext.Provider, { value }, children);
}

// ============================================
// Hook
// ============================================

/**
 * useSso Hook
 *
 * 在 SsoProvider 内部使用，获取 SSO 认证状态和操作方法。
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { user, isAuthenticated, login, logout } = useSso();
 *   if (!isAuthenticated) return <button onClick={() => login()}>登录</button>;
 *   return <div>欢迎, {user?.nickname}</div>;
 * }
 * ```
 */
export function useSso(): SsoContextValue {
  const ctx = useContext(SsoContext);
  if (!ctx) {
    throw new Error("useSso() 必须在 <SsoProvider> 内部使用");
  }
  return ctx;
}

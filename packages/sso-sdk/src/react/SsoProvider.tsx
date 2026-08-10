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
import type { TokenData } from "../core/storage";
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

  /** 发起登录（同页重定向） */
  login: (returnUrl?: string) => Promise<void>;

  /** 弹窗模式登录（保持当前页面状态不丢失） */
  loginPopup: (options?: { returnUrl?: string; width?: number; height?: number }) => Promise<TokenData>;

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

// 跨 Tab 刷新锁（基于 localStorage + 时间戳，避免多 Tab 同时刷新导致旧 RT 被撤销）
const REFRESH_LOCK_PREFIX = "nihplod_sso_refresh_lock:";
const LOCK_TTL_MS = 5000;

function lockKey(clientId: string): string {
  return REFRESH_LOCK_PREFIX + clientId;
}

function acquireRefreshLock(clientId: string): boolean {
  if (typeof localStorage === "undefined") return true;
  const key = lockKey(clientId);
  const now = Date.now();
  const raw = localStorage.getItem(key);
  if (raw) {
    const ts = parseInt(raw, 10);
    if (!isNaN(ts) && now - ts < LOCK_TTL_MS) {
      return false;
    }
  }
  localStorage.setItem(key, String(now));
  return true;
}

function releaseRefreshLock(clientId: string): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(lockKey(clientId));
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
  // 实例用 useState 懒初始化保持稳定引用（避免渲染期读取 ref）
  const [client] = useState(() => new SsoClient(config));
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedRef = useRef(false);

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

  // 初始化（微任务延迟，避免 effect 内同步 setState）
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    Promise.resolve().then(() => {
      // 检查是否有有效的 token（不发起网络请求）
      if (client.isAuthenticated()) {
        loadUser();
      } else {
        setIsLoading(false);
      }
    });
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
        // 已过期，立即刷新（带锁，避免多 Tab 并发）
        if (!acquireRefreshLock(client.config.clientId)) return;
        client
          .refreshToken()
          .then((td) => {
            onTokenRefreshed?.(td.access_token);
            loadUser();
          })
          .catch(() => {
            // 刷新失败可能是其他 Tab 已刷新；短暂后重新加载本地 token
            setTimeout(() => loadUser(), 500);
          })
          .finally(() => releaseRefreshLock(client.config.clientId));
        return;
      }

      if (remainingSec <= refreshThreshold) {
        // 即将过期，立即刷新（带锁）
        if (!acquireRefreshLock(client.config.clientId)) return;
        client
          .refreshToken()
          .then((td) => {
            onTokenRefreshed?.(td.access_token);
            loadUser();
          })
          .catch(() => {
            setTimeout(() => loadUser(), 500);
          })
          .finally(() => releaseRefreshLock(client.config.clientId));
        return;
      }

      // 在过期前 refreshThreshold 秒触发刷新
      const delayMs = (remainingSec - refreshThreshold) * 1000;

      refreshTimerRef.current = setTimeout(() => {
        if (!active) return;
        const td = getTokenData(client.config.clientId);
        if (!td) return;

        const secLeft = (td.expires_at - Date.now()) / 1000;
        if (secLeft <= refreshThreshold) {
          if (!acquireRefreshLock(client.config.clientId)) {
            // 其他 Tab 正在刷新，等待 storage 事件同步即可
            return;
          }
          client
            .refreshToken()
            .then((newTd) => {
              onTokenRefreshed?.(newTd.access_token);
              loadUser();
            })
            .catch(() => {
              setTimeout(() => loadUser(), 500);
            })
            .finally(() => releaseRefreshLock(client.config.clientId));
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
      if (
        e.key &&
        e.key.startsWith("nihplod_sso_") &&
        !e.key.startsWith(REFRESH_LOCK_PREFIX)
      ) {
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

  // 弹窗模式登录
  const loginPopup = useCallback(
    async (options?: { returnUrl?: string; width?: number; height?: number }) => {
      const tokenData = await client.loginPopup(options);
      await loadUser();
      return tokenData;
    },
    [client, loadUser]
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
    loginPopup,
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

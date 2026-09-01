"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  ReactNode,
  useEffect,
} from "react";
import { fetchWithAuth, refreshAccessToken, UnauthorizedError } from "@/lib/fetch-with-auth";
import { apiPost } from "@/lib/api-client";
import { deferInEffect } from "@/hooks/deferInEffect";
import type { UserCenterTab } from "@/lib/user-center-tab";

interface User {
  id: string;
  phone?: string;
  nickname?: string;
  avatar?: string;
  birthday?: string | null;
  membershipLevel?: string;
  hasPassword?: boolean;
}

// 用户中心视图类型（弹窗菜单/三外壳共用的 tab 标识，见 @/lib/user-center-tab）
export type UserCenterView = UserCenterTab | null;

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  // 用户中心弹窗状态
  userCenterOpen: boolean;
  userCenterView: UserCenterView;
  openUserCenter: (view?: UserCenterView) => void;
  closeUserCenter: () => void;
  setUserCenterView: (view: UserCenterView) => void;
  // 登录/注册/找回/绑定入口（全部跳转到统一登录页）
  redirectToLogin: (returnTo?: string | null) => void;
  redirectToRegister: (returnTo?: string | null) => void;
  redirectToForgotPassword: (returnTo?: string | null) => void;
  redirectToWechatBind: (returnTo?: string | null) => void;
  refreshUser: (force?: boolean) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function buildAuthUrl(mode: string, returnTo?: string | null) {
  const params = new URLSearchParams();
  params.set("mode", mode);
  if (returnTo) {
    params.set("return_to", returnTo);
  }
  return `/login?${params.toString()}`;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 用户中心弹窗状态
  const [userCenterOpen, setUserCenterOpen] = useState(false);
  const [userCenterView, setUserCenterViewState] = useState<UserCenterView>("profile");

  // 统一登录页跳转（使用 window.location 确保在事件回调中也能立即触发）
  const redirectToLogin = useCallback((returnTo?: string | null) => {
    const target =
      returnTo ??
      (typeof window !== "undefined" ? window.location.pathname + window.location.search : null);
    window.location.href = buildAuthUrl("login", target);
  }, []);

  const redirectToRegister = useCallback((returnTo?: string | null) => {
    const target =
      returnTo ??
      (typeof window !== "undefined" ? window.location.pathname + window.location.search : null);
    window.location.href = buildAuthUrl("register", target);
  }, []);

  const redirectToForgotPassword = useCallback((returnTo?: string | null) => {
    const target =
      returnTo ??
      (typeof window !== "undefined" ? window.location.pathname + window.location.search : null);
    window.location.href = buildAuthUrl("reset", target);
  }, []);

  const redirectToWechatBind = useCallback((returnTo?: string | null) => {
    const target =
      returnTo ??
      (typeof window !== "undefined" ? window.location.pathname + window.location.search : null);
    window.location.href = buildAuthUrl("wechat-bind", target);
  }, []);

  // 用户中心弹窗操作
  const openUserCenter = useCallback((view: UserCenterView = "profile") => {
    setUserCenterViewState(view);
    setUserCenterOpen(true);
  }, []);

  const closeUserCenter = useCallback(() => {
    setUserCenterOpen(false);
  }, []);

  const setUserCenterView = useCallback((view: UserCenterView) => {
    setUserCenterViewState(view);
  }, []);

  const refreshUser = useCallback(async (force?: boolean) => {
    // auth_hint 仅用于 UI 优化（减少不必要的 /api/user/profile 请求），
    // 不含任何凭据，被篡改/删除不会导致安全问题，仅影响用户体验。
    if (!force && typeof window !== "undefined" && !localStorage.getItem("auth_hint")) {
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetchWithAuth("/api/user/profile");
      const data = await res.json();
      if (data.success) {
        setUser(data.data.user);
        localStorage.setItem("auth_hint", "1");
      } else {
        setUser(null);
      }
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        localStorage.removeItem("auth_hint");
      }
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiPost("/api/auth/logout");
      setUser(null);
      setUserCenterOpen(false);
      localStorage.removeItem("auth_hint");
    } catch (error) {
      console.error("登出失败:", error);
    }
  }, []);

  // 初始化时获取用户信息
  useEffect(() => {
    deferInEffect(refreshUser);
  }, [refreshUser]);

  // 预取 CSRF Token（如果用户可能已登录）
  useEffect(() => {
    if (typeof window !== "undefined" && localStorage.getItem("auth_hint")) {
      fetch("/api/auth/csrf", { credentials: "include" }).catch(() => {
        // 忽略失败
      });
    }
  }, []);

  // 定时主动刷新 Access Token（每 14 分钟一次，Access Token 15 分钟过期）
  useEffect(() => {
    const AUTH_HINT_KEY = "auth_hint";
    const REFRESH_FAIL_COUNT_KEY = "__nihplod_refresh_fail_count";
    const MAX_REFRESH_FAILURES = 3; // 连续失败 3 次后停止自动刷新

    if (!user) {
      if (typeof window !== "undefined" && localStorage.getItem(AUTH_HINT_KEY)) {
        const intervalId = setInterval(
          () => {
            const failCount = parseInt(localStorage.getItem(REFRESH_FAIL_COUNT_KEY) || "0", 10);
            if (failCount >= MAX_REFRESH_FAILURES) {
              localStorage.removeItem(AUTH_HINT_KEY);
              localStorage.removeItem(REFRESH_FAIL_COUNT_KEY);
              return;
            }
            refreshAccessToken()
              .then((ok) => {
                if (ok) {
                  localStorage.setItem(REFRESH_FAIL_COUNT_KEY, "0");
                } else {
                  const count =
                    parseInt(localStorage.getItem(REFRESH_FAIL_COUNT_KEY) || "0", 10) + 1;
                  localStorage.setItem(REFRESH_FAIL_COUNT_KEY, String(count));
                }
              })
              .catch(() => {
                const count = parseInt(localStorage.getItem(REFRESH_FAIL_COUNT_KEY) || "0", 10) + 1;
                localStorage.setItem(REFRESH_FAIL_COUNT_KEY, String(count));
              });
          },
          14 * 60 * 1000
        );
        return () => clearInterval(intervalId);
      }
      return;
    }

    // 用户已登录：重置失败计数
    if (typeof window !== "undefined") {
      localStorage.setItem(REFRESH_FAIL_COUNT_KEY, "0");
    }

    const intervalId = setInterval(
      () => {
        refreshAccessToken()
          .then((ok) => {
            if (ok) {
              localStorage.setItem(REFRESH_FAIL_COUNT_KEY, "0");
            } else {
              // 静默刷新最终失败（refresh token 已过期/被吊销）：
              // 主动清除登录态，避免 UI 仍显示已登录而各面板 401 假空态
              localStorage.removeItem(AUTH_HINT_KEY);
              localStorage.removeItem(REFRESH_FAIL_COUNT_KEY);
              setUser(null);
            }
          })
          .catch(() => {
            localStorage.removeItem(AUTH_HINT_KEY);
            localStorage.removeItem(REFRESH_FAIL_COUNT_KEY);
            setUser(null);
          });
      },
      14 * 60 * 1000
    );

    return () => clearInterval(intervalId);
  }, [user]);

  const value = useMemo(
    () => ({
      user,
      isLoading,
      userCenterOpen,
      userCenterView,
      openUserCenter,
      closeUserCenter,
      setUserCenterView,
      // 登录/注册/找回/绑定入口（全部跳转到统一登录页）
      redirectToLogin,
      redirectToRegister,
      redirectToForgotPassword,
      redirectToWechatBind,
      refreshUser,
      logout,
    }),
    [
      user,
      isLoading,
      userCenterOpen,
      userCenterView,
      openUserCenter,
      closeUserCenter,
      setUserCenterView,
      redirectToLogin,
      redirectToRegister,
      redirectToForgotPassword,
      redirectToWechatBind,
      refreshUser,
      logout,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

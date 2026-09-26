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
import {
  fetchWithAuth,
  refreshAccessToken,
  UnauthorizedError,
  SESSION_EXPIRED_EVENT,
} from "@/lib/fetch-with-auth";
import { apiPost } from "@/lib/api-client";
import { deferInEffect } from "@/hooks/deferInEffect";
import type { UserCenterTab, SecuritySection } from "@/lib/user-center-tab";
import { toSecuritySection } from "@/lib/user-center-tab";

interface User {
  id: string;
  phone?: string;
  nickname?: string;
  avatar?: string;
  birthday?: string | null;
  /** 性别（male/female），null/未设置=保密；会员身份属性，可随时自助修改 */
  gender?: "male" | "female" | null;
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
  // 安全中心内部分段（设备管理/授权管理/登录历史）
  securitySection: SecuritySection;
  setSecuritySection: (section: SecuritySection) => void;
  // 登录/注册/找回/绑定入口（全部跳转到统一登录页）
  redirectToLogin: (returnTo?: string | null) => void;
  redirectToRegister: (returnTo?: string | null) => void;
  redirectToForgotPassword: (returnTo?: string | null) => void;
  redirectToWechatBind: (returnTo?: string | null) => void;
  refreshUser: (force?: boolean) => Promise<void>;
  logout: (options?: { allDevices?: boolean }) => Promise<void>;
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
  // 安全中心内部分段（默认设备管理）
  const [securitySection, setSecuritySection] = useState<SecuritySection>("devices");

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
  // 旧的安全类 tab（devices/authorizations/history）统一归一化为「安全中心 + 对应分段」，
  // 兼容历史链接（/?account=devices 等）与旧调用方。
  const openUserCenter = useCallback((view: UserCenterView = "profile") => {
    const section = view ? toSecuritySection(view) : null;
    if (section) {
      setSecuritySection(section);
      setUserCenterViewState("security");
    } else {
      setUserCenterViewState(view);
    }
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

  const logout = useCallback(async (options?: { allDevices?: boolean }) => {
    try {
      // allDevices=true 时撤销全部设备的会话并 backchannel 通知所有已授权平台（全局退出）；
      // 默认仅退出当前设备，其他设备与其他平台的会话不受影响
      await apiPost("/api/auth/logout", { allDevices: options?.allDevices === true });
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

  // 跨标签页登录态同步：监听其它标签页对 auth_hint 的写入/清除。
  // 登录/登出发生在某个标签页后，其余已打开的标签页立即同步状态，
  // 无需手动刷新页面（storage 事件仅在"其它"标签页触发，本页变化由各操作自行处理）。
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleStorage = (e: StorageEvent) => {
      if (e.key !== "auth_hint") return;
      if (e.newValue === "1") {
        // 其它标签页登录成功：强制拉取登录态（绕过 auth_hint 本地检查）
        void refreshUser(true);
      } else {
        // 其它标签页登出/登录态失效：同步清除本地 UI 状态
        setUser(null);
        setUserCenterOpen(false);
        localStorage.removeItem("__nihplod_refresh_fail_count");
        setIsLoading(false);
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [refreshUser]);

  // 预取 CSRF Token（如果用户可能已登录）
  useEffect(() => {
    if (typeof window !== "undefined" && localStorage.getItem("auth_hint")) {
      fetch("/api/auth/csrf", { credentials: "include" }).catch(() => {
        // 忽略失败
      });
    }
  }, []);

  // 会话终结处理：清态 + 跳登录页（expired=1 让登录页提示"登录已过期"）。
  // 触发源：任一接口 401 且静默刷新最终失败（SESSION_EXPIRED_EVENT），
  // 或下方周期性刷新发现 refresh token 已失效（如全局退出/令牌被吊销）。
  const handleSessionExpired = useCallback(() => {
    if (typeof window === "undefined") return;
    // 仅"曾处于登录态"时反应：游客访问公开接口的 401 不应触发跳转
    if (!user && !localStorage.getItem("auth_hint")) return;
    localStorage.removeItem("auth_hint");
    localStorage.removeItem("__nihplod_refresh_fail_count");
    setUser(null);
    setUserCenterOpen(false);
    const returnTo = window.location.pathname + window.location.search;
    window.location.href = `${buildAuthUrl("login", returnTo)}&expired=1`;
  }, [user]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
  }, [handleSessionExpired]);

  // 定时主动刷新 Access Token（每 119 分钟一次，Access Token 2 小时过期）
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
              .then((result) => {
                if (result.ok) {
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
          119 * 60 * 1000
        );
        return () => clearInterval(intervalId);
      }
      return;
    }

    // 用户已登录：重置失败计数
    if (typeof window !== "undefined") {
      localStorage.setItem(REFRESH_FAIL_COUNT_KEY, "0");
    }

    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    /** 记录一次可恢复失败；连续失败达上限才判定会话终结（防网络抖动误登出） */
    const handleRetryableFailure = () => {
      const count = parseInt(localStorage.getItem(REFRESH_FAIL_COUNT_KEY) || "0", 10) + 1;
      if (count >= MAX_REFRESH_FAILURES) {
        handleSessionExpired();
        return;
      }
      localStorage.setItem(REFRESH_FAIL_COUNT_KEY, String(count));
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = setTimeout(() => void attemptRefresh(), 60 * 1000);
    };

    const attemptRefresh = () => {
      refreshAccessToken()
        .then((result) => {
          if (result.ok) {
            localStorage.setItem(REFRESH_FAIL_COUNT_KEY, "0");
            return;
          }
          if (result.kind === "fatal") {
            // 服务端明确判定会话终结（令牌被吊销/设备超限等）
            handleSessionExpired();
            return;
          }
          handleRetryableFailure();
        })
        .catch(() => {
          handleRetryableFailure();
        });
    };

    const intervalId = setInterval(() => void attemptRefresh(), 14 * 60 * 1000);

    return () => {
      clearInterval(intervalId);
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [user, handleSessionExpired]);

  const value = useMemo(
    () => ({
      user,
      isLoading,
      userCenterOpen,
      userCenterView,
      openUserCenter,
      closeUserCenter,
      setUserCenterView,
      securitySection,
      setSecuritySection,
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
      securitySection,
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

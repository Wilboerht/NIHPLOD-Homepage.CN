"use client";

import { createContext, useContext, useState, useCallback, useMemo, ReactNode, useEffect } from "react";
import { fetchWithAuth, refreshAccessToken, UnauthorizedError } from "@/lib/fetch-with-auth";
import { apiPost } from "@/lib/api-client";

interface User {
  id: string;
  phone?: string;
  nickname?: string;
  avatar?: string;
}

type ModalType = "login" | "register" | "forgot-password" | "wechat-bind" | null;

// 用户中心视图类型
export type UserCenterView = "profile" | "orders" | "addresses" | "coupons" | null;

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  activeModal: ModalType;
  // 用户中心弹窗状态
  userCenterOpen: boolean;
  userCenterView: UserCenterView;
  initialOrderId: string | null; // 打开订单面板时自动展示的订单 ID
  openUserCenter: (view?: UserCenterView, orderId?: string) => void;
  closeUserCenter: () => void;
  setUserCenterView: (view: UserCenterView) => void;
  clearInitialOrderId: () => void;
  // 结算弹窗状态
  checkoutOpen: boolean;
  checkoutSelectedProductIds: string[] | null;
  checkoutQuantities: Record<string, number> | null;
  openCheckout: (selectedProductIds?: string[], quantities?: Record<string, number>) => void;
  closeCheckout: () => void;
  // 支付弹窗状态
  payOpen: boolean;
  payOrderId: string | null;
  openPay: (orderId: string) => void;
  closePay: () => void;
  // 登录弹窗
  openLoginModal: () => void;
  openRegisterModal: () => void;
  openForgotPasswordModal: () => void;
  openWechatBindModal: () => void;
  closeModal: () => void;
  switchToLogin: () => void;
  switchToRegister: () => void;
  switchToForgotPassword: () => void;
  switchToWechatBind: () => void;
  refreshUser: (force?: boolean) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeModal, setActiveModal] = useState<ModalType>(null);

  // 用户中心弹窗状态
  const [userCenterOpen, setUserCenterOpen] = useState(false);
  const [userCenterView, setUserCenterViewState] = useState<UserCenterView>("profile");
  const [initialOrderId, setInitialOrderId] = useState<string | null>(null);

  // 结算弹窗状态
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutSelectedProductIds, setCheckoutSelectedProductIds] = useState<string[] | null>(
    null
  );
  const [checkoutQuantities, setCheckoutQuantities] = useState<Record<string, number> | null>(null);

  // 支付弹窗状态
  const [payOpen, setPayOpen] = useState(false);
  const [payOrderId, setPayOrderId] = useState<string | null>(null);

  const openLoginModal = useCallback(() => setActiveModal("login"), []);
  const openRegisterModal = useCallback(() => setActiveModal("register"), []);
  const openForgotPasswordModal = useCallback(() => setActiveModal("forgot-password"), []);
  const openWechatBindModal = useCallback(() => setActiveModal("wechat-bind"), []);
  const closeModal = useCallback(() => setActiveModal(null), []);
  const switchToLogin = useCallback(() => setActiveModal("login"), []);
  const switchToRegister = useCallback(() => setActiveModal("register"), []);
  const switchToForgotPassword = useCallback(() => setActiveModal("forgot-password"), []);
  const switchToWechatBind = useCallback(() => setActiveModal("wechat-bind"), []);

  // 用户中心弹窗操作
  const openUserCenter = useCallback((view: UserCenterView = "profile", orderId?: string) => {
    setUserCenterViewState(view);
    if (orderId) {
      setInitialOrderId(orderId);
    }
    setUserCenterOpen(true);
  }, []);

  const closeUserCenter = useCallback(() => {
    setUserCenterOpen(false);
    setInitialOrderId(null);
  }, []);

  const setUserCenterView = useCallback((view: UserCenterView) => {
    setUserCenterViewState(view);
  }, []);

  const clearInitialOrderId = useCallback(() => {
    setInitialOrderId(null);
  }, []);

  // 结算弹窗操作
  const openCheckout = useCallback(
    (selectedProductIds?: string[], quantities?: Record<string, number>) => {
      if (selectedProductIds && selectedProductIds.length > 0) {
        setCheckoutSelectedProductIds(selectedProductIds);
        setCheckoutQuantities(quantities || null);
      } else {
        setCheckoutSelectedProductIds(null);
        setCheckoutQuantities(null);
      }
      setCheckoutOpen(true);
    },
    []
  );

  const closeCheckout = useCallback(() => {
    setCheckoutOpen(false);
    setCheckoutSelectedProductIds(null);
    setCheckoutQuantities(null);
  }, []);

  // 支付弹窗操作
  const openPay = useCallback((orderId: string) => {
    setPayOrderId(orderId);
    setPayOpen(true);
  }, []);

  const closePay = useCallback(() => {
    setPayOpen(false);
    setPayOrderId(null);
  }, []);

  const refreshUser = useCallback(async (force?: boolean) => {
    // 如果没有前端认证提示且非强制刷新，跳过请求（避免未登录用户产生 401）
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
    refreshUser();
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
    if (!user) {
      // 即使 user 为 null，如果存在 auth_hint 则仍尝试恢复登录态
      if (typeof window !== "undefined" && localStorage.getItem("auth_hint")) {
        const intervalId = setInterval(
          () => {
            refreshAccessToken().catch(() => {});
          },
          14 * 60 * 1000
        );
        return () => clearInterval(intervalId);
      }
      return;
    }

    const intervalId = setInterval(
      () => {
        refreshAccessToken().catch(() => {});
      },
      14 * 60 * 1000
    );

    return () => clearInterval(intervalId);
  }, [user]);

  const value = useMemo(
    () => ({
      user,
      isLoading,
      activeModal,
      userCenterOpen,
      userCenterView,
      initialOrderId,
      openUserCenter,
      closeUserCenter,
      setUserCenterView,
      clearInitialOrderId,
      checkoutOpen,
      checkoutSelectedProductIds,
      checkoutQuantities,
      openCheckout,
      closeCheckout,
      payOpen,
      payOrderId,
      openPay,
      closePay,
      openLoginModal,
      openRegisterModal,
      openForgotPasswordModal,
      openWechatBindModal,
      closeModal,
      switchToLogin,
      switchToRegister,
      switchToForgotPassword,
      switchToWechatBind,
      refreshUser,
      logout,
    }),
    [
      user,
      isLoading,
      activeModal,
      userCenterOpen,
      userCenterView,
      initialOrderId,
      openUserCenter,
      closeUserCenter,
      setUserCenterView,
      clearInitialOrderId,
      checkoutOpen,
      checkoutSelectedProductIds,
      checkoutQuantities,
      openCheckout,
      closeCheckout,
      payOpen,
      payOrderId,
      openPay,
      closePay,
      openLoginModal,
      openRegisterModal,
      openForgotPasswordModal,
      openWechatBindModal,
      closeModal,
      switchToLogin,
      switchToRegister,
      switchToForgotPassword,
      switchToWechatBind,
      refreshUser,
      logout,
    ]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

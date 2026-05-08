"use client";

import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from "react";

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
  // 联系我们弹窗状态
  contactOpen: boolean;
  contactDefaultType: string | null;
  openContact: (defaultType?: string) => void;
  closeContact: () => void;
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
  refreshUser: () => Promise<void>;
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
  const [checkoutSelectedProductIds, setCheckoutSelectedProductIds] = useState<string[] | null>(null);
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
  const openCheckout = useCallback((selectedProductIds?: string[], quantities?: Record<string, number>) => {
    if (selectedProductIds && selectedProductIds.length > 0) {
      setCheckoutSelectedProductIds(selectedProductIds);
      setCheckoutQuantities(quantities || null);
    } else {
      setCheckoutSelectedProductIds(null);
      setCheckoutQuantities(null);
    }
    setCheckoutOpen(true);
  }, []);

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

  // 联系我们弹窗状态
  const [contactOpen, setContactOpen] = useState(false);
  const [contactDefaultType, setContactDefaultType] = useState<string | null>(null);
  const openContact = useCallback((defaultType?: string) => {
    if (defaultType) {
      setContactDefaultType(defaultType);
    }
    setContactOpen(true);
  }, []);
  const closeContact = useCallback(() => {
    setContactOpen(false);
    setContactDefaultType(null);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const res = await fetch("/api/user/profile");
      const data = await res.json();
      if (data.success) {
        setUser(data.data.user);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setUser(null);
      setUserCenterOpen(false);
    } catch (error) {
      console.error("登出失败:", error);
    }
  }, []);

  // 初始化时获取用户信息
  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  return (
    <AuthContext.Provider
      value={{
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
        contactOpen,
        contactDefaultType,
        openContact,
        closeContact,
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
      }}
    >
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


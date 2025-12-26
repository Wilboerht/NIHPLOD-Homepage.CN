"use client";

import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from "react";

interface User {
  id: string;
  phone?: string;
  nickname?: string;
  avatar?: string;
  points: number;
}

type ModalType = "login" | "register" | "forgot-password" | null;

// 用户中心视图类型
export type UserCenterView = "profile" | "orders" | "addresses" | "points" | null;

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  activeModal: ModalType;
  // 用户中心弹窗状态
  userCenterOpen: boolean;
  userCenterView: UserCenterView;
  openUserCenter: (view?: UserCenterView) => void;
  closeUserCenter: () => void;
  setUserCenterView: (view: UserCenterView) => void;
  // 登录弹窗
  openLoginModal: () => void;
  openRegisterModal: () => void;
  openForgotPasswordModal: () => void;
  closeModal: () => void;
  switchToLogin: () => void;
  switchToRegister: () => void;
  switchToForgotPassword: () => void;
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

  const openLoginModal = useCallback(() => setActiveModal("login"), []);
  const openRegisterModal = useCallback(() => setActiveModal("register"), []);
  const openForgotPasswordModal = useCallback(() => setActiveModal("forgot-password"), []);
  const closeModal = useCallback(() => setActiveModal(null), []);
  const switchToLogin = useCallback(() => setActiveModal("login"), []);
  const switchToRegister = useCallback(() => setActiveModal("register"), []);
  const switchToForgotPassword = useCallback(() => setActiveModal("forgot-password"), []);

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
        openUserCenter,
        closeUserCenter,
        setUserCenterView,
        openLoginModal,
        openRegisterModal,
        openForgotPasswordModal,
        closeModal,
        switchToLogin,
        switchToRegister,
        switchToForgotPassword,
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


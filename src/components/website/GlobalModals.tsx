"use client";

/**
 * 全局模态框组件 - 包含所有需要的模态框
 */
import { useEffect, useState } from "react";
import { AuthModal } from "./AuthModal";
import { UserCenterModal } from "./UserCenterModal";
import { CheckoutModal } from "./CheckoutModal";
import PayModal from "./PayModal";

export function GlobalModals() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 确保客户端渲染 - SSG 期间返回 null 是正常行为
  if (!mounted) {
    return null;
  }

  return (
    <>
      {/* 登录模态框 */}
      <AuthModal />
      {/* 用户中心弹窗 */}
      <UserCenterModal />
      {/* 结算弹窗 */}
      <CheckoutModal />
      {/* 支付弹窗 */}
      <PayModal />
    </>
  );
}

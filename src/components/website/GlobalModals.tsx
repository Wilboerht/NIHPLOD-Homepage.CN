"use client";

/**
 * 全局模态框组件 - 包含所有需要的模态框
 */
import { useEffect, useState } from "react";
import { AuthModal } from "./AuthModal";
import { UserCenterModal } from "./UserCenterModal";
import { CheckoutModal } from "./CheckoutModal";
import PayModal from "./PayModal";
import { ContactModal } from "./ContactModal";

export function GlobalModals() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    console.log("[GlobalModals] useEffect running, setting mounted to true");
    setMounted(true);
  }, []);

  console.log("[GlobalModals] Component function called, mounted:", mounted);

  // 确保客户端渲染
  if (!mounted) {
    console.log("[GlobalModals] Not mounted yet, returning null");
    return null;
  }

  console.log("[GlobalModals] Rendering modals...");

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
      {/* 联系我们弹窗 */}
      <ContactModal />
    </>
  );
}


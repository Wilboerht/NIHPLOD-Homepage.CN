"use client";

/**
 * 全局模态框组件 - 包含所有需要的模态框
 *
 * 性能优化：用户中心模态框通过 next/dynamic 懒加载（ssr: false），
 * 仅在挂载后按需加载对应 chunk，避免用户中心等重逻辑进入每个前台页面的首屏 JS。
 */
import dynamic from "next/dynamic";
import { useMounted } from "@/hooks/useMounted";
import { useAuth } from "@/contexts/AuthContext";

const UserCenterModal = dynamic(() => import("./UserCenterModal").then((m) => m.UserCenterModal), {
  ssr: false,
});

export function GlobalModals() {
  const mounted = useMounted();
  const { userCenterOpen } = useAuth();

  // 确保客户端渲染 - SSG 期间返回 null 是正常行为；
  // 用户中心只在打开时挂载，避免所有访客下载积分商城等大面板。
  if (!mounted || !userCenterOpen) {
    return null;
  }

  return (
    <>
      {/* 用户中心弹窗 */}
      <UserCenterModal />
    </>
  );
}

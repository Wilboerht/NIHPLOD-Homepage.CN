"use client";

/**
 * 全局模态框组件 - 包含所有需要的模态框
 *
 * 性能优化：用户中心模态框通过 next/dynamic 懒加载（ssr: false），
 * 仅在挂载后按需加载对应 chunk，避免用户中心（含 @pansy/china-division 地址数据）
 * 等重逻辑进入每个前台页面的首屏 JS。
 */
import dynamic from "next/dynamic";
import { useMounted } from "@/hooks/useMounted";

const UserCenterModal = dynamic(() => import("./UserCenterModal").then((m) => m.UserCenterModal), {
  ssr: false,
});

export function GlobalModals() {
  const mounted = useMounted();

  // 确保客户端渲染 - SSG 期间返回 null 是正常行为
  if (!mounted) {
    return null;
  }

  return (
    <>
      {/* 用户中心弹窗 */}
      <UserCenterModal />
    </>
  );
}

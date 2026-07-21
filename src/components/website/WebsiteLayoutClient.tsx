"use client";

import { ReactNode, useEffect } from "react";
import { usePathname } from "next/navigation";
import { LayoutProvider } from "@/contexts/LayoutContext";
import { BottomNavBar } from "@/components/website/BottomNavBar";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/Toast";
import { cn, isBottomNavHiddenRoute } from "@/lib/utils";

/**
 * MainContent
 *
 * 全局唯一的 <main> 容器。
 * 仅在当前路由显示 BottomNavBar 时保留底部 padding（pb-28 lg:pb-24），
 * 避免产品详情页等隐藏导航的页面底部露出全局 Kinetic 背景。
 */
export function MainContent({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const showNavPadding = !isBottomNavHiddenRoute(pathname);

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className={cn(
        "pointer-events-none relative z-10 [&>*]:pointer-events-auto",
        showNavPadding && "pb-28 lg:pb-24"
      )}
    >
      {children}
    </main>
  );
}

/**
 * WebsiteLayoutClient
 *
 * 作用：
 * 1. 提供 LayoutContext (管理抽屉状态)
 * 2. 渲染全局单一的 BottomNavBar (避免页面切换时的闪烁)
 * 3. 包装页面内容
 */
export function WebsiteLayoutClient({ children }: { children: ReactNode }) {
  const { refreshUser, openUserCenter, openWechatBindModal } = useAuth();
  const toast = useToast();

  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const wechatAuth = params.get("wechat_auth");
    if (!wechatAuth) return;

    // 清理 URL 参数
    const cleanUrl = window.location.pathname + window.location.hash;
    window.history.replaceState({}, document.title, cleanUrl);

    if (wechatAuth === "success") {
      refreshUser(true).then(() => {
        openUserCenter();
      });
    } else if (wechatAuth === "binding_required") {
      openWechatBindModal();
    } else if (wechatAuth === "error") {
      const message = params.get("message") || "微信授权失败";
      toast.error(decodeURIComponent(message));
    }
  }, [refreshUser, openUserCenter, openWechatBindModal, toast]);

  return (
    <LayoutProvider>
      {children}
      <BottomNavBar />
    </LayoutProvider>
  );
}

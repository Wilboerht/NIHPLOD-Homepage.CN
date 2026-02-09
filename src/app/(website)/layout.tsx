import { ReactNode } from "react";
import { GlobalModals } from "@/components/website";

interface WebsiteLayoutProps {
  children: ReactNode;
}

import Image from "next/image";

import { WebsiteLayoutClient } from "@/components/website/WebsiteLayoutClient";

/**
 * 前台网站布局
 */
export default function WebsiteLayout({ children }: WebsiteLayoutProps) {
  return (
    <div className="min-h-screen">
      {/* Skip to main content 链接 - 可访问性 */}


      {/* 全局共享背景 - 消除页面切换闪烁 */}
      <div className="fullscreen-bg-base" />


      {/* 主内容区域，包含 NavBar 逻辑 */}
      <WebsiteLayoutClient>
        <main id="main-content" tabIndex={-1} className="relative z-10">
          {children}
        </main>
      </WebsiteLayoutClient>

      {/* 全局模态框 */}
      <GlobalModals />
    </div>
  );
}

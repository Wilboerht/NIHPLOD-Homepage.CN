import { ReactNode } from "react";
import { GlobalModals, KineticBackground } from "@/components/website";

interface WebsiteLayoutProps {
  children: ReactNode;
}

import { WebsiteLayoutClient, MainContent } from "@/components/website/WebsiteLayoutClient";

/**
 * 前台网站布局
 */
export default function WebsiteLayout({ children }: WebsiteLayoutProps) {
  return (
    <div className="min-h-dvh">
      {/* Skip to main content 链接 - 可访问性 */}
      <a href="#main-content" className="skip-link">
        跳转到主要内容
      </a>

      {/* 主内容区域，包含 NavBar 逻辑 + 全局背景 */}
      <WebsiteLayoutClient>
        {/* Graphite Kinetic Grid 全局背景 - 纯 CSS 定位，不依赖抽屉状态 */}
        <KineticBackground />
        <MainContent>{children}</MainContent>
      </WebsiteLayoutClient>

      {/* 全局模态框 */}
      <GlobalModals />
    </div>
  );
}

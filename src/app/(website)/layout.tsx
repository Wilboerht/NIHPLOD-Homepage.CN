import { ReactNode } from "react";
import { GlobalModals, KineticBackground } from "@/components/website";

interface WebsiteLayoutProps {
  children: ReactNode;
}

import { WebsiteLayoutClient } from "@/components/website/WebsiteLayoutClient";

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

      {/* Graphite Kinetic Grid 全局背景 */}
      <KineticBackground />

      {/* 主内容区域，包含 NavBar 逻辑 */}
      <WebsiteLayoutClient>
        <main
          id="main-content"
          tabIndex={-1}
          className="pointer-events-none relative z-10 pb-28 lg:pb-24 [&>*]:pointer-events-auto"
        >
          {children}
        </main>
      </WebsiteLayoutClient>

      {/* 全局模态框 */}
      <GlobalModals />
    </div>
  );
}

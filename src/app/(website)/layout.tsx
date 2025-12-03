import { ReactNode } from "react";
import { Header } from "@/components/website";

interface WebsiteLayoutProps {
  children: ReactNode;
}

/**
 * 前台网站布局
 * 包含底部固定导航栏
 * 注意：首页等全屏页面需要自行处理底部导航栏的空间（pb-16 lg:pb-20）
 */
export default function WebsiteLayout({ children }: WebsiteLayoutProps) {
  return (
    <div className="min-h-screen">
      {/* Skip to main content 链接 - 可访问性 */}
      <a href="#main-content" className="skip-link">
        跳至主要内容
      </a>

      {/* 主内容区域 */}
      <main id="main-content" tabIndex={-1}>
        {children}
      </main>

      {/* 底部固定导航栏 */}
      <Header />
    </div>
  );
}

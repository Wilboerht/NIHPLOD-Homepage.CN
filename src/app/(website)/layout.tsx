import { ReactNode } from "react";
import { AuthProvider } from "@/contexts/AuthContext";
import { GlobalModals } from "@/components/website";

interface WebsiteLayoutProps {
  children: ReactNode;
}

/**
 * 前台网站布局
 */
export default function WebsiteLayout({ children }: WebsiteLayoutProps) {
  return (
    <AuthProvider>
      <div className="min-h-screen">
        {/* Skip to main content 链接 - 可访问性 */}
        <a href="#main-content" className="skip-link">
          跳至主要内容
        </a>

        {/* 主内容区域 */}
        <main id="main-content" tabIndex={-1}>
          {children}
        </main>

        {/* 全局模态框 */}
        <GlobalModals />
      </div>
    </AuthProvider>
  );
}

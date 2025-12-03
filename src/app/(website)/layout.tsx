import { ReactNode } from "react";

interface WebsiteLayoutProps {
  children: ReactNode;
}

/**
 * 前台网站布局
 * 包含导航栏和页脚
 */
export default function WebsiteLayout({ children }: WebsiteLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col">
      {/* TODO: Header 组件 */}
      <header className="sticky top-0 z-50 bg-brand-cream/80 backdrop-blur-md">
        <nav className="container-wide px-s py-4">
          <div className="flex items-center justify-between">
            <span className="font-serif text-xl text-brand-charcoal">NIHPLOD</span>
            <span className="text-sm text-brand-charcoal/60">导航占位</span>
          </div>
        </nav>
      </header>

      {/* 主内容区域 */}
      <main className="flex-1">{children}</main>

      {/* TODO: Footer 组件 */}
      <footer className="bg-brand-charcoal py-l">
        <div className="container-wide px-s text-center text-brand-cream/60">
          <p className="text-sm">© 2024 NIHPLOD. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

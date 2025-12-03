"use client";

import { ReactNode } from "react";

interface FloatingCardLayoutProps {
  children: ReactNode;
  className?: string;
}

/**
 * 浮动卡片布局组件
 * TODO: 实现完整功能
 */
export function FloatingCardLayout({ children, className = "" }: FloatingCardLayoutProps) {
  return (
    <div className={`relative ${className}`}>
      <div className="rounded-lg bg-white p-6 shadow-lg">{children}</div>
    </div>
  );
}

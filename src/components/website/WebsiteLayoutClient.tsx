"use client";

import { ReactNode } from "react";
import { LayoutProvider } from "@/contexts/LayoutContext";
import { BottomNavBar } from "@/components/website/BottomNavBar";

/**
 * WebsiteLayoutClient
 * 
 * 作用：
 * 1. 提供 LayoutContext (管理抽屉状态)
 * 2. 渲染全局单一的 BottomNavBar (避免页面切换时的闪烁)
 * 3. 包装页面内容
 */
export function WebsiteLayoutClient({ children }: { children: ReactNode }) {
    return (
        <LayoutProvider>
            {children}
            <BottomNavBar />
        </LayoutProvider>
    );
}

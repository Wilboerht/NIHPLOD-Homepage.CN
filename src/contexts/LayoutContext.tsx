"use client";

import { createContext, useContext, useState, ReactNode } from "react";

interface LayoutContextType {
    /** 抽屉是否展开 */
    isDrawerOpen: boolean;
    /** 设置抽屉展开状态 */
    setDrawerOpen: (isOpen: boolean) => void;
}

const LayoutContext = createContext<LayoutContextType | undefined>(undefined);

export function LayoutProvider({ children }: { children: ReactNode }) {
    // 默认为 true，因为大多数页面加载时抽屉都会自动展开
    // 这样可以避免页面导航时底部栏闪烁
    const [isDrawerOpen, setDrawerOpen] = useState(true);

    // 包装 setState 以避免不必要的重渲染? 暂不需要，直接传递
    // console.log("[LayoutContext] isDrawerOpen:", isDrawerOpen);

    return (
        <LayoutContext.Provider value={{ isDrawerOpen, setDrawerOpen }}>
            {children}
        </LayoutContext.Provider>
    );
}

export function useLayout() {
    const context = useContext(LayoutContext);
    if (context === undefined) {
        throw new Error("useLayout must be used within a LayoutProvider");
    }
    return context;
}

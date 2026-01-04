"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";

interface LayoutContextType {
    /** 抽屉是否展开 */
    isDrawerOpen: boolean;
    /** 设置抽屉展开状态 */
    setDrawerOpen: (isOpen: boolean) => void;
}

const LayoutContext = createContext<LayoutContextType | undefined>(undefined);

export function LayoutProvider({ children }: { children: ReactNode }) {
    const [isDrawerOpen, setDrawerOpen] = useState(false);

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

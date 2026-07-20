"use client";

import { createContext, useContext, useState, useMemo, type ReactNode } from "react";

interface LayoutContextType {
  /** 抽屉是否展开 */
  isDrawerOpen: boolean;
  /** 设置抽屉展开状态 */
  setDrawerOpen: (isOpen: boolean) => void;
  /** 底部导航菜单是否展开 */
  isNavMenuOpen: boolean;
  /** 设置底部导航菜单展开状态 */
  setNavMenuOpen: (isOpen: boolean) => void;
  /** 抽屉是否正在播放入场/出场动画 */
  isDrawerAnimating: boolean;
  /** 设置抽屉动画状态 */
  setDrawerAnimating: (isAnimating: boolean) => void;
}

const LayoutContext = createContext<LayoutContextType | undefined>(undefined);

export function LayoutProvider({ children }: { children: ReactNode }) {
  // 默认为 true，因为大多数页面加载时抽屉都会自动展开
  // 这样可以避免页面导航时底部栏闪烁
  const [isDrawerOpen, setDrawerOpen] = useState(true);
  const [isNavMenuOpen, setNavMenuOpen] = useState(false);
  const [isDrawerAnimating, setDrawerAnimating] = useState(false);

  const value = useMemo(
    () => ({
      isDrawerOpen,
      setDrawerOpen,
      isNavMenuOpen,
      setNavMenuOpen,
      isDrawerAnimating,
      setDrawerAnimating,
    }),
    [isDrawerOpen, isNavMenuOpen, isDrawerAnimating]
  );

  return <LayoutContext.Provider value={value}>{children}</LayoutContext.Provider>;
}

export function useLayout() {
  const context = useContext(LayoutContext);
  if (context === undefined) {
    throw new Error("useLayout must be used within a LayoutProvider");
  }
  return context;
}

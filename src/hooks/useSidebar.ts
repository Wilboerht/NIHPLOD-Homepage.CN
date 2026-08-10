/**
 * 侧边栏状态管理 Hook
 */
"use client";

import { useState, useCallback } from "react";
import { useMediaQuery } from "./useMediaQuery";
import { useScrollLock } from "./useScrollLock";

interface UseSidebarReturn {
  isOpen: boolean;
  isCollapsed: boolean;
  isMobile: boolean;
  toggle: () => void;
  open: () => void;
  close: () => void;
  toggleCollapse: () => void;
}

/**
 * 侧边栏状态 Hook
 * - 移动端：侧边栏默认隐藏，点击按钮展开覆盖层
 * - 桌面端：侧边栏默认展开，可折叠为图标模式
 */
export function useSidebar(): UseSidebarReturn {
  const isMobile = useMediaQuery("(max-width: 768px)");

  // 移动端：侧边栏打开/关闭状态
  const [isOpen, setIsOpen] = useState(false);

  // 桌面端：侧边栏折叠/展开状态
  const [isCollapsed, setIsCollapsed] = useState(false);

  // 切换侧边栏状态
  const toggle = useCallback(() => {
    if (isMobile) {
      setIsOpen((prev) => !prev);
    } else {
      setIsCollapsed((prev) => !prev);
    }
  }, [isMobile]);

  // 打开侧边栏（移动端）
  const open = useCallback(() => {
    setIsOpen(true);
  }, []);

  // 关闭侧边栏（移动端）
  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  // 折叠/展开侧边栏（桌面端）
  const toggleCollapse = useCallback(() => {
    setIsCollapsed((prev) => !prev);
  }, []);

  // 切换到桌面模式时关闭移动端侧边栏（渲染阶段同步派生状态，避免 effect 内 setState）
  const [prevIsMobile, setPrevIsMobile] = useState(isMobile);
  if (prevIsMobile !== isMobile) {
    setPrevIsMobile(isMobile);
    if (!isMobile && isOpen) {
      setIsOpen(false);
    }
  }

  // 使用全局共享的滚动锁，与其他弹窗（Modal、CartDrawer）协同，避免互相覆盖
  useScrollLock(isMobile && isOpen);

  return {
    isOpen,
    isCollapsed,
    isMobile,
    toggle,
    open,
    close,
    toggleCollapse,
  };
}

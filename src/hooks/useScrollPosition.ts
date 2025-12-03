"use client";

import { useState, useEffect } from "react";

interface ScrollPosition {
  x: number;
  y: number;
}

/**
 * 滚动位置 Hook
 */
export function useScrollPosition(): ScrollPosition {
  const [scrollPosition, setScrollPosition] = useState<ScrollPosition>({
    x: 0,
    y: 0,
  });

  useEffect(() => {
    const handleScroll = () => {
      setScrollPosition({
        x: window.scrollX,
        y: window.scrollY,
      });
    };

    // 初始位置
    handleScroll();

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return scrollPosition;
}

/**
 * 判断是否滚动过某个位置
 */
export function useHasScrolled(threshold: number = 0): boolean {
  const { y } = useScrollPosition();
  return y > threshold;
}

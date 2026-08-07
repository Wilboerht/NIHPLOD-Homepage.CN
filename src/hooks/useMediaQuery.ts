"use client";

import { useState, useEffect } from "react";

function getInitialMatch(query: string): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(query).matches;
}

/**
 * 媒体查询 Hook
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => getInitialMatch(query));

  useEffect(() => {
    const media = window.matchMedia(query);
    setMatches(media.matches);
    const listener = (e: MediaQueryListEvent) => setMatches(e.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, [query]);

  return matches;
}

// 预定义断点 — 与 Tailwind lg: 断点（1024px）对齐
export function useIsMobile() {
  return useMediaQuery("(max-width: 1023px)");
}

export function useIsDesktop() {
  return useMediaQuery("(min-width: 1024px)");
}

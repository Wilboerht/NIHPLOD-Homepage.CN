"use client";

import { useEffect, useRef } from "react";

/**
 * 全局 body 滚动锁计数器，防止多个弹窗同时关闭时互相覆盖。
 * 只有计数归零时才恢复滚动。
 */
let scrollLockCount = 0;
let savedOverflow = "";

function lockScroll() {
  if (scrollLockCount === 0) {
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  scrollLockCount++;
}

function unlockScroll() {
  scrollLockCount = Math.max(0, scrollLockCount - 1);
  if (scrollLockCount === 0) {
    document.body.style.overflow = savedOverflow || "unset";
  }
}

/**
 * 在组件挂载/更新时锁定 body 滚动，卸载时解锁。
 * @param active 是否激活锁定
 */
export function useScrollLock(active: boolean) {
  const prevActive = useRef(false);

  useEffect(() => {
    if (active && !prevActive.current) {
      lockScroll();
      prevActive.current = true;
    } else if (!active && prevActive.current) {
      unlockScroll();
      prevActive.current = false;
    }
    return () => {
      if (prevActive.current) {
        unlockScroll();
        prevActive.current = false;
      }
    };
  }, [active]);
}

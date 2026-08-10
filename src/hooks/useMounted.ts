"use client";

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

/**
 * 判断组件是否已在客户端挂载（hydration 守卫）
 *
 * 使用 useSyncExternalStore 实现：服务端渲染返回 false，客户端水合后返回 true，
 * 无需 useEffect + setState（避免 effect 内同步 setState 导致的级联渲染）。
 */
export function useMounted(): boolean {
  return useSyncExternalStore(noopSubscribe, getClientSnapshot, getServerSnapshot);
}

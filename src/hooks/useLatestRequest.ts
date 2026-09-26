"use client";

import { useCallback, useRef } from "react";

/**
 * 竞态保护：快速切换分页/筛选/搜索时丢弃过期响应，避免旧数据覆盖新数据。
 *
 * ```ts
 * const takeLatest = useLatestRequest();
 * const fetchList = useCallback(async () => {
 *   const isLatest = takeLatest();
 *   setLoading(true);
 *   try {
 *     const data = await apiGet(...);
 *     if (!isLatest()) return;
 *     setData(data);
 *   } finally {
 *     if (isLatest()) setLoading(false);
 *   }
 * }, [takeLatest]);
 * ```
 */
export function useLatestRequest() {
  const seqRef = useRef(0);
  return useCallback(() => {
    const seq = ++seqRef.current;
    return () => seq === seqRef.current;
  }, []);
}

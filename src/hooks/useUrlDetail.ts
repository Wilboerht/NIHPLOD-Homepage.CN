"use client";

import { useCallback, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * 详情抽屉 URL 状态：
 * - open(id) 写入 `?param=id`，刷新/分享可恢复
 * - close() 优先回退到打开前的历史记录；直接访问链接时仅移除参数
 *
 * 表单类弹窗不使用本 Hook，避免把未保存草稿带进 URL。
 */
export function useUrlDetail(param: string) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const openedByUserRef = useRef(false);
  const value = searchParams.get(param);

  const buildHref = useCallback(
    (nextValue: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (nextValue) params.set(param, nextValue);
      else params.delete(param);
      const query = params.toString();
      return `${pathname}${query ? `?${query}` : ""}`;
    },
    [param, pathname, searchParams]
  );

  const open = useCallback(
    (id: string) => {
      if (value === id) return;
      openedByUserRef.current = true;
      router.push(buildHref(id), { scroll: false });
    },
    [buildHref, router, value]
  );

  const close = useCallback(() => {
    if (openedByUserRef.current) {
      openedByUserRef.current = false;
      router.back();
      return;
    }
    router.replace(buildHref(null), { scroll: false });
  }, [buildHref, router]);

  return { value, open, close, isOpen: Boolean(value) };
}

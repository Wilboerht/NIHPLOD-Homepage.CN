"use client";

/**
 * 管理端列表 URL 状态工具
 *
 * 约定：
 * - 列表的 page/pageSize/筛选/搜索统一写入 URL，刷新、分享、前进后退都能恢复；
 * - 空值与默认值不写入 URL，保持链接简洁；
 * - 修改筛选时默认回到第 1 页；
 * - 输入搜索建议 replace（避免历史记录爆炸），翻页/筛选可按需 push。
 */
import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type ListParamValue = string | number | null | undefined;

export interface ListQueryUpdateOptions {
  /** 是否用 replace 代替 push（搜索输入防抖时建议 true） */
  replace?: boolean;
  /** 未显式传 page 时是否重置到第 1 页（默认 true） */
  resetPage?: boolean;
}

export function clampPage(page: number, totalPages?: number): number {
  const safePage = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
  if (!totalPages || totalPages < 1) return safePage;
  return Math.min(safePage, totalPages);
}

export function useListQuery() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const get = useCallback(
    (key: string, fallback = ""): string => searchParams.get(key) ?? fallback,
    [searchParams]
  );

  const getNumber = useCallback(
    (key: string, fallback: number, min = 1): number => {
      const raw = Number(searchParams.get(key));
      return Number.isFinite(raw) && raw >= min ? Math.floor(raw) : fallback;
    },
    [searchParams]
  );

  const update = useCallback(
    (updates: Record<string, ListParamValue>, options: ListQueryUpdateOptions = {}) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === undefined || value === "") {
          params.delete(key);
        } else {
          params.set(key, String(value));
        }
      }

      if (options.resetPage !== false && !("page" in updates)) {
        params.delete("page");
      }

      const query = params.toString();
      const href = `${pathname}${query ? `?${query}` : ""}`;
      if (options.replace) {
        router.replace(href, { scroll: false });
      } else {
        router.push(href);
      }
    },
    [pathname, router, searchParams]
  );

  return { searchParams, get, getNumber, update };
}

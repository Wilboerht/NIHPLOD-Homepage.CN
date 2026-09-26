"use client";

import { useCallback, useState } from "react";

export interface RowSelection<T> {
  selectedIds: Set<string>;
  selectedCount: number;
  isSelected: (item: T) => boolean;
  isAllSelected: (items: T[]) => boolean;
  isIndeterminate: (items: T[]) => boolean;
  toggle: (item: T, checked?: boolean) => void;
  toggleAll: (items: T[], checked: boolean) => void;
  clear: () => void;
}

/**
 * 列表勾选状态
 *
 * - `queryKey` 变化（翻页/筛选/搜索）时自动清空，避免批量操作作用在不可见的行上
 * - 全选按当前列表内容判断（而非仅比较数量），并支持 indeterminate
 */
export function useRowSelection<T>(
  getId: (item: T) => string,
  queryKey: string
): RowSelection<T> {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [prevQueryKey, setPrevQueryKey] = useState(queryKey);

  // 渲染阶段同步：查询变化时立即清空（避免 effect 闪烁）
  if (prevQueryKey !== queryKey) {
    setPrevQueryKey(queryKey);
    if (selectedIds.size > 0) {
      setSelectedIds(new Set());
    }
  }

  const isSelected = useCallback(
    (item: T) => selectedIds.has(getId(item)),
    [selectedIds, getId]
  );

  const isAllSelected = useCallback(
    (items: T[]) => items.length > 0 && items.every((item) => selectedIds.has(getId(item))),
    [selectedIds, getId]
  );

  const isIndeterminate = useCallback(
    (items: T[]) => {
      const selectedCount = items.filter((item) => selectedIds.has(getId(item))).length;
      return selectedCount > 0 && selectedCount < items.length;
    },
    [selectedIds, getId]
  );

  const toggle = useCallback(
    (item: T, checked?: boolean) => {
      const id = getId(item);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        const shouldSelect = checked ?? !next.has(id);
        if (shouldSelect) next.add(id);
        else next.delete(id);
        return next;
      });
    },
    [getId]
  );

  const toggleAll = useCallback(
    (items: T[], checked: boolean) => {
      const ids = items.map(getId);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of ids) {
          if (checked) next.add(id);
          else next.delete(id);
        }
        return next;
      });
    },
    [getId]
  );

  const clear = useCallback(() => setSelectedIds(new Set()), []);

  return {
    selectedIds,
    selectedCount: selectedIds.size,
    isSelected,
    isAllSelected,
    isIndeterminate,
    toggle,
    toggleAll,
    clear,
  };
}

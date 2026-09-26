"use client";

import { useCallback } from "react";

export interface PurchaseLinkItem {
  id?: string;
  platform: string;
  url: string;
  order: number;
  /**
   * 仅前端使用的稳定行 key（新增/编辑时用于 React key，提交前剥离）。
   * 缺少它会导致以 url 作为 key 时每次击键都重挂载输入框而失焦。
   */
  clientKey?: string;
}

/** 生成购买链接行 key */
export function createPurchaseLinkKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `pl-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * 购买链接管理 Hook
 * 封装购买链接的增删改逻辑，提升可测试性和复用性
 */
export function usePurchaseLinks(
  purchaseLinks: PurchaseLinkItem[],
  setPurchaseLinks: (links: PurchaseLinkItem[]) => void
) {
  const addPurchaseLink = useCallback(() => {
    const newLink: PurchaseLinkItem = {
      platform: "小红书",
      url: "",
      order: purchaseLinks.length,
      clientKey: createPurchaseLinkKey(),
    };
    setPurchaseLinks([...purchaseLinks, newLink]);
  }, [purchaseLinks, setPurchaseLinks]);

  const removePurchaseLink = useCallback(
    (index: number) => {
      const newLinks = purchaseLinks.filter((_, i) => i !== index);
      // 重新排序
      setPurchaseLinks(newLinks.map((link, i) => ({ ...link, order: i })));
    },
    [purchaseLinks, setPurchaseLinks]
  );

  const updatePurchaseLink = useCallback(
    (index: number, field: keyof PurchaseLinkItem, value: string | number) => {
      const newLinks = [...purchaseLinks];
      newLinks[index] = { ...newLinks[index], [field]: value };
      setPurchaseLinks(newLinks);
    },
    [purchaseLinks, setPurchaseLinks]
  );

  return { addPurchaseLink, removePurchaseLink, updatePurchaseLink };
}

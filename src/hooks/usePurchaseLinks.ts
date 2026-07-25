"use client";

import { useCallback } from "react";

export interface PurchaseLinkItem {
  id?: string;
  platform: string;
  url: string;
  order: number;
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

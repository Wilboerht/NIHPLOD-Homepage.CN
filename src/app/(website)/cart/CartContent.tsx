"use client";

/**
 * 购物车内容组件
 */
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/Toast";
import { apiPut, apiDelete } from "@/lib/api-client";
import { trackEvent } from "@/lib/analytics";
import { formatPrice } from "@/lib/utils";
import { AdvisorCTA } from "@/components/website";

interface CartItem {
  id: string;
  product: {
    id: string;
    name: string;
    slug: string;
    price: number;
    featuredImage: string | null;
    stock: number;
  };
  variant: {
    id: string;
    name: string;
    price: number;
    stock: number;
  } | null;
  quantity: number;
  selected: boolean;
  price: number;
}

interface CartContentProps {
  initialItems: CartItem[];
  autoOpenCheckout?: boolean;
}

export default function CartContent({ initialItems, autoOpenCheckout = false }: CartContentProps) {
  const router = useRouter();
  const toast = useToast();
  const { user, openCheckout, redirectToLogin } = useAuth();
  const [items, setItems] = useState(initialItems);
  const [loading, _setLoading] = useState(false);
  const autoOpenedRef = useRef(false);

  // 计算选中商品总价
  const selectedItems = items.filter((i) => i.selected);
  const totalPrice = selectedItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const totalCount = selectedItems.reduce((sum, i) => sum + i.quantity, 0);

  // 通过 /cart?openCheckout=1 进入时，自动拉起一次结算弹窗并清理参数
  useEffect(() => {
    if (!autoOpenCheckout || autoOpenedRef.current) return;

    autoOpenedRef.current = true;
    router.replace("/cart", { scroll: false });

    if (selectedItems.length === 0) return;

    if (!user) {
      redirectToLogin();
      return;
    }

    trackEvent("checkout_auto_opened", {
      source: "checkout_redirect",
      selected_item_count: selectedItems.length,
      has_user: true,
    });

    openCheckout();
  }, [autoOpenCheckout, selectedItems.length, user, openCheckout, redirectToLogin, router]);

  // 更新数量
  const updateQuantity = async (id: string, quantity: number) => {
    if (quantity < 1) return;

    try {
      await apiPut(`/api/cart/${id}`, { quantity });
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, quantity } : i)));
    } catch (e) {
      console.error("更新数量失败:", e);
    }
  };

  // 删除商品
  const removeItem = async (id: string) => {
    try {
      await apiDelete(`/api/cart/${id}`);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (e) {
      console.error("删除失败:", e);
    }
  };

  // 切换选中状态（仅前端本地状态）
  const toggleSelect = (id: string, selected: boolean) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, selected } : i)));
  };

  // 去结算
  const handleCheckout = () => {
    if (selectedItems.length === 0) {
      toast.warning("请选择商品");
      return;
    }
    // 未登录先跳登录页，登录后自动回到 /cart?openCheckout=1 拉起结算
    if (!user) {
      redirectToLogin("/cart?openCheckout=1");
      return;
    }

    // GA: begin_checkout 事件
    trackEvent("begin_checkout", {
      currency: "CNY",
      value: totalPrice,
      items: selectedItems.map((item) => ({
        item_id: item.product.id,
        item_name: item.product.name,
        price: item.price,
        quantity: item.quantity,
      })),
    });

    // 打开结算弹窗
    openCheckout(selectedItems.map((item) => item.product.id));
  };

  if (items.length === 0) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <p className="mb-4 text-gray-500">购物车是空的</p>
        <Link href="/products" className="text-pink-500 hover:underline">
          去逛逛 →
        </Link>
        <div className="mx-auto mt-8 max-w-sm">
          <AdvisorCTA variant="empty-cart" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6">
      {/* 商品列表 */}
      <div className="mb-24 space-y-4">
        {items.map((item) => (
          <div key={item.id} className="flex gap-4 rounded-xl bg-white p-4">
            {/* 选择框 */}
            <input
              type="checkbox"
              checked={item.selected}
              onChange={(e) => toggleSelect(item.id, e.target.checked)}
              className="mt-8 h-5 w-5 accent-pink-500"
            />

            {/* 商品图片 */}
            <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100">
              {item.product.featuredImage && (
                <Image
                  src={item.product.featuredImage}
                  alt={item.product.name}
                  width={80}
                  height={80}
                  className="h-full w-full object-cover"
                />
              )}
            </div>

            {/* 商品信息 */}
            <div className="min-w-0 flex-1">
              <h3 className="truncate font-medium text-gray-900">{item.product.name}</h3>
              {item.variant && <p className="text-sm text-gray-500">{item.variant.name}</p>}
              <p className="mt-1 font-bold text-pink-500">{formatPrice(item.price)}</p>

              {/* 数量控制 */}
              <div className="mt-2 flex items-center gap-2">
                <button
                  onClick={() => updateQuantity(item.id, item.quantity - 1)}
                  className="h-7 w-7 rounded bg-gray-100 text-gray-600"
                >
                  -
                </button>
                <span className="w-8 text-center">{item.quantity}</span>
                <button
                  onClick={() => updateQuantity(item.id, item.quantity + 1)}
                  className="h-7 w-7 rounded bg-gray-100 text-gray-600"
                >
                  +
                </button>
                <button
                  onClick={() => removeItem(item.id)}
                  className="ml-auto text-sm text-gray-400 hover:text-red-500"
                >
                  删除
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 底部结算栏 */}
      <div className="fixed bottom-0 left-0 right-0 flex items-center border-t bg-white px-4 py-3">
        <div className="flex-1">
          <p className="text-sm text-gray-500">
            已选 <span className="font-bold text-pink-500">{totalCount}</span> 件
          </p>
          <p className="text-lg font-bold text-pink-500">{formatPrice(totalPrice)}</p>
        </div>
        <button
          onClick={handleCheckout}
          disabled={selectedItems.length === 0 || loading}
          className="rounded-full bg-pink-500 px-8 py-3 font-medium text-white disabled:opacity-50"
        >
          去结算
        </button>
      </div>
    </div>
  );
}

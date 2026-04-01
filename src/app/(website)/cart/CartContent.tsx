"use client";

/**
 * 购物车内容组件
 */
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { trackEvent } from "@/lib/analytics";

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
  const { user, openCheckout, openLoginModal } = useAuth();
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
      openLoginModal();
      return;
    }

    trackEvent("checkout_auto_opened", {
      source: "checkout_redirect",
      selected_item_count: selectedItems.length,
      has_user: true,
    });

    openCheckout();
  }, [autoOpenCheckout, selectedItems.length, user, openCheckout, openLoginModal, router]);

  // 更新数量
  const updateQuantity = async (id: string, quantity: number) => {
    if (quantity < 1) return;
    
    try {
      await fetch(`/api/cart/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity }),
      });
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, quantity } : i)));
    } catch (e) {
      console.error("更新数量失败:", e);
    }
  };

  // 删除商品
  const removeItem = async (id: string) => {
    try {
      await fetch(`/api/cart/${id}`, { method: "DELETE" });
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
      alert("请选择商品");
      return;
    }
    // 未登录先打开登录弹窗
    if (!user) {
      openLoginModal();
      return;
    }
    // 打开结算弹窗
    openCheckout(selectedItems.map((item) => item.product.id));
  };

  if (items.length === 0) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <p className="text-gray-500 mb-4">购物车是空的</p>
        <Link href="/products" className="text-pink-500 hover:underline">
          去逛逛 →
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6">
      {/* 商品列表 */}
      <div className="space-y-4 mb-24">
        {items.map((item) => (
          <div key={item.id} className="bg-white rounded-xl p-4 flex gap-4">
            {/* 选择框 */}
            <input
              type="checkbox"
              checked={item.selected}
              onChange={(e) => toggleSelect(item.id, e.target.checked)}
              className="w-5 h-5 mt-8 accent-pink-500"
            />

            {/* 商品图片 */}
            <div className="w-20 h-20 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
              {item.product.featuredImage && (
                <Image
                  src={item.product.featuredImage}
                  alt={item.product.name}
                  width={80}
                  height={80}
                  className="w-full h-full object-cover"
                />
              )}
            </div>

            {/* 商品信息 */}
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-gray-900 truncate">{item.product.name}</h3>
              {item.variant && (
                <p className="text-sm text-gray-500">{item.variant.name}</p>
              )}
              <p className="text-pink-500 font-bold mt-1">¥{item.price.toFixed(2)}</p>

              {/* 数量控制 */}
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={() => updateQuantity(item.id, item.quantity - 1)}
                  className="w-7 h-7 bg-gray-100 rounded text-gray-600"
                >
                  -
                </button>
                <span className="w-8 text-center">{item.quantity}</span>
                <button
                  onClick={() => updateQuantity(item.id, item.quantity + 1)}
                  className="w-7 h-7 bg-gray-100 rounded text-gray-600"
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
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t px-4 py-3 flex items-center">
        <div className="flex-1">
          <p className="text-sm text-gray-500">
            已选 <span className="text-pink-500 font-bold">{totalCount}</span> 件
          </p>
          <p className="text-lg font-bold text-pink-500">¥{totalPrice.toFixed(2)}</p>
        </div>
        <button
          onClick={handleCheckout}
          disabled={selectedItems.length === 0 || loading}
          className="px-8 py-3 bg-pink-500 text-white rounded-full font-medium disabled:opacity-50"
        >
          去结算
        </button>
      </div>
    </div>
  );
}


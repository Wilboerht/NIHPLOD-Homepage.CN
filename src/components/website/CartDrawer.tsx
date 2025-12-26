"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { m, AnimatePresence } from "framer-motion";
import { X, Minus, Plus, Trash2, ShoppingCart, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

interface CartItem {
  id: string;
  product: {
    id: string;
    name: string;
    slug: string;
    price: number;
    featuredImage: string | null;
    stock: number;
    published: boolean;
  };
  quantity: number;
  price: number;
  subtotal: number;
}

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CartDrawer({ isOpen, onClose }: CartDrawerProps) {
  const { user, openLoginModal, openCheckout } = useAuth();
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);

  // 获取购物车数据
  const fetchCart = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await fetch("/api/cart");
      const data = await res.json();
      if (data.success) {
        setItems(data.data.items);
      }
    } catch (e) {
      console.error("获取购物车失败:", e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (isOpen && user) {
      fetchCart();
    }
  }, [isOpen, user, fetchCart]);

  // 更新数量
  const updateQuantity = async (id: string, quantity: number) => {
    if (quantity < 1) return;
    setUpdating(id);
    try {
      await fetch(`/api/cart/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity }),
      });
      setItems((prev) =>
        prev.map((i) =>
          i.id === id ? { ...i, quantity, subtotal: i.price * quantity } : i
        )
      );
    } catch (e) {
      console.error("更新数量失败:", e);
    } finally {
      setUpdating(null);
    }
  };

  // 删除商品
  const removeItem = async (id: string) => {
    setUpdating(id);
    try {
      await fetch(`/api/cart/${id}`, { method: "DELETE" });
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (e) {
      console.error("删除失败:", e);
    } finally {
      setUpdating(null);
    }
  };

  // 计算总价
  const totalPrice = items.reduce((sum, i) => sum + i.subtotal, 0);
  const totalCount = items.reduce((sum, i) => sum + i.quantity, 0);

  // 去结算
  const handleCheckout = () => {
    onClose();
    openCheckout();
  };

  // 未登录时的处理
  const handleLoginClick = () => {
    onClose();
    openLoginModal();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* 遮罩层 */}
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm"
          />

          {/* 居中容器 */}
          <div className="fixed inset-0 z-[61] flex items-center justify-center pointer-events-none">
            {/* 模态框 */}
            <m.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="pointer-events-auto flex max-h-[85vh] w-[90vw] max-w-lg flex-col overflow-hidden rounded-2xl bg-brand-cream shadow-2xl"
            >
            {/* 头部 */}
            <div className="flex items-center justify-between border-b border-brand-beige/50 px-4 py-4">
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-brand-gold" />
                <h2 className="text-lg font-medium text-brand-charcoal">购物车</h2>
                {totalCount > 0 && (
                  <span className="rounded-full bg-brand-gold px-2 py-0.5 text-xs text-white">
                    {totalCount}
                  </span>
                )}
              </div>
              <button
                onClick={onClose}
                className="rounded-full p-2 text-brand-charcoal/60 transition-colors hover:bg-brand-beige/50 hover:text-brand-charcoal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* 内容区域 - 继续在下一个编辑中添加 */}
            <div className="flex-1 overflow-y-auto p-4">
              {!user ? (
                <div className="flex h-full flex-col items-center justify-center gap-4">
                  <p className="text-brand-charcoal/60">请先登录查看购物车</p>
                  <button
                    onClick={handleLoginClick}
                    className="rounded-full bg-brand-gold px-6 py-2 text-white transition-colors hover:bg-brand-gold/90"
                  >
                    立即登录
                  </button>
                </div>
              ) : loading ? (
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-brand-gold" />
                </div>
              ) : items.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-4">
                  <ShoppingCart className="h-16 w-16 text-brand-charcoal/20" />
                  <p className="text-brand-charcoal/60">购物车是空的</p>
                  <button
                    onClick={onClose}
                    className="text-sm text-brand-gold hover:underline"
                  >
                    去选购商品 →
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {items.map((item) => (
                    <CartItemCard
                      key={item.id}
                      item={item}
                      updating={updating === item.id}
                      onUpdateQuantity={updateQuantity}
                      onRemove={removeItem}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* 底部结算栏 */}
            {user && items.length > 0 && (
              <div className="border-t border-brand-beige/50 bg-white p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm text-brand-charcoal/60">
                    共 {totalCount} 件商品
                  </span>
                  <div className="text-right">
                    <span className="text-sm text-brand-charcoal/60">合计：</span>
                    <span className="text-xl font-bold text-brand-gold">
                      ¥{totalPrice.toFixed(2)}
                    </span>
                  </div>
                </div>
                <button
                  onClick={handleCheckout}
                  className="w-full rounded-full bg-brand-gold py-3 font-medium text-white transition-colors hover:bg-brand-gold/90"
                >
                  去结算
                </button>
              </div>
            )}
            </m.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

// CartItemCard 组件单独定义
function CartItemCard({
  item,
  updating,
  onUpdateQuantity,
  onRemove,
}: {
  item: CartItem;
  updating: boolean;
  onUpdateQuantity: (id: string, quantity: number) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="flex gap-3 rounded-xl bg-white p-3 shadow-sm">
      {/* 商品图片 */}
      <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg bg-brand-beige/30">
        {item.product.featuredImage ? (
          <Image
            src={item.product.featuredImage}
            alt={item.product.name}
            fill
            className="object-cover"
            sizes="80px"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ShoppingCart className="h-8 w-8 text-brand-charcoal/20" />
          </div>
        )}
      </div>

      {/* 商品信息 */}
      <div className="flex flex-1 flex-col justify-between">
        <div>
          <h3 className="line-clamp-2 text-sm font-medium text-brand-charcoal">
            {item.product.name}
          </h3>
          <p className="mt-1 text-sm font-bold text-brand-gold">
            ¥{item.price.toFixed(2)}
          </p>
        </div>

        {/* 数量控制 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}
              disabled={updating || item.quantity <= 1}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full border border-brand-beige",
                "transition-colors hover:border-brand-gold hover:text-brand-gold",
                "disabled:cursor-not-allowed disabled:opacity-50"
              )}
            >
              <Minus className="h-3 w-3" />
            </button>
            <span className="w-8 text-center text-sm font-medium">
              {updating ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : item.quantity}
            </span>
            <button
              onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
              disabled={updating || item.quantity >= item.product.stock}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full border border-brand-beige",
                "transition-colors hover:border-brand-gold hover:text-brand-gold",
                "disabled:cursor-not-allowed disabled:opacity-50"
              )}
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>

          <button
            onClick={() => onRemove(item.id)}
            disabled={updating}
            className="p-1 text-brand-charcoal/40 transition-colors hover:text-red-500"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}


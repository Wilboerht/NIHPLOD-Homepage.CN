"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useCartStore, CartItem } from "@/store/cart";
import { X, Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/contexts/AuthContext";
import { useScrollLock } from "@/hooks/useScrollLock";
import { formatPrice } from "@/lib/utils";

export function CartDrawer() {
  const { user, openCheckout } = useAuth();
  const { isOpen, closeCart, items, totalItems, fetchCart, updateQuantity, removeItem } =
    useCartStore();

  useScrollLock(isOpen);

  useEffect(() => {
    // 仅在登录状态下获取购物车数据
    if (user) {
      fetchCart();
    }
  }, [fetchCart, user]);

  // ESC 关闭
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeCart();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [closeCart]);

  // 计算总价
  const totalPrice = items.reduce(
    (sum: number, item: CartItem) => sum + item.price * item.quantity,
    0
  );

  // 统一结算入口为弹窗
  const handleCheckout = () => {
    closeCart();
    openCheckout();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeCart}
            className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm"
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 z-[101] flex h-full w-full max-w-md flex-col bg-[#FBF8F0] pt-[env(safe-area-inset-top,0px)] shadow-2xl sm:w-[450px]"
          >
            {/* Header */}
            <div className="border-brand-brown/10 flex items-center justify-between border-b px-6 py-5">
              <h2 className="text-brand-brown flex items-center gap-2 font-serif text-2xl">
                <ShoppingBag className="h-6 w-6" />
                购物袋
                <span className="text-brand-brown/60 text-sm font-normal">({totalItems})</span>
              </h2>
              <button
                onClick={closeCart}
                className="text-brand-brown/60 hover:bg-brand-brown/5 hover:text-brand-brown rounded-full p-2 transition-colors"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {items.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <ShoppingBag className="text-brand-brown/20 mb-4 h-16 w-16" />
                  <p className="text-brand-brown/60 mb-6 font-serif text-lg">您的购物袋是空的</p>
                  <Button
                    onClick={closeCart}
                    variant="outline"
                    className="border-brand-brown/30 text-brand-brown hover:bg-brand-brown hover:text-white"
                  >
                    去探索产品
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-6">
                  {items.map((item) => (
                    <div key={item.id} className="flex gap-4">
                      {/* Product Image */}
                      <div className="border-brand-brown/10 relative h-24 w-24 shrink-0 overflow-hidden rounded-lg border bg-white">
                        {item.image ? (
                          <Image src={item.image} alt={item.name} fill className="object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-gray-100 text-xs text-gray-400">
                            暂无图片
                          </div>
                        )}
                      </div>

                      {/* Info & Controls */}
                      <div className="flex flex-1 flex-col justify-between">
                        <div className="flex justify-between">
                          <div>
                            <h3 className="text-brand-brown line-clamp-2 font-serif text-base font-medium">
                              {item.name}
                            </h3>
                            <p className="text-brand-brown/80 mt-1 text-sm font-medium">
                              {formatPrice(item.price)}
                            </p>
                          </div>
                          <button
                            onClick={() => removeItem(item.id)}
                            className="text-brand-brown/40 hover:text-brand-red h-fit p-1 transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="border-brand-brown/20 flex items-center rounded-full border px-2 py-1">
                            <button
                              onClick={() =>
                                updateQuantity(item.id, Math.max(1, item.quantity - 1))
                              }
                              className="text-brand-brown/60 hover:text-brand-brown p-1 disabled:opacity-30"
                              disabled={item.quantity <= 1}
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="text-brand-brown min-w-[1.5rem] text-center text-sm font-medium">
                              {item.quantity}
                            </span>
                            <button
                              onClick={() => updateQuantity(item.id, item.quantity + 1)}
                              className="text-brand-brown/60 hover:text-brand-brown p-1"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            {items.length > 0 && (
              <div className="border-brand-brown/10 border-t bg-[#FBF8F0] p-6">
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-brand-brown/70 text-base">总计 (不含运费)</span>
                  <span className="text-brand-brown font-serif text-2xl font-bold">
                    {formatPrice(totalPrice)}
                  </span>
                </div>
                <Button onClick={handleCheckout} className="w-full py-6 text-lg">
                  立即结算
                </Button>
                <div className="mt-4 text-center">
                  <button
                    onClick={closeCart}
                    className="text-brand-brown/60 decoration-brand-brown/30 hover:text-brand-brown text-sm underline"
                  >
                    继续购物
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

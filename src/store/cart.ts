
import { create } from "zustand";

export interface CartItem {
    id: string;
    productId: string;
    name: string;
    price: number;
    quantity: number;
    image?: string;
}

interface CartState {
    isOpen: boolean;
    items: CartItem[];
    totalItems: number;
    openCart: () => void;
    closeCart: () => void;
    toggleCart: () => void;
    fetchCart: () => Promise<void>;
    addToCart: (productId: string, quantity: number) => Promise<boolean>;
    updateQuantity: (itemId: string, quantity: number) => Promise<boolean>;
    removeItem: (itemId: string) => Promise<boolean>;
}

interface CartResponseItem {
    id: string;
    product: {
        id: string;
        name: string;
        featuredImage: string;
    };
    price: number;
    quantity: number;
}

interface CartResponse {
    success: boolean;
    data: {
        items: CartResponseItem[];
        totalItems: number;
    };
}

export const useCartStore = create<CartState>((set, get) => ({
    isOpen: false,
    items: [],
    totalItems: 0,

    openCart: () => set({ isOpen: true }),
    closeCart: () => set({ isOpen: false }),
    toggleCart: () => set((state) => ({ isOpen: !state.isOpen })),

    fetchCart: async () => {
        // 未登录时跳过请求，避免产生 401
        if (typeof window !== "undefined" && !localStorage.getItem("auth_hint")) {
            return;
        }

        try {
            const res = await fetch("/api/cart");
            if (res.status === 401) {
                // 静默处理未授权，清空购物车状态
                set({ items: [], totalItems: 0 });
                return;
            }
            if (res.ok) {
                const data: CartResponse = await res.json();
                if (data.success) {
                    set({
                        items: data.data.items.map((item) => ({
                            id: item.id,
                            productId: item.product.id,
                            name: item.product.name,
                            price: item.price,
                            quantity: item.quantity,
                            image: item.product.featuredImage,
                        })),
                        totalItems: data.data.totalItems,
                    });
                }
            }
        } catch (error) {
            console.error("Fetch cart error:", error);
        }
    },

    addToCart: async (productId: string, quantity: number) => {
        try {
            const res = await fetch("/api/cart", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ productId, quantity }),
            });
            const data = await res.json();

            if (data.success) {
                await get().fetchCart();
                set({ isOpen: true }); // Auto open cart on add
                return true;
            }
            return false;
        } catch (error) {
            console.error("Add to cart error:", error);
            return false;
        }
    },

    updateQuantity: async (itemId: string, quantity: number) => {
        try {
            const res = await fetch(`/api/cart/${itemId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ quantity }),
            });
            if (res.ok) {
                await get().fetchCart();
                return true;
            }
            return false;
        } catch (error) {
            console.error("Update cart error:", error);
            return false;
        }
    },

    removeItem: async (itemId: string) => {
        try {
            const res = await fetch(`/api/cart/${itemId}`, {
                method: "DELETE",
            });
            if (res.ok) {
                await get().fetchCart();
                return true;
            }
            return false;
        } catch (error) {
            console.error("Remove cart item error:", error);
            return false;
        }
    },
}));

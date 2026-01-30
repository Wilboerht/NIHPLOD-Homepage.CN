
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCartStore } from "@/store/cart";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toast";
import Image from "next/image";
import { Loader2, ArrowLeft } from "lucide-react";
import { Link } from "next-view-transitions";
import { CartItem } from "@/store/cart";

export function CheckoutClient() {
    const router = useRouter();
    const { items, totalItems, fetchCart } = useCartStore();
    const { user, isLoading: authLoading } = useAuth();
    const { error: showError, success: showSuccess } = useToast();

    const [submitting, setSubmitting] = useState(false);

    // 收货信息
    const [formData, setFormData] = useState({
        name: "",
        phone: "",
        address: "",
    });

    // 初始化检查
    useEffect(() => {
        fetchCart();
    }, [fetchCart]);

    // 如果购物车为空或未登录，重定向
    useEffect(() => {
        if (!authLoading && !user) {
            router.push("/auth/login?redirect=/checkout");
        }
    }, [user, authLoading, router]);

    const totalPrice = items.reduce((sum: number, item: CartItem) => sum + item.price * item.quantity, 0);
    const shippingFee = 0; // 包邮
    const payAmount = totalPrice + shippingFee;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (items.length === 0) {
            showError("购物车为空");
            return;
        }

        if (!formData.name || !formData.phone || !formData.address) {
            showError("请填写完整的收货信息");
            return;
        }

        setSubmitting(true);
        try {
            // 1. 创建订单
            const res = await fetch("/api/orders", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    items: items.map((item: CartItem) => ({
                        productId: item.productId,
                        quantity: item.quantity,
                    })),
                    recipient: {
                        name: formData.name,
                        phone: formData.phone,
                        address: formData.address,
                    },
                    payAmount,
                }),
            });

            const data = await res.json();

            if (!data.success) {
                throw new Error(data.error?.message || "创建订单失败");
            }

            const { orderId, orderNo } = data.data;

            // 2. 发起支付 (待实现：跳转到支付页或唤起支付)
            // 现在先模拟成功跳转
            showSuccess("订单创建成功");
            router.push(`/pay?orderNo=${orderNo}`);

        } catch (err: any) {
            showError(err.message || "结算失败，请重试");
        } finally {
            setSubmitting(false);
        }
    };

    if (authLoading) {
        return <div className="flex min-h-screen items-center justify-center"><Loader2 className="animate-spin text-brand-gold" /></div>;
    }

    if (items.length === 0) {
        return (
            <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
                <h1 className="font-serif text-2xl text-brand-brown">购物袋是空的</h1>
                <p className="text-brand-brown/60">挑选一些心仪的产品吧</p>
                <Link href="/products">
                    <Button>去逛逛</Button>
                </Link>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#FAFAFA] pb-20 pt-24 md:pt-32">
            <div className="mx-auto max-w-6xl px-6">
                <Link href="/products" className="mb-8 inline-flex items-center gap-2 text-sm text-brand-brown/60 hover:text-brand-brown">
                    <ArrowLeft className="h-4 w-4" />
                    继续购物
                </Link>

                <h1 className="mb-8 font-serif text-3xl text-brand-brown">确认订单</h1>

                <div className="grid gap-8 lg:grid-cols-12">
                    {/* 左侧：收货表单 */}
                    <div className="lg:col-span-7">
                        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5 md:p-8">
                            <h2 className="mb-6 font-serif text-xl text-brand-brown">收货信息</h2>
                            <form id="checkout-form" onSubmit={handleSubmit} className="space-y-6">
                                <div className="grid gap-6 md:grid-cols-2">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-brand-brown/80">收货人姓名</label>
                                        <Input
                                            required
                                            placeholder="姓名"
                                            value={formData.name}
                                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-brand-brown/80">联系电话</label>
                                        <Input
                                            required
                                            type="tel"
                                            placeholder="手机号码"
                                            value={formData.phone}
                                            onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-brand-brown/80">详细地址</label>
                                    <Textarea
                                        required
                                        placeholder="省/市/区/街道门牌号"
                                        className="min-h-[100px]"
                                        value={formData.address}
                                        onChange={e => setFormData({ ...formData, address: e.target.value })}
                                    />
                                </div>
                            </form>
                        </div>

                        <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5 md:p-8">
                            <h2 className="mb-6 font-serif text-xl text-brand-brown">支付方式</h2>
                            <div className="flex items-center gap-4 rounded-xl border border-brand-gold/30 bg-brand-gold/5 p-4">
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#09BB07] text-white">
                                    {/* Wechat Icon */}
                                    <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6"><path d="M8.5,14.5c0.55,0,1-0.45,1-1s-0.45-1-1-1s-1,0.45-1,1S7.95,14.5,8.5,14.5z M14.5,14.5c0.55,0,1-0.45,1-1s-0.45-1-1-1s-1,0.45-1,1S13.95,14.5,14.5,14.5z M20.35,10.65c0-4.75-4.27-8.62-9.5-8.62s-9.5,3.87-9.5,8.62c0,2.77,1.44,5.24,3.75,6.86 c0.33,0.22,0.36,0.67,0.1,1.06c-0.29,0.43-1.04,1.52-1.21,1.75c-0.21,0.28-0.03,0.68,0.32,0.69c0.39,0.01,1.55-0.06,2.69-0.54 c0.37-0.16,0.8,-0.06,1.08,0.18c0.88,0.76,2.02,1.23,3.27,1.23c0.16,0,0.32-0.01,0.48-0.02c-0.07-0.51-0.11-1.03-0.11-1.56 C11.64,15.65,15.54,12.01,20.35,10.65z M19.46,12.44c-0.55,0-1,0.45-1,1s0.45,1,1,1s1-0.45,1-1S19.95,12.44,19.46,12.44z M23.12,12.44c-0.55,0-1,0.45-1,1s0.45,1,1,1s1-0.45,1-1S23.68,12.44,23.12,12.44z M24,14.69c0,2.62-2.58,4.75-5.75,4.75 c-0.69,0-1.32,0.6-2.02,0.17c-0.62,0.26-1.25,0.3-1.47,0.3c-0.19,0-0.29-0.22-0.18-0.38c0.09-0.14,0.5-0.78,0.66-1.02 c0.14-0.21,0.12-0.49-0.06-0.69c-1.27-0.89-2.06-2.25-2.06-3.77c0-2.62,2.57-4.75,5.75-4.75S24.62,12.07,24,14.69z"></path></svg>
                                </div>
                                <div className="flex-1">
                                    <p className="font-medium text-brand-brown">微信支付</p>
                                    <p className="text-xs text-brand-brown/60">推荐使用微信支付</p>
                                </div>
                                <div className="h-5 w-5 rounded-full border-4 border-brand-gold bg-white" />
                            </div>
                        </div>
                    </div>

                    {/* 右侧：订单概览 */}
                    <div className="lg:col-span-5">
                        <div className="sticky top-24 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5 md:p-8">
                            <h2 className="mb-6 font-serif text-xl text-brand-brown">订单概览</h2>

                            <div className="mb-6 flex flex-col gap-4">
                                {items.map((item: CartItem) => (
                                    <div key={item.id} className="flex gap-4">
                                        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-gray-100">
                                            {item.image && <Image src={item.image} alt={item.name} fill className="object-cover" />}
                                        </div>
                                        <div className="flex flex-1 justify-between">
                                            <div>
                                                <h3 className="line-clamp-2 text-sm font-medium text-brand-brown">{item.name}</h3>
                                                <p className="text-xs text-brand-brown/60">数量: {item.quantity}</p>
                                            </div>
                                            <p className="text-sm font-medium text-brand-brown">¥{item.price * item.quantity}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="my-6 space-y-2 border-y border-brand-brown/10 py-6">
                                <div className="flex justify-between text-sm">
                                    <span className="text-brand-brown/60">商品总额</span>
                                    <span className="font-medium text-brand-brown">¥{totalPrice.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-brand-brown/60">运费</span>
                                    <span className="font-medium text-brand-brown">
                                        {shippingFee === 0 ? "免运费" : `¥${shippingFee}`}
                                    </span>
                                </div>
                            </div>

                            <div className="mb-6 flex justify-between">
                                <span className="text-lg font-bold text-brand-brown">应付总额</span>
                                <span className="font-serif text-2xl font-bold text-brand-brown">¥{payAmount.toLocaleString()}</span>
                            </div>

                            <Button
                                type="submit"
                                form="checkout-form"
                                className="w-full py-6 text-lg"
                                disabled={submitting}
                            >
                                {submitting ? (
                                    <>
                                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                        处理中...
                                    </>
                                ) : (
                                    "立即支付"
                                )}
                            </Button>

                            <p className="mt-4 text-center text-xs text-brand-brown/40">
                                点击立即支付即表示您同意我们的服务条款和隐私政策
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

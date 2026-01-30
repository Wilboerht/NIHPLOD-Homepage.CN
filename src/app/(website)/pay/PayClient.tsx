
"use client";

import { useEffect, useState, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { useToast } from "@/components/ui/Toast";
import { Loader2, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface Order {
    id: string;
    orderNo: string;
    payAmount: number;
    status: string;
    createdAt: string;
}

export function PayClient() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const { error: showError, success: showSuccess } = useToast();

    const orderNo = searchParams.get("orderNo");

    const [order, setOrder] = useState<Order | null>(null);
    const [loading, setLoading] = useState(true);
    const [payMethod, setPayMethod] = useState<"wechat" | "alipay" | "unionpay">("wechat");
    const [codeUrl, setCodeUrl] = useState<string>("");
    const [mwebUrl, setMwebUrl] = useState<string>("");
    const timerRef = useRef<NodeJS.Timeout>();

    // 1. 获取订单详情
    useEffect(() => {
        if (!orderNo) {
            showError("订单号无效");
            router.push("/");
            return;
        }

        const fetchOrder = async () => {
            try {
                const res = await fetch(`/api/orders?orderNo=${orderNo}`);
                const data = await res.json();
                if (data.success && data.data.orders.length > 0) {
                    const orderData = data.data.orders[0];
                    setOrder(orderData);

                    if (orderData.status !== "PENDING") {
                        router.push(`/pay/result?orderNo=${orderNo}`);
                    }
                } else {
                    showError("订单不存在");
                }
            } catch {
                showError("获取订单失败");
            } finally {
                setLoading(false);
            }
        };

        fetchOrder();
    }, [orderNo, router, showError]);

    // 2. 获取支付参数 (当支付方式改变或订单加载完成时)
    useEffect(() => {
        if (!order || order.status !== "PENDING") return;

        // 重置状态
        setCodeUrl("");
        setMwebUrl("");

        // 清理旧的表单
        const oldForm = document.getElementById("unionpaysubmit");
        if (oldForm) oldForm.remove();

        const createPay = async () => {
            try {
                const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

                const payload: Record<string, unknown> = {
                    orderId: order.id,
                    payMethod: payMethod,
                };

                if (payMethod === "wechat") {
                    payload.tradeType = isMobile ? "MWEB" : "NATIVE";
                }

                const res = await fetch("/api/pay/create", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });

                const data = await res.json();
                if (data.success) {
                    if (payMethod === "wechat") {
                        if (payload.tradeType === "NATIVE" && data.data.codeUrl) {
                            setCodeUrl(data.data.codeUrl);
                        } else if (payload.tradeType === "MWEB" && data.data.mwebUrl) {
                            setMwebUrl(data.data.mwebUrl);
                            // 微信 H5 自动跳转
                            window.location.href = data.data.mwebUrl;
                        }
                    } else if (payMethod === "alipay") {
                        // 支付宝直接跳转
                        if (data.data.payUrl) {
                            setMwebUrl(data.data.payUrl); // 重用 mwebUrl 状态存储跳转链接
                            window.location.href = data.data.payUrl;
                        }
                    } else if (payMethod === "unionpay") {
                        if (data.data.payHtml) {
                            // 动态插入并提交表单
                            const div = document.createElement("div");
                            div.innerHTML = data.data.payHtml;
                            document.body.appendChild(div);
                            // 这里的 HTML 里包含 script 自动提交，
                            // 但 React 插入 innerHTML 通常不会执行 script。
                            // 所以我们需要手动查找 form 并提交。
                            setTimeout(() => {
                                const form = document.querySelector('form[name="unionpaysubmit"]') as HTMLFormElement;
                                if (form) form.submit();
                            }, 100);
                        }
                    }
                } else {
                    showError(data.error?.message || "支付创建失败");
                }
            } catch {
                showError("网络错误，无法发起支付");
            }
        };

        createPay();
    }, [order, payMethod, showError]); // 依赖 payMethod，切换时重新请求

    // 3. 轮询订单状态
    useEffect(() => {
        if (!order || order.status !== "PENDING") return;

        const checkStatus = async () => {
            try {
                const res = await fetch(`/api/orders?orderNo=${orderNo}`);
                const data = await res.json();
                if (data.success && data.data.orders.length > 0) {
                    const latestOrder = data.data.orders[0];
                    if (latestOrder.status === "PAID" || latestOrder.status === "SHIPPED") {
                        clearInterval(timerRef.current);
                        showSuccess("支付成功");
                        router.push(`/pay/result?orderNo=${orderNo}`);
                    }
                }
            } catch (e) {
                console.error("轮询失败", e);
            }
        };

        timerRef.current = setInterval(checkStatus, 3000);

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [order, orderNo, router, showSuccess]);

    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-brand-gold" />
            </div>
        );
    }

    if (!order) return null;

    return (
        <div className="min-h-screen bg-[#FAFAFA] pb-20 pt-24 md:pt-32">
            <div className="mx-auto max-w-lg px-6">
                <div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-black/5">
                    <p className="text-sm text-brand-brown/60">订单金额</p>
                    <div className="mt-2 text-4xl font-bold text-brand-brown">
                        ¥{order.payAmount.toFixed(2)}
                    </div>

                    {/* 支付方式选择 */}
                    <div className="mt-8 flex justify-center gap-4 flex-wrap">
                        <button
                            onClick={() => setPayMethod("wechat")}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all ${payMethod === "wechat"
                                ? "border-green-500 bg-green-50 text-green-700"
                                : "border-gray-200 hover:border-green-200"
                                }`}
                        >
                            <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center text-white text-xs">W</div>
                            <span>微信支付</span>
                        </button>
                        <button
                            onClick={() => setPayMethod("alipay")}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all ${payMethod === "alipay"
                                ? "border-blue-500 bg-blue-50 text-blue-700"
                                : "border-gray-200 hover:border-blue-200"
                                }`}
                        >
                            <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs">A</div>
                            <span>支付宝</span>
                        </button>
                        <button
                            onClick={() => setPayMethod("unionpay")}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all ${payMethod === "unionpay"
                                ? "border-red-500 bg-red-50 text-red-700"
                                : "border-gray-200 hover:border-red-200"
                                }`}
                        >
                            <div className="w-5 h-5 bg-gradient-to-r from-red-500 to-blue-500 rounded-full flex items-center justify-center text-white text-xs text-[8px] overflow-hidden">
                                银联
                            </div>
                            <span>银行卡</span>
                        </button>
                    </div>

                    <div className="mt-8 flex justify-center">
                        {mwebUrl || (payMethod === "unionpay" && !codeUrl) ? (
                            <div className="space-y-4">
                                <p>正在跳转支付...</p>
                                {(payMethod === "wechat" || payMethod === "alipay") && (
                                    <Button onClick={() => window.location.href = mwebUrl}>
                                        点击跳转
                                    </Button>
                                )}
                            </div>
                        ) : codeUrl ? (
                            <div className="space-y-4">
                                <div className="mx-auto flex h-64 w-64 items-center justify-center rounded-xl border border-brand-gold/20 bg-white p-4 shadow-inner">
                                    <QRCodeSVG value={codeUrl} size={220} />
                                </div>
                                <div className="flex items-center justify-center gap-2 text-sm text-brand-brown/60">
                                    <Smartphone className="h-4 w-4" />
                                    请使用{payMethod === "wechat" ? "微信" : payMethod === "alipay" ? "支付宝" : "云闪付"}扫一扫
                                </div>
                            </div>
                        ) : (
                            <div className="py-12">
                                <Loader2 className="mx-auto h-8 w-8 animate-spin text-brand-gold" />
                                <p className="mt-4 text-sm text-brand-brown/60">正在生成支付信息...</p>
                            </div>
                        )}
                    </div>

                    <div className="mt-8 border-t border-dashed border-gray-200 pt-6">
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-500">订单编号</span>
                            <span className="font-medium text-brand-brown">{order.orderNo}</span>
                        </div>
                        <div className="mt-2 flex justify-between text-sm">
                            <span className="text-gray-500">下单时间</span>
                            <span className="font-medium text-brand-brown">
                                {new Date(order.createdAt).toLocaleString()}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

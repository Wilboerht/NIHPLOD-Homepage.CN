"use client";

import { useSearchParams } from "next/navigation";
import { Link } from "next-view-transitions";
import { Button } from "@/components/ui/Button";
import { CheckCircle } from "lucide-react";
import { Suspense, useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { trackEvent } from "@/lib/analytics";
import { AnimatePresence, m } from "framer-motion";
import Image from "next/image";
import { X } from "lucide-react";

function PayResultClient() {
  const searchParams = useSearchParams();
  const orderNo = searchParams.get("orderNo");
  const { openUserCenter } = useAuth();
  const [qrModalOpen, setQrModalOpen] = useState(false);

  // GA: purchase 事件（作为 PayModal 之外的回退追踪）
  useEffect(() => {
    if (orderNo) {
      // 尝试从 sessionStorage 恢复订单 items（PayModal 缓存的）
      let items: Array<{ productId: string; productName: string; price: number; quantity: number }> | undefined;
      try {
        const cached = sessionStorage.getItem("pending_purchase_items");
        if (cached) {
          items = JSON.parse(cached);
          sessionStorage.removeItem("pending_purchase_items");
        }
      } catch { /* ignore */ }

      trackEvent("purchase", {
        transaction_id: orderNo,
        currency: "CNY",
        ...(items && {
          items: items.map((item) => ({
            item_id: item.productId,
            item_name: item.productName,
            price: item.price,
            quantity: item.quantity,
          })),
        }),
      });
    }
  }, [orderNo]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#FAFAFA] pb-20 pt-24 md:pt-32">
      <div className="mx-auto max-w-lg px-6 text-center">
        <div className="mb-6 flex justify-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-100 text-green-600">
            <CheckCircle className="h-10 w-10" />
          </div>
        </div>

        <h1 className="text-brand-brown mb-4 font-serif text-3xl">支付成功</h1>
        <p className="text-brand-brown/60 mb-8">
          感谢您的购买！我们会尽快为您发货。
          {orderNo && <br />}
          {orderNo && <span className="text-sm">订单编号: {orderNo}</span>}
        </p>

        {/* 服务号关注引导 */}
        <div className="mb-8 rounded-2xl border border-brand-charcoal/10 bg-[#FBF8F0] p-6">
          <p className="mb-3 text-sm font-light tracking-[0.06em] text-brand-charcoal">
            扫码关注 NIHPLOD 服务号
          </p>
          <p className="mb-4 text-xs font-light tracking-[0.04em] text-brand-charcoal/60">
            实时追踪订单物流，获取专属护肤建议与会员福利
          </p>
          {/* PC 端：hover 显示 */}
          <div className="group relative mx-auto hidden w-fit cursor-pointer md:block">
            <div className="mx-auto h-[120px] w-[120px] overflow-hidden rounded-xl border border-brand-beige">
              <Image
                src="/images/wechat-qrcode.jpg"
                alt="NIHPLOD 微信服务号"
                width={120}
                height={120}
                unoptimized
                className="h-full w-full object-cover"
              />
            </div>
            <p className="mt-2 text-center text-[11px] tracking-[0.06em] text-brand-charcoal/40">
              长按或截图扫码关注
            </p>
          </div>
          {/* 移动端：点击弹出 */}
          <button
            type="button"
            onClick={() => setQrModalOpen(true)}
            className="mx-auto flex items-center gap-2 rounded-lg border border-brand-charcoal/20 px-4 py-2.5 text-sm font-light tracking-[0.06em] text-brand-charcoal transition-colors active:bg-brand-charcoal/5 md:hidden"
          >
            点击查看服务号二维码
          </button>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => openUserCenter("orders")}
          >
            查看订单
          </Button>
          <Link href="/">
            <Button className="w-full sm:w-auto">返回首页</Button>
          </Link>
        </div>
      </div>

      {/* 移动端二维码模态框 */}
      <AnimatePresence>
        {qrModalOpen && (
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-brand-charcoal/30 backdrop-blur-sm md:hidden"
            onClick={() => setQrModalOpen(false)}
          >
            <m.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
              className="mx-6 flex flex-col items-center rounded-2xl bg-white p-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <Image
                src="/images/wechat-qrcode.jpg"
                alt="NIHPLOD 微信服务号"
                width={200}
                height={200}
                unoptimized
                className="h-[200px] w-[200px] rounded-lg"
              />
              <p className="mt-4 text-[13px] font-light tracking-[0.06em] text-brand-charcoal/60">
                扫码关注 NIHPLOD 服务号
              </p>
              <button
                type="button"
                onClick={() => setQrModalOpen(false)}
                className="mt-4 flex h-8 w-8 items-center justify-center rounded-full transition-colors active:bg-brand-charcoal/5"
                aria-label="关闭"
              >
                <X className="h-4 w-4 text-brand-charcoal/40" strokeWidth={1.5} />
              </button>
            </m.div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function PayResultPage() {
  return (
    <Suspense>
      <PayResultClient />
    </Suspense>
  );
}

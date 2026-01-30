
"use client";

import { useSearchParams } from "next/navigation";
import { Link } from "next-view-transitions";
import { Button } from "@/components/ui/Button";
import { CheckCircle } from "lucide-react";
import { Suspense } from "react";

function PayResultClient() {
  const searchParams = useSearchParams();
  const orderNo = searchParams.get("orderNo");

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#FAFAFA] pb-20 pt-24 md:pt-32">
      <div className="mx-auto max-w-lg px-6 text-center">
        <div className="mb-6 flex justify-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-100 text-green-600">
            <CheckCircle className="h-10 w-10" />
          </div>
        </div>

        <h1 className="mb-4 font-serif text-3xl text-brand-brown">支付成功</h1>
        <p className="mb-8 text-brand-brown/60">
          感谢您的购买！我们会尽快为您发货。
          {orderNo && <br />}
          {orderNo && <span className="text-sm">订单编号: {orderNo}</span>}
        </p>

        <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
          <Link href="/user/orders">
            <Button variant="outline" className="w-full sm:w-auto">查看订单</Button>
          </Link>
          <Link href="/">
            <Button className="w-full sm:w-auto">返回首页</Button>
          </Link>
        </div>
      </div>
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

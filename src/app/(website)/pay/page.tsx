
import { Metadata } from "next";
import { Suspense } from "react";
import { PayClient } from "./PayClient";
import { Loader2 } from "lucide-react";

export const metadata: Metadata = {
    title: "支付订单",
};

export default function PayPage() {
    return (
        <Suspense
            fallback={
                <div className="flex min-h-screen items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-brand-gold" />
                </div>
            }
        >
            <PayClient />
        </Suspense>
    );
}

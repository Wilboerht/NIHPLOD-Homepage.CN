
import { redirect } from "next/navigation";

export default function CheckoutPage() {
    // 结算统一使用全局弹窗链路
    redirect("/cart?openCheckout=1");
}

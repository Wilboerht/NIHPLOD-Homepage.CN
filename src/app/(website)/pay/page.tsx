
import { redirect } from "next/navigation";

export default function PayPage() {
    // 支付统一使用全局支付弹窗链路
    redirect("/cart");
}

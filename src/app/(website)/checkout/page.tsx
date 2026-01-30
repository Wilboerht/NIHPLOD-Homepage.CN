
import { Metadata } from "next";
import { CheckoutClient } from "./CheckoutClient";

export const metadata: Metadata = {
    title: "结算 | NIHPLOD 旎柏",
    description: "安全结算您的订单",
};

export default function CheckoutPage() {
    return <CheckoutClient />;
}

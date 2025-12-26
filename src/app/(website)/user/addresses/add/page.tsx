/**
 * 添加地址页面
 */
import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentLoginUser } from "@/lib/auth";
import AddressForm from "../AddressForm";

export const metadata: Metadata = {
  title: "添加地址 - 你好朵朵",
  description: "添加新的收货地址",
};

export default async function AddAddressPage() {
  const user = await getCurrentLoginUser();
  
  if (!user) {
    redirect("/login?redirect=/user/addresses/add");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 页面头部 */}
      <div className="bg-white border-b">
        <div className="container mx-auto px-4 py-4">
          <h1 className="text-lg font-semibold text-gray-900">添加地址</h1>
        </div>
      </div>

      {/* 表单 */}
      <div className="container mx-auto px-4 py-6">
        <AddressForm />
      </div>
    </div>
  );
}


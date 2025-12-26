/**
 * 收货地址管理页面
 */
import { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentLoginUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import AddressList from "./AddressList";

export const metadata: Metadata = {
  title: "收货地址 - 你好朵朵",
  description: "管理您的收货地址",
};

export default async function AddressesPage() {
  // 获取当前用户
  const user = await getCurrentLoginUser();
  
  if (!user) {
    redirect("/login?redirect=/user/addresses");
  }

  // 获取地址列表
  const addresses = await prisma.address.findMany({
    where: { userId: user.id },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 页面头部 */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-900">收货地址</h1>
          <Link
            href="/user/addresses/add"
            className="px-4 py-2 bg-pink-500 text-white text-sm rounded-lg hover:bg-pink-600 transition-colors"
          >
            新增地址
          </Link>
        </div>
      </div>

      {/* 地址列表 */}
      <div className="container mx-auto px-4 py-6">
        {addresses.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-500 mb-4">暂无收货地址</p>
            <Link
              href="/user/addresses/add"
              className="inline-block px-6 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 transition-colors"
            >
              添加地址
            </Link>
          </div>
        ) : (
          <AddressList initialAddresses={addresses} />
        )}
      </div>
    </div>
  );
}


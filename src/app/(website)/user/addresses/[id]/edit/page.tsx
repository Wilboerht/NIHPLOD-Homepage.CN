/**
 * 编辑地址页面
 */
import { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { getCurrentLoginUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import AddressForm from "../../AddressForm";

export const metadata: Metadata = {
  title: "编辑地址 - 你好朵朵",
  description: "编辑收货地址",
};

interface EditAddressPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditAddressPage({ params }: EditAddressPageProps) {
  const user = await getCurrentLoginUser();
  
  if (!user) {
    redirect("/login?redirect=/user/addresses");
  }

  const { id } = await params;

  // 获取地址
  const address = await prisma.address.findFirst({
    where: { id, userId: user.id },
  });

  if (!address) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 页面头部 */}
      <div className="bg-white border-b">
        <div className="container mx-auto px-4 py-4">
          <h1 className="text-lg font-semibold text-gray-900">编辑地址</h1>
        </div>
      </div>

      {/* 表单 */}
      <div className="container mx-auto px-4 py-6">
        <AddressForm address={address} />
      </div>
    </div>
  );
}


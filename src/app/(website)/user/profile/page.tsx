/**
 * 用户资料编辑页面
 */
import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentLoginUser } from "@/lib/auth";
import ProfileForm from "./ProfileForm";

export const metadata: Metadata = {
  title: "编辑资料 - 你好朵朵",
  description: "编辑您的个人资料",
};

export default async function ProfilePage() {
  // 获取当前用户
  const user = await getCurrentLoginUser();
  
  if (!user) {
    redirect("/login?redirect=/user/profile");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 页面头部 */}
      <div className="bg-white border-b">
        <div className="container mx-auto px-4 py-4">
          <h1 className="text-lg font-semibold text-gray-900">编辑资料</h1>
        </div>
      </div>

      {/* 表单 */}
      <div className="container mx-auto px-4 py-6">
        <ProfileForm user={user} />
      </div>
    </div>
  );
}


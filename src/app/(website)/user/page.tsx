/* eslint-disable @next/next/no-img-element */
/**
 * 用户中心页面
 */
import { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentLoginUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "个人中心 - 你好朵朵",
  description: "管理您的账户和订单",
};

export default async function UserPage() {
  // 获取当前用户
  const user = await getCurrentLoginUser();

  if (!user) {
    redirect("/login?redirect=/user");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 用户信息卡片 */}
      <div className="bg-gradient-to-r from-pink-500 to-rose-500 text-white">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center gap-4">
            {/* 头像 */}
            <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center overflow-hidden">
              {user.avatar ? (
                <img src={user.avatar} alt="头像" className="w-full h-full object-cover" />
              ) : (
                <svg className="w-8 h-8 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              )}
            </div>

            {/* 用户名和手机号 */}
            <div className="flex-1">
              <h1 className="text-xl font-bold">
                {user.nickname || `用户${user.phone.slice(-4)}`}
              </h1>
              <p className="text-white/80 text-sm">
                {user.phone.slice(0, 3)}****{user.phone.slice(-4)}
              </p>
            </div>

            {/* 编辑按钮 */}
            <Link
              href="/user/profile"
              className="px-4 py-2 bg-white/20 rounded-full text-sm hover:bg-white/30 transition-colors"
            >
              编辑资料
            </Link>
          </div>
        </div>
      </div>

      {/* 功能菜单 */}
      <div className="container mx-auto px-4 py-6">
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <MenuItem
            href="/user/orders"
            icon="📦"
            title="我的订单"
            desc="查看全部订单"
          />
          <MenuItem
            href="/user/addresses"
            icon="📍"
            title="收货地址"
            desc="管理收货地址"
          />
          <MenuItem
            href="/user/coupons"
            icon="🎟️"
            title="我的优惠券"
            desc="查看可用优惠券"
          />

          <MenuItem
            href="/user/conversations"
            icon="💬"
            title="咨询记录"
            desc="查看咨询历史"
          />
        </div>

        {/* 退出登录 */}
        <div className="mt-6">
          <LogoutButton />
        </div>
      </div>
    </div>
  );
}

// 菜单项组件
function MenuItem({ href, icon, title, desc }: {
  href: string;
  icon: string;
  title: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-4 px-4 py-4 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors"
    >
      <span className="text-2xl">{icon}</span>
      <div className="flex-1">
        <p className="font-medium text-gray-900">{title}</p>
        <p className="text-sm text-gray-500">{desc}</p>
      </div>
      <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  );
}

// 退出登录按钮（客户端组件）
function LogoutButton() {
  return (
    <form action="/api/auth/logout" method="POST">
      <button
        type="submit"
        className="w-full py-3 text-center text-red-500 bg-white rounded-xl shadow-sm hover:bg-red-50 transition-colors"
      >
        退出登录
      </button>
    </form>
  );
}


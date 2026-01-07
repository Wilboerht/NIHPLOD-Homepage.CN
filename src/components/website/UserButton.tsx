/* eslint-disable @next/next/no-img-element */
"use client";

/**
 * 用户按钮组件
 * 未登录显示登录/注册按钮，已登录点击打开用户中心弹窗
 */
import { User } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export function UserButton() {
  const { user, isLoading, openLoginModal, openRegisterModal, openUserCenter } = useAuth();

  if (isLoading) {
    return (
      <div className="h-9 w-9 animate-pulse rounded-full bg-gray-200" />
    );
  }

  // 未登录：显示登录/注册按钮
  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={openLoginModal}
          className="rounded-full px-4 py-2 text-sm font-medium text-brand-charcoal/70 transition-colors hover:text-brand-charcoal"
        >
          登录
        </button>
        <button
          onClick={openRegisterModal}
          className="flex items-center gap-1.5 rounded-full bg-brand-gold px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-brand-gold/90 hover:shadow-md"
        >
          <User className="h-3.5 w-3.5" />
          <span>注册</span>
        </button>
      </div>
    );
  }

  // 已登录：点击打开用户中心弹窗
  return (
    <button
      onClick={() => openUserCenter("profile")}
      className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-gold/10 text-brand-gold transition-colors hover:bg-brand-gold/20"
    >
      {user.avatar ? (
        <img
          src={user.avatar}
          alt={user.nickname || "用户"}
          className="h-9 w-9 rounded-full object-cover"
        />
      ) : (
        <User className="h-5 w-5" />
      )}
    </button>
  );
}


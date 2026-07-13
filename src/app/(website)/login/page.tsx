/**
 * 用户登录页面
 * 登录功能通过 AuthModal 模态框实现，此页面作为 SEO 友好的入口重定向到首页
 */
import { Metadata } from "next";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { USER_COOKIE_NAME } from "@/types/auth";
import { verifyUserToken } from "@/lib/jwt";

export const metadata: Metadata = {
  title: "登录",
  robots: {
    index: false,
    follow: false,
  },
};

interface LoginPageProps {
  searchParams: Promise<{ redirect?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { redirect: redirectTo } = await searchParams;

  // 检查是否已登录
  const cookieStore = await cookies();
  const token = cookieStore.get(USER_COOKIE_NAME)?.value;

  if (token) {
    const payload = await verifyUserToken(token);
    if (payload) {
      // 已登录，重定向到目标页面或首页
      redirect(redirectTo || "/");
    }
  }

  // 未登录，重定向到首页（用户可通过点击登录按钮打开模态框）
  redirect("/");
}


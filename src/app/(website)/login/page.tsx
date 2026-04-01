/**
 * 用户登录页面
 * 现在登录功能已改为模态框，此页面重定向到首页
 */
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { USER_COOKIE_NAME } from "@/types/auth";
import { verifyUserToken } from "@/lib/jwt";

interface LoginPageProps {
  searchParams: { redirect?: string };
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = searchParams;

  // 检查是否已登录
  const cookieStore = cookies();
  const token = cookieStore.get(USER_COOKIE_NAME)?.value;

  if (token) {
    const payload = await verifyUserToken(token);
    if (payload) {
      // 已登录，重定向到目标页面
      redirect(params.redirect || "/");
    }
  }

  // 未登录，重定向到首页（用户可以通过点击登录按钮打开模态框）
  redirect("/");
}


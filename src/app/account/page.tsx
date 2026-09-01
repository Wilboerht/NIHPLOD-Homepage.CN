import { redirect } from "next/navigation";
import { isUserCenterTab } from "@/lib/user-center-tab";

/**
 * NIHPLOD 统一用户中心（兼容入口）
 * /account
 *
 * 原独立用户中心页已收敛进首页用户中心弹窗（面板抽取 + 三外壳），
 * 此路由保留为兼容入口：重定向到 /?account=<tab>，由首页客户端逻辑
 * 检测 account query 自动打开弹窗并切换到对应 tab。
 *
 * - 支持 ?tab=<tab> 显式指定目标 tab（白名单见 user-center-tab.ts）；
 * - 无 tab 参数时默认 profile：个人信息本就是弹窗默认视图
 *   （安全设置/密码管理已合并进个人信息面板）。
 *
 * 未登录链路：未登录用户被重定向到 /?account=<tab> 后，由首页在未登录时
 * 再跳 /login?return_to=/?account=<tab>，登录成功回到首页并自动打开弹窗。
 */
export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const target = isUserCenterTab(tab) ? tab : "profile";
  redirect(`/?account=${target}`);
}

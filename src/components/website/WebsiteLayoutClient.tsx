"use client";

import { ReactNode, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LayoutProvider } from "@/contexts/LayoutContext";
import { BottomNavBar } from "@/components/website/BottomNavBar";
import { AccountDeletionBanner } from "@/components/website/AccountDeletionBanner";
import { useAuth, type UserCenterView } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/Toast";
import { isUserCenterTab } from "@/lib/user-center-tab";
import { cn, isBottomNavHiddenRoute } from "@/lib/utils";

/**
 * MainContent
 *
 * 全局唯一的 <main> 容器。
 * 仅在当前路由显示 BottomNavBar 时保留底部 padding（pb-28 lg:pb-24），
 * 避免独立全屏页面等隐藏导航的页面底部露出全局 Kinetic 背景。
 */
export function MainContent({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const showNavPadding = !isBottomNavHiddenRoute(pathname);

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className={cn(
        "pointer-events-none relative z-10 [&>*]:pointer-events-auto",
        showNavPadding && "pb-28 lg:pb-24"
      )}
    >
      {children}
    </main>
  );
}

const CONSENT_EXEMPT_PREFIXES = [
  "/consent",
  "/privacy",
  "/terms",
  "/login",
  "/logout",
  "/admin",
  "/account/embed",
];

/**
 * 已登录但尚未完成当前政策同意的用户，统一引导到 /consent。
 * 覆盖手机号登录、微信/抖音登录、扫码登录等所有进入网站的会话。
 */
function ConsentGate() {
  const { user, isLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (isLoading || !user) return;
    if (CONSENT_EXEMPT_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
      return;
    }

    const controller = new AbortController();
    fetch("/api/user/consent", {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { success?: boolean; data?: { required?: boolean } } | null) => {
        if (!data?.success || data.data?.required !== true) return;
        const returnTo = `${window.location.pathname}${window.location.search}`;
        router.replace(`/consent?return_to=${encodeURIComponent(returnTo)}`);
      })
      .catch(() => {
        // 网络异常时不阻断页面；下一次路由/刷新会再次检查。
      });

    return () => controller.abort();
  }, [isLoading, pathname, router, user]);

  return null;
}

/**
 * WebsiteLayoutClient
 *
 * 职责：
 * 1. 提供 LayoutContext (布局折叠状态)
 * 2. 渲染全局唯一 BottomNavBar (路由切换时闪烁)
 * 3. 包装页面内容
 */
export function WebsiteLayoutClient({ children }: { children: ReactNode }) {
  const { user, isLoading, refreshUser, openUserCenter, redirectToLogin, redirectToWechatBind } =
    useAuth();
  const toast = useToast();
  // /account 重定向带来的待打开 tab（account query 参数只消费一次）
  const pendingAccountViewRef = useRef<UserCenterView>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const wechatAuth = params.get("wechat_auth");
    if (!wechatAuth) return;

    // 服务端 reason（具体中文原因）与错误码：在清理 URL 前先取出
    const wechatErrorCode = params.get("code");
    const rawWechatMessage = params.get("message");
    const wechatErrorMessage = rawWechatMessage
      ? rawWechatMessage.replace(/[\r\n\t]/g, " ").slice(0, 120)
      : null;

    // 清理 URL 参数
    const cleanUrl = window.location.pathname + window.location.hash;
    window.history.replaceState({}, document.title, cleanUrl);

    if (wechatAuth === "success") {
      refreshUser(true).then(() => {
        openUserCenter();
      });
    } else if (wechatAuth === "binding_required") {
      redirectToWechatBind();
    } else if (wechatAuth === "error") {
      // 优先展示服务端具体原因（如"您取消了微信授权"），只保留兜底文案给未知情况
      const fallbackByCode: Record<string, string> = {
        WECHAT_DENIED: "您取消了微信授权",
        INVALID_STATE: "授权状态校验失败，请重试",
        MISSING_CODE: "微信授权信息不完整，请重试",
        WECHAT_AUTH_FAILED: "账户暂时无法使用微信登录，请使用手机号登录或联系客服",
        INTERNAL_ERROR: "微信授权失败，请稍后重试",
      };
      toast.error(
        wechatErrorMessage ||
          (wechatErrorCode ? fallbackByCode[wechatErrorCode] : undefined) ||
          "微信授权失败，请重试"
      );
    }
  }, [refreshUser, openUserCenter, redirectToWechatBind, toast]);

  // /account 重定向入口（第一步）：捕获 account query 参数并清理 URL。
  // 与下面的消费 effect 分离，避免等待登录态期间参数被清掉后丢失目标 tab。
  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const accountTab = params.get("account");
    if (!accountTab || pendingAccountViewRef.current !== null) return;

    pendingAccountViewRef.current = isUserCenterTab(accountTab) ? accountTab : "profile";
    window.history.replaceState(
      {},
      document.title,
      window.location.pathname + window.location.hash
    );
  }, []);

  // /account 重定向入口（第二步）：登录态确认后打开弹窗；
  // 未登录则跳统一登录页，return_to 指回 /?account=<tab>，
  // 登录成功回到本站后重新走此链路自动打开弹窗。
  useEffect(() => {
    const view = pendingAccountViewRef.current;
    if (!view || isLoading) return;

    pendingAccountViewRef.current = null;
    if (user) {
      openUserCenter(view);
    } else {
      redirectToLogin(`/?account=${view}`);
    }
  }, [user, isLoading, openUserCenter, redirectToLogin]);

  return (
    <LayoutProvider>
      <ConsentGate />
      {/* 注册冷静期全局横幅：有 PENDING 注销申请时展示，fixed 定位不影响布局 */}
      <AccountDeletionBanner />
      {children}
      <BottomNavBar />
    </LayoutProvider>
  );
}

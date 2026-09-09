"use client";

/**
 * 用户中心弹窗组件
 * 品牌风格 - 左侧菜单 + 右侧内容（桌面）；移动端全屏 + 底部 Tab 导航
 *
 * 移动端（<768px）：
 * - 底部抽屉形态：顶部留缝（calc(100dvh - 2.5rem)），两角圆角（rounded-t-3xl），
 *   上滑进场时可见完整滑过轨迹；顶部遮罩透出浮层层次；
 * - 顶部 Header 跟随抽屉顶部（不再覆盖状态栏/灵动岛，无需 safe-area-top 补偿）；
 * - 侧边栏改为底部 Tab 栏（4 个一级入口），两级导航收敛为单级；
 * - 底部保持贴边（Tab 栏 + safe-area-bottom）；
 * - 键盘弹起时 dvh 自动收缩、内容保持可滚动。
 * 桌面端（≥768px）保持原居中卡片（侧边栏 + 内容 + 独立关闭按钮）。
 */
import { useEffect, useRef } from "react";
import { useMounted } from "@/hooks/useMounted";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { createPortal } from "react-dom";
import { m, AnimatePresence, useReducedMotion, useDragControls } from "framer-motion";
import Image from "next/image";
import { X, User, LogOut, Crown, Gift, Shield } from "lucide-react";
import { useAuth, type UserCenterView } from "@/contexts/AuthContext";
import { levelMeta } from "@/lib/membership";
import { ProfilePanel } from "./user-center/panels/ProfilePanel";
import { VipPanel } from "./user-center/VipPanel";
import { PointsMallPanel } from "./user-center/panels/PointsMallPanel";
import { SecurityCenterPanel } from "./user-center/panels/SecurityCenterPanel";

// 菜单项配置：四个一级入口。设备管理/授权管理/登录历史已合并进安全中心
// （对应 /account 旧链接经 openUserCenter 归一化为 security + 分段）。
const MENU_ITEMS: { id: UserCenterView; label: string; icon: typeof User }[] = [
  { id: "profile", label: "个人信息", icon: User },
  { id: "vip", label: "会员中心", icon: Crown },
  { id: "mall", label: "积分商城", icon: Gift },
  { id: "security", label: "安全中心", icon: Shield },
];

// 侧边栏等级徽标样式（四档）
const LEVEL_PILL_STYLES: Record<string, string> = {
  REGULAR: "border-stone-200 bg-stone-100 text-stone-500",
  SILVER: "border-zinc-200 bg-zinc-50 text-zinc-600",
  GOLD: "border-amber-200 bg-amber-50 text-amber-700",
  DIAMOND: "border-indigo-200 bg-indigo-50 text-indigo-700",
};

export function UserCenterModal() {
  const { user, userCenterOpen, userCenterView, closeUserCenter, setUserCenterView, logout } =
    useAuth();
  const mounted = useMounted();
  // 用户系统偏好减少动画时停用背景光斑循环动画
  const reduceMotion = useReducedMotion();
  // 与 CSS md 断点（768px）对齐：移动端全屏壳，桌面端居中卡片壳
  const isMobile = useMediaQuery("(max-width: 767px)");
  const dialogRef = useRef<HTMLDivElement>(null);
  const lastFocusedElementRef = useRef<HTMLElement | null>(null);
  // 移动端 sheet 下滑关闭：手势只在头部触发（content 滚动不受影响），拖拽移动整个弹窗
  const dragControls = useDragControls();

  // 禁止背景滚动
  useEffect(() => {
    if (userCenterOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [userCenterOpen]);

  // ESC 关闭
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeUserCenter();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [closeUserCenter]);

  // 打开时聚焦弹窗，关闭后归位焦点
  useEffect(() => {
    if (userCenterOpen) {
      lastFocusedElementRef.current = document.activeElement as HTMLElement | null;
      requestAnimationFrame(() => {
        dialogRef.current?.focus();
      });
      return;
    }

    lastFocusedElementRef.current?.focus();
  }, [userCenterOpen]);

  // 焦点陷阱：Tab 键只在弹窗内部循环
  useEffect(() => {
    if (!userCenterOpen) return;

    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;

      const dialog = dialogRef.current;
      if (!dialog) return;

      const focusable = dialog.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );

      if (focusable.length === 0) {
        e.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }

      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      }
    };

    window.addEventListener("keydown", handleTabKey);
    return () => window.removeEventListener("keydown", handleTabKey);
  }, [userCenterOpen]);

  if (!mounted || !user) return null;

  const handleLogout = async () => {
    await logout();
  };

  const content = (
    <AnimatePresence>
      {userCenterOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-0 md:p-4">
          {/* 遮罩：仅桌面有可点击边距；移动端全屏遮罩仅供淡入语义 */}
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={closeUserCenter}
            className="absolute inset-0 bg-black/40 md:backdrop-blur-sm"
          />

          {/* 弹窗主体：移动端全屏（上滑进场），桌面端居中卡片（缩放淡入） */}
          <m.div
            initial={isMobile ? { y: "100%" } : { opacity: 0, scale: 0.95, y: 10 }}
            animate={isMobile ? { y: 0 } : { opacity: 1, scale: 1, y: 0 }}
            exit={isMobile ? { y: "100%" } : { opacity: 0, scale: 0.95, y: 10 }}
            transition={
              isMobile
                ? { duration: 0.3, ease: [0.32, 0.72, 0, 1] }
                : { duration: 0.25, ease: "easeOut" }
            }
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="用户中心"
            tabIndex={-1}
            drag={isMobile ? "y" : false}
            dragListener={false}
            dragControls={dragControls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.35 }}
            onDragEnd={(_, info) => {
              if (isMobile && (info.offset.y > 120 || info.velocity.y > 700)) {
                closeUserCenter();
              }
            }}
            className="relative z-10 flex w-full items-center justify-center outline-none md:h-[min(680px,calc(100dvh-3rem))] md:max-w-[1100px]"
          >
            <div className="relative flex h-[calc(100vh-2.5rem)] w-full items-stretch overflow-hidden rounded-t-3xl shadow-none supports-[height:100dvh]:h-[calc(100dvh-2.5rem)] md:h-full md:rounded-[2.5rem] md:shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)]">
              {/* 底层基础色 */}
              <div className="absolute inset-0 z-0 bg-[#FBF8F0]" />

              {/* 背景动态装饰层 (位于模糊层之下)，移动端全屏仅纯色底以保低端机性能 */}
              <div className="pointer-events-none absolute inset-0 z-10 hidden overflow-hidden md:block">
                <m.div
                  animate={
                    reduceMotion
                      ? undefined
                      : {
                          x: ["-30%", "40%", "10%", "-30%"],
                          y: ["-30%", "20%", "40%", "-30%"],
                          rotate: [0, 180, 360],
                          scale: [1, 1.4, 1.2, 1],
                        }
                  }
                  transition={{
                    duration: 25,
                    repeat: Infinity,
                    ease: "linear",
                  }}
                  style={{ willChange: "transform" }}
                  className="absolute h-[120%] w-[120%] rounded-full bg-brand-primary/10 blur-[150px]"
                />
                <m.div
                  animate={
                    reduceMotion
                      ? undefined
                      : {
                          x: ["40%", "-20%", "30%", "40%"],
                          y: ["40%", "10%", "-30%", "40%"],
                          rotate: [0, -180, -360],
                          scale: [1, 1.3, 1.1, 1],
                        }
                  }
                  transition={{
                    duration: 35,
                    repeat: Infinity,
                    ease: "linear",
                  }}
                  style={{ willChange: "transform" }}
                  className="absolute h-[110%] w-[110%] rounded-full bg-stone-400/15 blur-[130px]"
                />
              </div>

              {/* 模糊与纹理盖层 (在此之下的内容会被模糊)，仅桌面端渲染 */}
              <div className="absolute inset-0 z-20 hidden bg-white/5 backdrop-blur-[40px] md:block" />
              <div className="pointer-events-none absolute inset-0 z-20 hidden bg-[url('/textures/mineral-grain.png')] opacity-[0.05] mix-blend-overlay md:block" />

              {/* 内容区域容器 (最上层)：移动端 flex-col（头 + 内容 + 底部 Tab），桌面 flex-row（侧边栏 + 内容） */}
              <div className="relative z-30 flex h-full w-full flex-col items-stretch md:flex-row">
                {/* 桌面侧边栏（移动端由底部 Tab 栏替代） */}
                {!isMobile && (
                  <div className="flex w-full shrink-0 flex-col border-r border-stone-200/60 md:w-72">
                    {/* 用户头像区域 */}
                    <div className="px-16 pb-4 pt-12">
                      <div className="flex flex-col items-start gap-4 text-left">
                        <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#FBF8F0]/40 object-cover">
                          {user.avatar ? (
                            <Image
                              src={user.avatar}
                              alt="Avatar"
                              fill
                              unoptimized
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <User className="h-6 w-6 text-stone-500" strokeWidth={1.5} />
                          )}
                        </div>
                        <div className="flex flex-col justify-center">
                          <p className="truncate text-[15px] font-medium text-stone-800">
                            {user.nickname || `用户${user.phone?.slice(-4)}`}
                          </p>
                          <button
                            type="button"
                            onClick={() => setUserCenterView("vip")}
                            className={`mt-1.5 inline-flex w-fit cursor-pointer items-center rounded-full border px-2 py-0.5 text-[11px] font-light transition-colors hover:opacity-80 ${
                              LEVEL_PILL_STYLES[user.membershipLevel ?? "REGULAR"]
                            }`}
                          >
                            {levelMeta(user.membershipLevel).label}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* 菜单列表 */}
                    <nav className="scrollbar-hide relative flex w-full flex-1 flex-col items-start justify-start space-y-1 overflow-y-auto px-16 py-2">
                      {MENU_ITEMS.map((item) => {
                        const Icon = item.icon;
                        const isActive = userCenterView === item.id;
                        return (
                          <button
                            key={item.id}
                            onClick={() => setUserCenterView(item.id)}
                            className={`group relative -mx-4 flex w-full items-center justify-start gap-5 rounded-2xl px-4 py-3.5 transition-all ${
                              isActive
                                ? "font-medium text-stone-800"
                                : "font-light text-stone-400 hover:bg-white/30 hover:text-stone-800"
                            }`}
                          >
                            {isActive && (
                              <div className="pointer-events-none absolute inset-y-0 left-0 hidden items-center md:flex">
                                <m.div
                                  layoutId="activeSideMenu"
                                  className="h-[18px] w-[2px] rounded-full bg-stone-800"
                                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                />
                              </div>
                            )}
                            <Icon
                              className={`h-[18px] w-[18px] shrink-0 transition-colors ${
                                isActive
                                  ? "text-stone-800 md:text-stone-800"
                                  : "text-stone-800 group-hover:text-stone-800 md:text-stone-400"
                              }`}
                              strokeWidth={1.5}
                            />
                            <span
                              className={`text-[13px] transition-colors ${
                                isActive
                                  ? "font-light text-stone-800 md:font-medium md:text-stone-800"
                                  : "font-light text-stone-800 group-hover:text-stone-800 md:text-stone-400"
                              }`}
                            >
                              {item.label}
                            </span>
                          </button>
                        );
                      })}
                    </nav>

                    <div className="mt-auto px-12 py-8">
                      <button
                        onClick={handleLogout}
                        className="group -mx-4 flex w-full items-center justify-start gap-5 rounded-2xl px-4 py-3.5 text-stone-600 transition-all hover:bg-white/40 hover:text-stone-900"
                      >
                        <LogOut className="h-[18px] w-[18px] transition-colors" strokeWidth={1.5} />
                        <span className="text-[13px] font-medium tracking-wide">退出登录</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* 右侧内容区（移动端：标题 Header + 面板 + 底部 Tab，safe-area 适配） */}
                <div className="relative flex h-full min-w-0 flex-1 flex-col">
                  {/* 移动端统一 Header（标题 + 关闭；导航移入底部 Tab 栏）。
                       header 是下滑关闭的手势触发区（拖拽移动整个弹窗，不阻塞内容滚动） */}
                  {isMobile && (
                    <m.div
                      onPointerDown={(e) => {
                        if (!isMobile || (e.button !== undefined && e.button !== 0)) return;
                        dragControls.start(e);
                      }}
                      className="shrink-0 border-b border-stone-200/40 bg-[#FBF8F0]/80 backdrop-blur-md md:hidden"
                    >
                      {/* 下滑把手提示 */}
                      <div aria-hidden className="flex justify-center pt-2">
                        <div className="h-1 w-9 rounded-full bg-stone-300/70" />
                      </div>
                      <div className="grid h-14 grid-cols-[3.5rem_1fr_3.5rem] items-center">
                        {/* 左侧：头像（移动端补齐桌面侧边栏的身份信息），点击跳个人信息 */}
                        <div className="flex h-full items-center justify-center">
                          <button
                            type="button"
                            onClick={() => setUserCenterView("profile")}
                            aria-label="查看个人信息"
                            className="relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-white/60 transition-opacity hover:opacity-80"
                          >
                            {user.avatar ? (
                              <Image
                                src={user.avatar}
                                alt="头像"
                                fill
                                unoptimized
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <User className="h-4 w-4 text-stone-500" strokeWidth={1.5} />
                            )}
                          </button>
                        </div>
                        <h2 className="truncate text-center text-[15px] font-medium tracking-wide text-stone-800">
                          {MENU_ITEMS.find((i) => i.id === userCenterView)?.label || "个人动态"}
                        </h2>
                        <div className="flex h-full w-full items-center justify-center">
                          <button
                            onClick={closeUserCenter}
                            className="flex h-10 w-10 items-center justify-center text-stone-500 transition-colors hover:text-stone-800"
                          >
                            <X className="h-5 w-5" strokeWidth={1.5} />
                          </button>
                        </div>
                      </div>
                    </m.div>
                  )}

                  <div className="min-h-0 flex-1 overflow-hidden">
                    <ContentPanel view={userCenterView} />
                  </div>

                  {/* 移动端底部 Tab 栏（safe-area 适配手势条） */}
                  {isMobile && (
                    <nav
                      aria-label="用户中心导航"
                      className="shrink-0 border-t border-stone-200/40 bg-[#FBF8F0]/95 backdrop-blur-md md:hidden"
                      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
                    >
                      <div className="grid h-16 grid-cols-4">
                        {MENU_ITEMS.map(({ id, label, icon: Icon }) => {
                          const isActive = userCenterView === id;
                          return (
                            <button
                              key={id}
                              type="button"
                              onClick={() => setUserCenterView(id)}
                              aria-current={isActive ? "page" : undefined}
                              className={`flex flex-col items-center justify-center gap-1 transition-colors ${
                                isActive ? "text-[#00263e]" : "text-stone-400 hover:text-stone-800"
                              }`}
                            >
                              <Icon className="h-5 w-5" strokeWidth={isActive ? 2 : 1.5} />
                              <span className="text-[10px] leading-none">{label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </nav>
                  )}
                </div>

                {/* 桌面端关闭按钮 */}
                {!isMobile && (
                  <button
                    onClick={closeUserCenter}
                    aria-label="关闭用户中心"
                    className="absolute right-10 top-10 z-50 hidden h-9 w-9 items-center justify-center text-stone-400 transition-colors hover:text-stone-800 md:flex"
                  >
                    <X className="h-5 w-5" strokeWidth={1} />
                  </button>
                )}
              </div>
            </div>
          </m.div>
        </div>
      )}
    </AnimatePresence>
  );

  return createPortal(content, document.body);
}

// 内容面板路由：四个一级菜单（安全中心内部再分设备/授权/登录历史三段）
// 旧的安全类 tab 已由 openUserCenter 归一化，此处兜底同指安全中心。
function ContentPanel({ view }: { view: UserCenterView }) {
  switch (view) {
    case "vip":
      return <VipPanel />;
    case "mall":
      return <PointsMallPanel />;
    case "security":
    case "devices":
    case "authorizations":
    case "history":
      return <SecurityCenterPanel />;
    default:
      return <ProfilePanel />;
  }
}

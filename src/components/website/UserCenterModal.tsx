"use client";

/**
 * 用户中心弹窗组件
 * 品牌风格 - 左侧菜单 + 右侧内容
 */
import { useEffect, useRef, useState } from "react";
import { useMounted } from "@/hooks/useMounted";
import { createPortal } from "react-dom";
import { m, AnimatePresence, useReducedMotion } from "framer-motion";
import Image from "next/image";
import {
  X,
  User,
  LogOut,
  ArrowLeft,
  Crown,
  MonitorSmartphone,
  KeyRound,
  History,
} from "lucide-react";
import { useAuth, type UserCenterView } from "@/contexts/AuthContext";
import { levelMeta } from "@/lib/membership";
import { ProfilePanel } from "./user-center/panels/ProfilePanel";
import { VipPanel } from "./user-center/VipPanel";
import { DevicesPanel } from "./user-center/panels/DevicesPanel";
import { AuthorizationsPanel } from "./user-center/panels/AuthorizationsPanel";
import { LoginHistoryPanel } from "./user-center/panels/LoginHistoryPanel";

// 菜单项配置：五项共享面板，与 /account 重定向目标（/?account=<tab>）一一对应
// 安全设置（密码管理）已合并进个人信息面板
const MENU_ITEMS: { id: UserCenterView; label: string; icon: typeof User }[] = [
  { id: "profile", label: "个人信息", icon: User },
  { id: "vip", label: "会员中心", icon: Crown },
  { id: "devices", label: "设备管理", icon: MonitorSmartphone },
  { id: "authorizations", label: "授权管理", icon: KeyRound },
  { id: "history", label: "登录历史", icon: History },
];

export function UserCenterModal() {
  const { user, userCenterOpen, userCenterView, closeUserCenter, setUserCenterView, logout } =
    useAuth();
  const mounted = useMounted();
  // 用户系统偏好减少动画时停用背景光斑循环动画
  const reduceMotion = useReducedMotion();
  const [showMobileDetail, setShowMobileDetail] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const lastFocusedElementRef = useRef<HTMLElement | null>(null);

  // 初始加载及 PC/移动切换逻辑
  useEffect(() => {
    // 监听窗口大小，若是 PC 端直接重置详情显示状态，确保左边栏可见
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setShowMobileDetail(false);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

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
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          {/* 遮罩 */}
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={closeUserCenter}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />

          {/* 弹窗主体 */}
          <m.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="用户中心"
            tabIndex={-1}
            className="relative z-10 flex w-full max-w-[95%] items-center justify-center outline-none transition-all duration-300 md:h-[min(680px,calc(100dvh-3rem))] md:max-w-[1100px]"
          >
            <div className="relative flex h-[85vh] w-full items-stretch overflow-hidden rounded-[2.5rem] p-0 shadow-none md:h-full md:shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)]">
              {/* 底层基础色 */}
              <div className="absolute inset-0 z-0 bg-[#FBF8F0]" />

              {/* 背景动态装饰层 (位于模糊层之下) */}
              <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
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

              {/* 模糊与纹理盖层 (在此之下的内容会被模糊) */}
              <div className="absolute inset-0 z-20 bg-white/5 backdrop-blur-[40px]" />
              <div className="pointer-events-none absolute inset-0 z-20 bg-[url('/textures/mineral-grain.png')] opacity-[0.05] mix-blend-overlay" />

              {/* 内容区域容器 (最上层) */}
              <div className="relative z-30 flex w-full flex-col items-stretch md:flex-row">
                {/* 仅在移动端详情页时不显示侧边栏 */}
                <div
                  className={`flex w-full shrink-0 flex-col border-r border-stone-200/60 transition-all duration-300 md:w-72 ${
                    showMobileDetail ? "hidden md:flex" : "flex"
                  }`}
                >
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
                          onClick={() => {
                            setUserCenterView("vip");
                            if (window.innerWidth < 768) {
                              setShowMobileDetail(true);
                            }
                          }}
                          className={`mt-1.5 inline-flex w-fit cursor-pointer items-center rounded-full border px-2 py-0.5 text-[11px] font-light transition-colors hover:opacity-80 ${
                            user.membershipLevel === "ADVANCED"
                              ? "border-amber-200 bg-amber-50 text-amber-700"
                              : "border-stone-200 bg-stone-100 text-stone-500"
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
                          onClick={() => {
                            setUserCenterView(item.id);
                            if (window.innerWidth < 768) {
                              setShowMobileDetail(true);
                            }
                          }}
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
                            className={`h-[18px] w-[18px] shrink-0 transition-colors ${isActive ? "text-stone-800 md:text-stone-800" : "text-stone-800 group-hover:text-stone-800 md:text-stone-400"}`}
                            strokeWidth={1.5}
                          />
                          <span
                            className={`text-[13px] transition-colors ${isActive ? "font-light text-stone-800 md:font-medium md:text-stone-800" : "font-light text-stone-800 group-hover:text-stone-800 md:text-stone-400"}`}
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

                {/* 内容卡片 - 仅在移动端有详情时显示，PC 端始终显示 */}
                <div
                  className={`relative flex-1 transition-all duration-300 ${
                    showMobileDetail ? "flex" : "hidden md:flex"
                  }`}
                >
                  {/* 移动端统一 Header (重工业级网格强对称) */}
                  <div className="absolute left-0 right-0 top-0 z-50 grid h-14 grid-cols-[3.5rem_1fr_3.5rem] items-center border-b border-stone-200/40 bg-[#FBF8F0]/80 backdrop-blur-md md:hidden">
                    <div className="flex h-full w-full items-center justify-center">
                      <button
                        onClick={() => setShowMobileDetail(false)}
                        className="flex h-10 w-10 items-center justify-center text-stone-500 transition-colors hover:text-stone-800"
                      >
                        <ArrowLeft className="h-5 w-5" strokeWidth={1.5} />
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

                  {/* 桌面端关闭按钮 */}
                  <button
                    onClick={closeUserCenter}
                    aria-label="关闭用户中心"
                    className="absolute right-10 top-10 z-50 hidden h-9 w-9 items-center justify-center text-stone-400 transition-colors hover:text-stone-800 md:flex"
                  >
                    <X className="h-5 w-5" strokeWidth={1} />
                  </button>

                  <div className="h-full w-full overflow-hidden pt-14 md:pt-0">
                    <ContentPanel view={userCenterView} />
                  </div>
                </div>
              </div>
            </div>
          </m.div>
        </div>
      )}
    </AnimatePresence>
  );

  return createPortal(content, document.body);
}

// 内容面板路由：五个菜单项对应 panels/ 下的共享面板（与 /account/embed 复用同一实现）
function ContentPanel({ view }: { view: UserCenterView }) {
  switch (view) {
    case "vip":
      return <VipPanel />;
    case "devices":
      return <DevicesPanel />;
    case "authorizations":
      return <AuthorizationsPanel />;
    case "history":
      return <LoginHistoryPanel />;
    default:
      return <ProfilePanel />;
  }
}

/* eslint-disable @next/next/no-img-element */
"use client";

/**
 * 用户中心弹窗组件
 * 品牌风格 - 左侧菜单 + 右侧内容
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { m, AnimatePresence } from "framer-motion";
import { X, User, Package, MapPin, LogOut, ArrowLeft } from "lucide-react";
import { useAuth, type UserCenterView } from "@/contexts/AuthContext";
import { OrdersPanel } from "./user-center/OrdersPanel";
import { AddressesPanel } from "./user-center/AddressesPanel";
import { ProfilePanel } from "./user-center/ProfilePanel";

// 菜单项配置
const MENU_ITEMS: { id: UserCenterView; label: string; icon: typeof User }[] = [
  { id: "profile", label: "个人信息", icon: User },
  { id: "orders", label: "我的订单", icon: Package },
  { id: "addresses", label: "收货地址", icon: MapPin },
];

export function UserCenterModal() {
  const { user, userCenterOpen, userCenterView, closeUserCenter, setUserCenterView, logout } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [showMobileDetail, setShowMobileDetail] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const lastFocusedElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 初始加载及 PC/移动切换逻辑
  useEffect(() => {
    // 监听窗口大小，若是 PC 端直接重置详情显示状态，确保左边栏可见
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setShowMobileDetail(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
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
            className="relative z-10 w-full max-w-[95%] md:max-w-[1100px] md:h-[680px] flex items-center justify-center transition-all duration-300"
          >
            <div className="relative w-full h-[85vh] md:h-full overflow-hidden rounded-[2.5rem] bg-[#F9F8F6] shadow-none md:shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] flex items-stretch p-0">

              {/* 浮动内容区域容器 */}
              <div className="relative z-10 w-full flex flex-col md:flex-row items-stretch">
                {/* 仅在移动端详情页时不显示侧边栏 */}
                <div className={`w-full md:w-72 shrink-0 flex flex-col transition-all duration-300 border-r border-stone-200/60 ${showMobileDetail ? 'hidden md:flex' : 'flex'
                  }`}>
                  {/* 用户头像区域 */}
                  <div className="px-16 pt-12 pb-4">
                    <div className="flex flex-col items-start gap-4 text-left">
                      <div className="w-16 h-16 rounded-full bg-[#E5E0D8]/40 flex items-center justify-center overflow-hidden shrink-0 object-cover">
                        {user.avatar ? (
                          <img src={user.avatar} alt="Avatar" className="w-full h-full object-cover" />
                        ) : (
                          <User className="w-6 h-6 text-stone-500" strokeWidth={1.5} />
                        )}
                      </div>
                      <div className="flex flex-col justify-center">
                        <p className="text-stone-800 text-[15px] font-medium truncate">
                          {user.nickname || `用户${user.phone?.slice(-4)}`}
                        </p>
                        <p className="text-stone-400 text-xs font-light mt-1">
                          普通会员
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* 菜单列表 */}
                  <nav className="flex-1 w-full space-y-1 overflow-y-auto scrollbar-hide py-2 flex flex-col justify-start items-start relative px-16">
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
                          className={`relative w-full flex items-center justify-start gap-5 py-3.5 transition-all group ${isActive
                            ? "text-stone-800 font-medium"
                            : "text-stone-400 font-light hover:text-stone-800"
                            }`}
                        >
                          {isActive && (
                            <div className="absolute inset-y-0 -left-4 hidden md:flex items-center pointer-events-none">
                              <m.div
                                layoutId="activeSideMenu"
                                className="w-[2px] h-[18px] bg-stone-800 rounded-full"
                                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                              />
                            </div>
                          )}
                          <Icon className={`w-[18px] h-[18px] shrink-0 transition-colors ${isActive ? 'md:text-stone-800 text-stone-800' : 'md:text-stone-400 text-stone-800'}`} strokeWidth={1.5} />
                          <span className={`text-[13px] transition-colors ${isActive ? 'md:text-stone-800 md:font-medium text-stone-800 font-light' : 'md:text-stone-400 text-stone-800 font-light group-hover:text-stone-800'}`}>
                            {item.label}
                          </span>
                        </button>
                      );
                    })}
                  </nav>

                  {/* 退出登录 */}
                  <div className="mt-auto px-16 py-8">
                    <button
                      onClick={handleLogout}
                      className="group flex items-center justify-start gap-5 text-stone-400 hover:text-stone-800 transition-all"
                    >
                      <LogOut className="w-[18px] h-[18px] opacity-60 group-hover:opacity-100 transition-opacity" strokeWidth={1.5} />
                      <span className="text-[13px] font-medium tracking-wide">退出登录</span>
                    </button>
                  </div>
                </div>

                  {/* 内容卡片 - 仅在移动端有详情时显示，PC 端始终显示 */}
                <div className={`flex-1 relative transition-all duration-300 ${showMobileDetail ? 'flex' : 'hidden md:flex'
                  }`}>

                  {/* 移动端统一 Header (重工业级网格强对称) */}
                  <div className="absolute top-0 left-0 right-0 z-50 h-14 md:hidden grid grid-cols-[3.5rem_1fr_3.5rem] items-center bg-[#F9F8F6]/80 backdrop-blur-md border-b border-stone-200/40">
                    <div className="flex h-full w-full items-center justify-center">
                      <button
                        onClick={() => setShowMobileDetail(false)}
                        className="flex h-10 w-10 items-center justify-center text-stone-500 hover:text-stone-800 transition-colors"
                      >
                        <ArrowLeft className="h-5 w-5" strokeWidth={1.5} />
                      </button>
                    </div>
                    
                    <h2 className="text-[15px] font-medium text-stone-800 tracking-wide text-center truncate">
                      {MENU_ITEMS.find(i => i.id === userCenterView)?.label || "个人动态"}
                    </h2>

                    <div className="flex h-full w-full items-center justify-center">
                      <button
                        onClick={closeUserCenter}
                        className="flex h-10 w-10 items-center justify-center text-stone-500 hover:text-stone-800 transition-colors"
                      >
                        <X className="h-5 w-5" strokeWidth={1.5} />
                      </button>
                    </div>
                  </div>

                  {/* 桌面端关闭按钮 */}
                  <button
                    onClick={closeUserCenter}
                    aria-label="关闭用户中心"
                    className="absolute right-10 top-10 z-50 hidden md:flex h-9 w-9 items-center justify-center text-stone-400 hover:text-stone-800 transition-colors"
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

// 内容面板路由
function ContentPanel({ view }: { view: UserCenterView }) {
  switch (view) {
    case "orders": return <OrdersPanel />;
    case "addresses": return <AddressesPanel />;
    default: return <ProfilePanel />;
  }
}


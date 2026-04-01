/* eslint-disable @next/next/no-img-element */
"use client";

/**
 * 用户中心弹窗组件
 * 品牌风格 - 左侧菜单 + 右侧内容
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { m, AnimatePresence } from "framer-motion";
import { X, User, Package, MapPin, LogOut, ChevronRight, ArrowLeft } from "lucide-react";
import Image from "next/image";
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

  useEffect(() => {
    setMounted(true);
  }, []);

  // 监听视图切换，如果在移动端且切换了视图，进入详情页
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768 && userCenterOpen) {
      if (userCenterView) setShowMobileDetail(true);
    }
  }, [userCenterView, userCenterOpen]);

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
            className="relative z-10 w-full max-w-[95%] md:max-w-[1100px] md:h-[680px] flex items-center justify-center transition-all duration-300"
          >
            <div className="relative w-full max-h-[85vh] md:h-full overflow-hidden rounded-[2.5rem] bg-transparent shadow-none md:bg-black/10 md:shadow-2xl flex items-stretch md:justify-center md:p-6 p-0">

              {/* 背景图片区域 - 铺满整个卡片 */}
              <div className="absolute inset-0 z-0 hidden md:block">
                <Image
                  src="https://wp-cdn.4ce.cn/v2/vmQtAla.jpeg"
                  alt="Background"
                  fill
                  className="object-cover"
                  priority
                />
              </div>


              {/* 浮动内容区域容器 */}
              <div className="relative z-10 w-full md:w-[1040px] flex flex-col md:flex-row items-stretch gap-6">
                {/* 仅在移动端详情页时不显示侧边栏 */}
                <div className={`w-full md:w-72 shrink-0 bg-white/75 md:bg-white/40 backdrop-blur-[32px] shadow-[0_8px_32px_0_rgba(0,0,0,0.1)] border border-white/60 md:border-white/40 rounded-[2.5rem] flex flex-col overflow-hidden transition-all duration-300 ${showMobileDetail ? 'hidden md:flex' : 'flex'
                  }`}>
                  {/* 用户头像区域 */}
                  <div className="p-8 border-b border-black/5 md:border-white/20">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-full bg-brand-gold/10 flex items-center justify-center overflow-hidden border border-brand-gold/30 shadow-inner shrink-0 object-cover">
                        {user.avatar ? (
                          <img src={user.avatar} alt="Avatar" className="w-full h-full object-cover" />
                        ) : (
                          <User className="w-6 h-6 text-brand-gold" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0 flex flex-col justify-center">
                        <p className="text-brand-charcoal text-base font-semibold truncate tracking-wide">
                          {user.nickname || `用户${user.phone?.slice(-4)}`}
                        </p>
                        <p className="text-brand-charcoal/50 text-[13px] font-medium mt-1 tracking-wider uppercase">
                          普通会员
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* 菜单列表 */}
                  <nav className="flex-1 py-4 px-3 space-y-1.5 overflow-y-auto scrollbar-hide flex flex-col">
                    {MENU_ITEMS.map((item) => {
                      const Icon = item.icon;
                      const isActive = userCenterView === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => {
                            setUserCenterView(item.id);
                            if (window.innerWidth < 768) setShowMobileDetail(true);
                          }}
                          className={`relative w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-[15px] font-medium transition-all group ${isActive
                            ? "text-[#8B7355]"
                            : "text-brand-charcoal md:text-brand-charcoal/80 hover:bg-black/5 md:hover:bg-white/40 hover:text-brand-charcoal"
                            }`}
                        >
                          {isActive && (
                            <m.div
                              layoutId="activeSideMenu"
                              className="absolute inset-0 bg-brand-gold/15 border border-brand-gold/30 backdrop-blur-md rounded-xl shadow-sm"
                              transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                            />
                          )}
                          <Icon className={`relative z-10 w-[18px] h-[18px] ${isActive ? "text-[#8B7355]" : "transition-colors"}`} style={!isActive ? { color: "#666666" } : {}} />
                          <span className="relative z-10 tracking-wide">{item.label}</span>
                          <ChevronRight className={`relative z-10 w-4 h-4 ml-auto transition-opacity ${isActive ? "opacity-70" : "opacity-20 group-hover:opacity-40"}`} />
                        </button>
                      );
                    })}
                  </nav>

                  {/* 退出登录 */}
                  <div className="p-5 border-t border-black/5 md:border-white/20 mt-auto">
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center justify-center gap-2 py-3.5 text-[15px] font-medium text-red-500 hover:text-red-500 md:text-red-500/80 md:hover:text-red-600 bg-red-50/50 hover:bg-red-50/80 md:bg-white/20 md:hover:bg-white/40 rounded-xl transition-all border border-red-100/50 md:border-transparent group"
                    >
                      <LogOut className="w-[18px] h-[18px] md:opacity-80 md:group-hover:opacity-100" />
                      <span className="tracking-wide">退出登录</span>
                    </button>
                  </div>
                </div>

                {/* 内容卡片 - 仅在移动端有详情时显示，PC 端始终显示 */}
                <div className={`flex-1 bg-white/75 md:bg-white/35 backdrop-blur-[32px] md:shadow-[0_8px_32px_0_rgba(0,0,0,0.1)] md:border border-white/60 md:border-white/40 rounded-[2.5rem] overflow-hidden relative group/content transition-all duration-300 ${showMobileDetail ? 'flex' : 'hidden md:flex'
                  }`}>

                  {/* 移动端统一 Header */}
                  <div className="absolute top-0 left-0 right-0 z-50 h-16 flex items-center justify-between px-6 md:hidden">
                    <button
                      onClick={() => setShowMobileDetail(false)}
                      className={`flex h-9 w-9 items-center justify-center rounded-full bg-black/5 text-brand-charcoal/60 transition-all border border-black/5 ${!showMobileDetail ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
                    >
                      <ArrowLeft className="h-5 w-5" />
                    </button>

                    <button
                      onClick={closeUserCenter}
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-black/5 text-brand-charcoal/40 transition-all border border-black/5"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  {/* 桌面端关闭按钮 */}
                  <button
                    onClick={closeUserCenter}
                    className="absolute right-6 top-6 z-50 hidden md:flex h-9 w-9 items-center justify-center rounded-full bg-white/40 text-brand-charcoal/60 backdrop-blur-md transition-all hover:bg-brand-gold hover:text-white shadow-sm border border-white/20"
                  >
                    <X className="h-5 w-5" />
                  </button>

                  <div className="h-full w-full overflow-hidden pt-16 md:pt-0">
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


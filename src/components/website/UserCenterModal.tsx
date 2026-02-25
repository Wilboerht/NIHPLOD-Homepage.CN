/* eslint-disable @next/next/no-img-element */
"use client";

/**
 * 用户中心弹窗组件
 * 品牌风格 - 左侧菜单 + 右侧内容
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { m, AnimatePresence } from "framer-motion";
import { X, User, Package, MapPin, LogOut, ChevronRight } from "lucide-react";
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

  useEffect(() => {
    setMounted(true);
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
            className="relative z-10 w-full max-w-sm md:max-w-[1100px] md:h-[680px] flex items-center justify-center"
          >
            <div className="relative w-full h-full overflow-hidden rounded-[2.5rem] bg-transparent shadow-none md:bg-black/10 md:shadow-2xl flex items-stretch md:justify-center md:p-6 p-0">

              {/* 背景图片区域 - 铺满整个卡片 */}
              <div className="absolute inset-0 z-0 hidden md:block group">
                <Image
                  src="https://wp-cdn.4ce.cn/v2/vmQtAla.jpeg"
                  alt="Background"
                  fill
                  className="object-cover grayscale brightness-[0.9] transition-all duration-1000 group-hover:scale-105 group-hover:grayscale-0"
                  priority
                />
                <div className="absolute inset-0 bg-gradient-to-r from-black/20 via-transparent to-transparent" />
              </div>


              {/* 浮动内容区域容器 */}
              <div className="relative z-10 w-full md:w-[1040px] flex flex-col md:flex-row items-stretch gap-6">

                {/* 左侧菜单卡片 */}
                <div className="w-full md:w-72 shrink-0 bg-white/75 md:bg-white/40 backdrop-blur-[32px] shadow-[0_8px_32px_0_rgba(0,0,0,0.1)] border border-white/60 md:border-white/40 rounded-[2.5rem] flex flex-col overflow-hidden">
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
                          onClick={() => setUserCenterView(item.id)}
                          className={`relative w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-[15px] font-medium transition-all group ${isActive
                            ? "bg-brand-gold text-white shadow-md shadow-brand-gold/20"
                            : "text-brand-charcoal md:text-brand-charcoal/80 hover:bg-black/5 md:hover:bg-white/40 hover:text-brand-charcoal"
                            }`}
                        >
                          <Icon className={`w-[18px] h-[18px] ${isActive ? "text-white" : "text-brand-charcoal/60 group-hover:text-brand-charcoal/80 transition-colors"}`} />
                          <span className="tracking-wide">{item.label}</span>
                          {isActive && <m.div layoutId="activeMenu" className="absolute left-0 w-1 h-8 rounded-r-md bg-white hidden md:block shadow-sm" />}
                          {isActive && <ChevronRight className="w-4 h-4 ml-auto opacity-70" />}
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

                {/* 右侧内容卡片 */}
                <div className="flex-1 bg-white/75 md:bg-white/35 backdrop-blur-[32px] shadow-[0_8px_32px_0_rgba(0,0,0,0.1)] border border-white/60 md:border-white/40 rounded-[2.5rem] overflow-hidden relative group/content">
                  {/* 关闭按钮 - 移至卡片内部右上角 */}
                  <button
                    onClick={closeUserCenter}
                    className="absolute right-6 top-6 z-50 flex h-9 w-9 items-center justify-center rounded-full bg-black/5 md:bg-white/40 text-brand-charcoal/40 md:text-brand-charcoal/60 backdrop-blur-md transition-all hover:bg-black/10 md:hover:bg-brand-gold hover:text-white shadow-sm border border-black/5 md:border-white/20"
                  >
                    <X className="h-5 w-5" />
                  </button>

                  <div className="h-full overflow-hidden">
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


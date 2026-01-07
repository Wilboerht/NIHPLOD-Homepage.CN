/* eslint-disable @next/next/no-img-element */
"use client";

/**
 * 用户中心弹窗组件
 * 自然纹理风格 - 左侧菜单 + 右侧内容
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { m, AnimatePresence } from "framer-motion";
import { X, User, Package, MapPin, Star, LogOut, ChevronRight } from "lucide-react";
import { useAuth, type UserCenterView } from "@/contexts/AuthContext";
import { OrdersPanel } from "./user-center/OrdersPanel";
import { AddressesPanel } from "./user-center/AddressesPanel";
import { PointsPanel } from "./user-center/PointsPanel";
import { ProfilePanel } from "./user-center/ProfilePanel";

// 菜单项配置
const MENU_ITEMS: { id: UserCenterView; label: string; icon: typeof User }[] = [
  { id: "profile", label: "个人信息", icon: User },
  { id: "orders", label: "我的订单", icon: Package },
  { id: "addresses", label: "收货地址", icon: MapPin },
  { id: "points", label: "护肤点数", icon: Star },
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* 遮罩 */}
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeUserCenter}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />

          {/* 弹窗主体 */}
          <m.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative w-full max-w-4xl h-[600px] max-h-[85vh] bg-[#FAF8F5] rounded-2xl shadow-2xl overflow-hidden flex"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E")`,
            }}
          >
            {/* 关闭按钮 */}
            <button
              onClick={closeUserCenter}
              className="absolute top-4 right-4 z-10 p-2 rounded-full text-[#8B8579] hover:text-[#5C5347] hover:bg-[#E8E3DC] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {/* 左侧菜单栏 */}
            <div className="w-56 flex-shrink-0 bg-white/60 border-r border-[#E8E3DC] flex flex-col">
              {/* 用户头像区域 */}
              <div className="p-6 border-b border-[#E8E3DC]">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-[#A69374]/10 flex items-center justify-center overflow-hidden">
                    {user.avatar ? (
                      <img src={user.avatar} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-6 h-6 text-[#A69374]" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[#5C5347] font-medium truncate">
                      {user.nickname || `用户${user.phone?.slice(-4)}`}
                    </p>
                    <p className="text-[#A69B8C] text-xs">{user.points} 点数</p>
                  </div>
                </div>
              </div>

              {/* 菜单列表 */}
              <nav className="flex-1 py-2">
                {MENU_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const isActive = userCenterView === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setUserCenterView(item.id)}
                      className={`w-full flex items-center gap-3 px-6 py-3 text-sm transition-all ${isActive
                          ? "bg-[#A69374]/10 text-[#A69374] border-r-2 border-[#A69374]"
                          : "text-[#5C5347] hover:bg-[#F5F2ED]"
                        }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{item.label}</span>
                      {isActive && <ChevronRight className="w-4 h-4 ml-auto" />}
                    </button>
                  );
                })}
              </nav>

              {/* 退出登录 */}
              <div className="p-4 border-t border-[#E8E3DC]">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center justify-center gap-2 py-2.5 text-sm text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span>退出登录</span>
                </button>
              </div>
            </div>

            {/* 右侧内容区 */}
            <div className="flex-1 overflow-hidden">
              <ContentPanel view={userCenterView} />
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
    case "points": return <PointsPanel />;
    default: return <ProfilePanel />;
  }
}


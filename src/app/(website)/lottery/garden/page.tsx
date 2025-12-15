"use client";

import { useState, useEffect, useCallback } from "react";
import { m, AnimatePresence } from "framer-motion";
import { Link } from "next-view-transitions";
import { Home, Gift, Clock, Users, Sparkles, ChevronLeft } from "lucide-react";


interface Activity {
  id: string;
  name: string;
  prizeName: string;
  prizeImage?: string;
  drawTime: string;
  status: string;
}

interface FlowerItem {
  id: string;
  imageUrl: string;
  flowerData: {
    posX: number;
    posY: number;
    scale: number;
    rotation: number;
  } | null;
  isWinner: boolean;
  createdAt: string;
}

export default function GardenPage() {
  const [activity, setActivity] = useState<Activity | null>(null);
  const [flowers, setFlowers] = useState<FlowerItem[]>([]);
  const [total, setTotal] = useState(0);

  const [countdown, setCountdown] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  const [loading, setLoading] = useState(true);
  const [selectedFlower, setSelectedFlower] = useState<FlowerItem | null>(null);

  // 获取活动和花朵信息
  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/lottery/garden?limit=60");
      const data = await res.json();
      if (data.success) {
        setActivity(data.data.activity);
        setFlowers(data.data.flowers || []);
        setTotal(data.data.total);
      }
    } catch (error) {
      console.error("获取数据失败:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 倒计时
  useEffect(() => {
    if (!activity?.drawTime) return;

    const updateCountdown = () => {
      const now = new Date().getTime();
      const drawTime = new Date(activity.drawTime).getTime();
      const diff = drawTime - now;

      if (diff <= 0) {
        setCountdown({ days: 0, hours: 0, minutes: 0, seconds: 0 });
        return;
      }

      setCountdown({
        days: Math.floor(diff / (1000 * 60 * 60 * 24)),
        hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((diff % (1000 * 60)) / 1000),
      });
    };

    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [activity?.drawTime]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-blush via-brand-cream to-brand-beige">
      {/* 顶部导航 */}
      <header className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 md:px-6 md:py-6">
        <Link
          href="/advisor"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-brand-charcoal/20 bg-white/60 text-brand-charcoal/70 transition-all hover:border-brand-charcoal/40 hover:bg-white/80 hover:text-brand-charcoal"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <m.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center"
        >
          <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-brand-gold">
            Lucky Garden
          </span>
          <h1 className="font-serif text-lg tracking-wide text-brand-charcoal">
            幸运花园
          </h1>
        </m.div>
        <Link
          href="/"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-brand-charcoal/20 bg-white/60 text-brand-charcoal/70 transition-all hover:border-brand-charcoal/40 hover:bg-white/80 hover:text-brand-charcoal"
        >
          <Home className="h-5 w-5" />
        </Link>
      </header>


      {/* 主内容区域 */}
      <main className="mx-auto max-w-4xl px-4 py-6">
        {/* 活动信息卡片 */}
        {activity && (
          <m.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-6 overflow-hidden rounded-2xl bg-white/80 shadow-sm backdrop-blur-sm"
          >
            <div className="flex items-stretch">
              {/* 奖品图片 */}
              {activity.prizeImage && (
                <div className="relative w-28 flex-shrink-0 sm:w-36">
                  <img
                    src={activity.prizeImage}
                    alt={activity.prizeName}
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent to-white/20" />
                </div>
              )}

              {/* 活动信息 */}
              <div className="flex flex-1 flex-col justify-center p-4 sm:p-5">
                <div className="mb-1 flex items-center gap-2">
                  <Gift className="h-4 w-4 text-brand-gold" />
                  <span className="text-xs font-medium uppercase tracking-wider text-brand-gold">
                    Lucky Draw
                  </span>
                </div>
                <h2 className="mb-1 font-serif text-lg text-brand-charcoal sm:text-xl">
                  {activity.name}
                </h2>
                <p className="text-sm text-brand-charcoal/60">{activity.prizeName}</p>
              </div>

              {/* 倒计时 */}
              <div className="flex flex-col items-center justify-center border-l border-brand-gold/10 px-4 sm:px-6">
                <div className="mb-2 flex items-center gap-1 text-xs text-brand-charcoal/50">
                  <Clock className="h-3 w-3" />
                  <span>距离开奖</span>
                </div>
                <div className="flex gap-1 text-center">
                  {countdown.days > 0 && (
                    <>
                      <div className="flex flex-col">
                        <span className="font-serif text-xl font-medium text-brand-charcoal sm:text-2xl">
                          {countdown.days}
                        </span>
                        <span className="text-[10px] text-brand-charcoal/40">天</span>
                      </div>
                      <span className="text-brand-charcoal/30">:</span>
                    </>
                  )}
                  <div className="flex flex-col">
                    <span className="font-serif text-xl font-medium text-brand-charcoal sm:text-2xl">
                      {String(countdown.hours).padStart(2, "0")}
                    </span>
                    <span className="text-[10px] text-brand-charcoal/40">时</span>
                  </div>
                  <span className="text-brand-charcoal/30">:</span>
                  <div className="flex flex-col">
                    <span className="font-serif text-xl font-medium text-brand-charcoal sm:text-2xl">
                      {String(countdown.minutes).padStart(2, "0")}
                    </span>
                    <span className="text-[10px] text-brand-charcoal/40">分</span>
                  </div>
                  {countdown.days === 0 && (
                    <>
                      <span className="text-brand-charcoal/30">:</span>
                      <div className="flex flex-col">
                        <span className="font-serif text-xl font-medium text-brand-charcoal sm:text-2xl">
                          {String(countdown.seconds).padStart(2, "0")}
                        </span>
                        <span className="text-[10px] text-brand-charcoal/40">秒</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </m.div>
        )}

        {/* 花园区域标题 */}
        <m.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-4 flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-gold/10">
              <Sparkles className="h-5 w-5 text-brand-gold" />
            </div>
            <div>
              <h2 className="font-serif text-lg text-brand-charcoal">花园作品集</h2>
              <p className="text-xs text-brand-charcoal/50">每一朵花都是一份美好期待</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1.5 shadow-sm">
            <Users className="h-3.5 w-3.5 text-brand-gold" />
            <span className="text-sm font-medium text-brand-charcoal">{total}</span>
          </div>
        </m.div>

        {/* 花园网格 */}
        <m.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="rounded-2xl bg-white/60 p-4 shadow-sm backdrop-blur-sm"
        >
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <m.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                className="text-brand-gold/50"
              >
                <Sparkles className="h-8 w-8" />
              </m.div>
            </div>
          ) : flowers.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center">
              <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-brand-cream/50">
                <Sparkles className="h-10 w-10 text-brand-gold/40" />
              </div>
              <p className="font-serif text-lg text-brand-charcoal/70">花园里还没有花朵</p>
              <p className="mt-1 text-sm text-brand-charcoal/40">完成护肤测试，成为第一个种花的人</p>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8">
              {flowers.map((flower, index) => (
                <m.div
                  key={flower.id}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{
                    type: "spring",
                    stiffness: 300,
                    damping: 25,
                    delay: index * 0.02,
                  }}
                  whileHover={{ scale: 1.08, zIndex: 10 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setSelectedFlower(flower)}
                  className="group relative cursor-pointer"
                >
                  <div
                    className={`aspect-square overflow-hidden rounded-xl bg-brand-cream/30 shadow-sm transition-all duration-200 group-hover:shadow-lg ${
                      flower.isWinner ? "ring-2 ring-brand-gold ring-offset-2" : ""
                    }`}
                  >
                    <img
                      src={flower.imageUrl}
                      alt="花朵作品"
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      loading="lazy"
                    />
                  </div>
                  {/* 中奖标记 */}
                  {flower.isWinner && (
                    <m.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-brand-gold text-[10px] shadow-md"
                    >
                      ✨
                    </m.div>
                  )}
                  {/* 悬停遮罩 */}
                  <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-brand-charcoal/0 opacity-0 transition-all duration-200 group-hover:bg-brand-charcoal/10 group-hover:opacity-100">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow-sm">
                      <Sparkles className="h-4 w-4 text-brand-gold" />
                    </div>
                  </div>
                </m.div>
              ))}
            </div>
          )}
        </m.div>

        {/* 查看更多提示 */}
        {flowers.length > 0 && flowers.length >= 60 && (
          <m.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mt-3 text-center text-xs text-brand-charcoal/40"
          >
            展示最新 {flowers.length} 朵花朵 · 共 {total} 位参与者
          </m.p>
        )}
      </main>

      {/* 底部浮动按钮 */}
      <div className="fixed bottom-6 left-0 right-0 z-20 px-4">
        <div className="mx-auto max-w-md">
          <Link href="/advisor">
            <m.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 25, delay: 0.3 }}
              whileHover={{ scale: 1.03, boxShadow: "0 20px 40px -12px rgba(0,0,0,0.25)" }}
              whileTap={{ scale: 0.97 }}
              className="group relative flex w-full items-center justify-center gap-3 overflow-hidden rounded-full bg-brand-charcoal py-4 text-white shadow-xl"
            >
              {/* 背景光效 */}
              <div className="absolute inset-0 bg-gradient-to-r from-brand-gold/20 via-transparent to-brand-gold/20 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

              {/* 图标 */}
              <m.div
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
              >
                <Sparkles className="h-5 w-5 text-brand-gold" />
              </m.div>

              {/* 文字 */}
              <span className="relative font-medium tracking-wide">参与护肤测试 赢取好礼</span>

              {/* 右侧箭头 */}
              <ChevronLeft className="h-4 w-4 rotate-180 opacity-60 transition-transform group-hover:translate-x-1" />
            </m.div>
          </Link>
        </div>
      </div>

      {/* 花朵详情弹窗 */}
      <AnimatePresence>
        {selectedFlower && (
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
            onClick={() => setSelectedFlower(null)}
          >
            <m.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={selectedFlower.imageUrl}
                alt="花朵作品"
                className="aspect-square w-full object-contain bg-brand-cream/30"
              />
              <div className="p-4 text-center">
                {selectedFlower.isWinner && (
                  <div className="mb-2 inline-flex items-center gap-1 rounded-full bg-brand-gold/10 px-3 py-1 text-sm text-brand-gold">
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>幸运中奖</span>
                  </div>
                )}
                <p className="text-sm text-brand-charcoal/60">
                  创建于 {new Date(selectedFlower.createdAt).toLocaleDateString("zh-CN")}
                </p>
              </div>
            </m.div>
          </m.div>
        )}
      </AnimatePresence>

      {/* 底部间距 */}
      <div className="h-28" />
    </div>
  );
}


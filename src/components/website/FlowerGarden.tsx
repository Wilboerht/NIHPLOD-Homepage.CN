"use client";

import { useState, useEffect, useCallback } from "react";
import { m, AnimatePresence } from "framer-motion";

interface FlowerItem {
  id: string;
  imageUrl: string;
  flowerData: {
    posX: number;
    posY: number;
    scale: number;
    rotation: number;
    colors: string[];
  } | null;
  status: string;
  createdAt: string;
}

interface FlowerGardenProps {
  activityId?: string;
  maxFlowers?: number;
  className?: string;
  onFlowerClick?: (flower: FlowerItem) => void;
}

export default function FlowerGarden({
  activityId,
  maxFlowers = 50,
  className = "",
  onFlowerClick,
}: FlowerGardenProps) {
  const [flowers, setFlowers] = useState<FlowerItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [, setSelectedFlower] = useState<FlowerItem | null>(null);

  // 获取花朵数据
  const fetchFlowers = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: maxFlowers.toString() });
      if (activityId) params.set("activityId", activityId);

      const res = await fetch(`/api/lottery/garden?${params}`);
      const data = await res.json();

      if (data.success) {
        setFlowers(data.data.flowers);
        setTotal(data.data.total);
      }
    } catch (error) {
      console.error("获取花园数据失败:", error);
    } finally {
      setLoading(false);
    }
  }, [activityId, maxFlowers]);

  useEffect(() => {
    fetchFlowers();
  }, [fetchFlowers]);

  // 处理花朵点击
  const handleFlowerClick = (flower: FlowerItem) => {
    setSelectedFlower(flower);
    onFlowerClick?.(flower);
  };

  if (loading) {
    return (
      <div className={`relative w-full h-96 bg-gradient-to-b from-green-50 to-green-100 rounded-2xl overflow-hidden ${className}`}>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-green-500 animate-pulse">🌱 花园加载中...</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative w-full overflow-hidden ${className}`}>
      {/* 花园背景 */}
      <div className="absolute inset-0 bg-gradient-to-b from-sky-100 via-green-50 to-green-200">
        {/* 装饰云朵 */}
        <div className="absolute top-4 left-10 w-16 h-8 bg-white/60 rounded-full blur-sm" />
        <div className="absolute top-8 right-20 w-20 h-10 bg-white/50 rounded-full blur-sm" />
        <div className="absolute top-2 right-40 w-12 h-6 bg-white/40 rounded-full blur-sm" />
      </div>

      {/* 花朵统计 */}
      <div className="absolute top-3 left-3 z-10 bg-white/80 backdrop-blur-sm rounded-full px-3 py-1 text-sm shadow-sm">
        <span className="text-green-600 font-medium">🌷 {total}</span>
        <span className="text-gray-500"> 朵花</span>
      </div>

      {/* 花朵容器 */}
      <div className="relative w-full h-96 md:h-[500px]">
        <AnimatePresence>
          {flowers.map((flower, index) => {
            const data = flower.flowerData || {
              posX: 10 + (index % 8) * 10,
              posY: 20 + Math.floor(index / 8) * 15,
              scale: 0.8 + Math.random() * 0.4,
              rotation: Math.random() * 30 - 15,
            };

            return (
              <m.div
                key={flower.id}
                initial={{ scale: 0, y: 50, opacity: 0 }}
                animate={{
                  scale: data.scale,
                  y: 0,
                  opacity: 1,
                  rotate: data.rotation,
                }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{
                  type: "spring",
                  stiffness: 200,
                  damping: 20,
                  delay: index * 0.05,
                }}
                className="absolute cursor-pointer hover:z-50 transition-all duration-200 hover:scale-110"
                style={{
                  left: `${data.posX}%`,
                  top: `${data.posY}%`,
                  transform: `translate(-50%, -50%)`,
                }}
                onClick={() => handleFlowerClick(flower)}
                whileHover={{ scale: (data.scale || 1) * 1.2, zIndex: 50 }}
              >
                {(() => {
                  const isWinner = flower.status === "won" || flower.status === "verified";
                  return (
                    <>
                      {/* 花朵图片 */}
                      <div className={`w-16 h-16 md:w-20 md:h-20 rounded-lg overflow-hidden shadow-md bg-white ${isWinner ? "ring-2 ring-yellow-400 ring-offset-2" : ""}`}>
                        <img
                          src={flower.imageUrl}
                          alt="花朵"
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>
                      {/* 中奖标记 */}
                      {isWinner && (
                        <div className="absolute -top-2 -right-2 text-lg">🏆</div>
                      )}
                    </>
                  );
                })()}
              </m.div>
            );
          })}
        </AnimatePresence>

        {/* 空状态 */}
        {flowers.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500">
            <span className="text-4xl mb-2">🌱</span>
            <span>花园里还没有花朵</span>
            <span className="text-sm">快来画一朵吧！</span>
          </div>
        )}
      </div>
      {/* 花朵详情弹窗在父组件中处理 */}
    </div>
  );
}


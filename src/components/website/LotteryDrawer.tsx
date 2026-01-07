/* eslint-disable @next/next/no-img-element */
"use client";

import { useState, useEffect, useCallback } from "react";
import { m, AnimatePresence } from "framer-motion";
import FlowerCanvas, { type FlowerData } from "@/components/ui/FlowerCanvas";

interface LotteryActivity {
  id: string;
  name: string;
  prizeName: string;
  prizeImage?: string;
  drawTime: string;
  entryCount: number;
}

interface LotteryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId?: string;
  inviteCode?: string; // 从URL参数获取的邀请码
  onSuccess?: (data: { entryId: string; inviteCode: string; flowerCount: number }) => void;
}

export default function LotteryDrawer({
  isOpen,
  onClose,
  sessionId,
  inviteCode,
  onSuccess,
}: LotteryDrawerProps) {
  const [step, setStep] = useState<"intro" | "draw" | "phone" | "success">("intro");
  const [activity, setActivity] = useState<LotteryActivity | null>(null);
  const [flowerData, setFlowerData] = useState<FlowerData | null>(null);
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{ entryId: string; inviteCode: string; flowerCount: number } | null>(null);
  const [deviceId, setDeviceId] = useState("");

  // 获取设备ID
  useEffect(() => {
    const getDeviceId = () => {
      let id = localStorage.getItem("lottery_device_id");
      if (!id) {
        id = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
        localStorage.setItem("lottery_device_id", id);
      }
      return id;
    };
    setDeviceId(getDeviceId());
  }, []);

  // 获取当前活动
  useEffect(() => {
    if (isOpen) {
      fetch("/api/lottery/current")
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.data) {
            setActivity(data.data);
          }
        })
        .catch(console.error);
    }
  }, [isOpen]);

  // 重置状态
  useEffect(() => {
    if (!isOpen) {
      setStep("intro");
      setFlowerData(null);
      setPhone("");
      setPhoneError("");
      setResult(null);
    }
  }, [isOpen]);

  // 处理花朵变化
  const handleFlowerChange = useCallback((data: FlowerData | null) => {
    setFlowerData(data);
  }, []);

  // 验证手机号
  const validatePhone = (value: string) => {
    if (!/^1[3-9]\d{9}$/.test(value)) {
      setPhoneError("请输入正确的手机号");
      return false;
    }
    setPhoneError("");
    return true;
  };

  // 提交参与
  const handleSubmit = async () => {
    if (!flowerData || !activity || !validatePhone(phone)) return;

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/lottery/enter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activityId: activity.id,
          phone,
          drawingDataUrl: flowerData.imageDataUrl,
          drawingType: "flower",
          flowerData: {
            colors: flowerData.colors,
            strokeCount: flowerData.strokeCount,
            duration: flowerData.duration,
            complexity: flowerData.complexity,
          },
          deviceId,
          sessionId,
          inviteCode,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setResult(data.data);
        setStep("success");
        onSuccess?.(data.data);
      } else {
        setPhoneError(data.error?.message || "提交失败，请重试");
      }
    } catch {
      setPhoneError("网络错误，请重试");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <m.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
        onClick={onClose}
      >
        {/* 背景遮罩 */}
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

        {/* 弹窗内容 */}
        <m.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="relative w-full max-w-md bg-white rounded-t-3xl sm:rounded-2xl max-h-[90vh] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 关闭按钮 */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200"
          >
            ✕
          </button>

          {/* 内容区域 */}
          <div className="p-6 overflow-y-auto max-h-[85vh]">
            {/* 步骤1: 介绍 */}
            {step === "intro" && activity && (
              <div className="text-center">
                <div className="text-4xl mb-4">🌸</div>
                <h2 className="text-xl font-bold text-gray-800 mb-2">{activity.name}</h2>
                <p className="text-gray-600 mb-4">画一朵属于你的花，投入花园参与抽奖</p>

                <div className="bg-gradient-to-r from-pink-50 to-purple-50 rounded-xl p-4 mb-4">
                  <div className="text-sm text-gray-500 mb-1">奖品</div>
                  <div className="text-lg font-semibold text-pink-600">{activity.prizeName}</div>
                  <div className="text-xs text-gray-400 mt-2">
                    已有 <span className="text-pink-500 font-medium">{activity.entryCount}</span> 朵花入园
                  </div>
                </div>

                <button
                  onClick={() => setStep("draw")}
                  className="w-full py-3 bg-gradient-to-r from-pink-500 to-rose-500 text-white rounded-xl font-medium hover:from-pink-600 hover:to-rose-600 transition-all"
                >
                  开始画花 🎨
                </button>
              </div>
            )}

            {/* 步骤2: 画花 */}
            {step === "draw" && (
              <div>
                <h2 className="text-lg font-bold text-gray-800 mb-1 text-center">画一朵花</h2>
                <p className="text-sm text-gray-500 mb-4 text-center">发挥创意，画出独一无二的花朵</p>

                <FlowerCanvas onChange={handleFlowerChange} className="mb-4" />

                <button
                  onClick={() => flowerData && setStep("phone")}
                  disabled={!flowerData || flowerData.strokeCount < 3}
                  className="w-full py-3 bg-gradient-to-r from-pink-500 to-rose-500 text-white rounded-xl font-medium hover:from-pink-600 hover:to-rose-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {flowerData && flowerData.strokeCount >= 3 ? "下一步" : "请至少画 3 笔"}
                </button>
              </div>
            )}

            {/* 步骤3: 输入手机号 */}
            {step === "phone" && (
              <div>
                <h2 className="text-lg font-bold text-gray-800 mb-1 text-center">留下联系方式</h2>
                <p className="text-sm text-gray-500 mb-4 text-center">中奖后我们将通过短信通知您</p>

                {/* 预览花朵 */}
                <div className="flex justify-center mb-4">
                  <div className="w-24 h-24 rounded-xl overflow-hidden border-2 border-pink-200 shadow-sm">
                    <img src={flowerData?.imageDataUrl} alt="你的花朵" className="w-full h-full object-cover" />
                  </div>
                </div>

                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => { setPhone(e.target.value); setPhoneError(""); }}
                  placeholder="请输入手机号"
                  maxLength={11}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-pink-500 focus:border-transparent outline-none mb-2"
                />
                {phoneError && <p className="text-red-500 text-sm mb-2">{phoneError}</p>}

                <p className="text-xs text-gray-400 mb-4 text-center">
                  手机号仅用于中奖通知，我们承诺保护您的隐私
                </p>

                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting || phone.length !== 11}
                  className="w-full py-3 bg-gradient-to-r from-pink-500 to-rose-500 text-white rounded-xl font-medium hover:from-pink-600 hover:to-rose-600 transition-all disabled:opacity-50"
                >
                  {isSubmitting ? "提交中..." : "🌷 投入花园"}
                </button>
              </div>
            )}

            {/* 步骤4: 成功 */}
            {step === "success" && result && (
              <div className="text-center">
                <m.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", damping: 10 }}
                  className="text-6xl mb-4"
                >
                  🎉
                </m.div>
                <h2 className="text-xl font-bold text-gray-800 mb-2">花朵已入园！</h2>
                <p className="text-gray-600 mb-4">
                  花园里已有 <span className="text-pink-500 font-bold">{result.flowerCount}</span> 朵花
                </p>

                <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-4 mb-4">
                  <div className="text-sm text-gray-600 mb-2">分享给好友，提高中奖率 ⬆️</div>
                  <div className="text-xs text-gray-400">每邀请1位好友完成分析，中奖权重+10</div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      const shareUrl = `${window.location.origin}/advisor?invite=${result.inviteCode}`;
                      navigator.clipboard.writeText(shareUrl);
                      alert("链接已复制！");
                    }}
                    className="flex-1 py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl font-medium"
                  >
                    复制邀请链接
                  </button>
                  <button
                    onClick={onClose}
                    className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-medium hover:bg-gray-200"
                  >
                    查看花园
                  </button>
                </div>
              </div>
            )}

            {/* 无活动 */}
            {!activity && step === "intro" && (
              <div className="text-center py-8">
                <div className="text-4xl mb-4">🌱</div>
                <h2 className="text-lg font-medium text-gray-600">暂无进行中的活动</h2>
                <p className="text-sm text-gray-400 mt-2">敬请期待下次抽奖活动</p>
              </div>
            )}
          </div>
        </m.div>
      </m.div>
    </AnimatePresence>
  );
}


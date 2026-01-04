"use client";

import { m, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, ScanLine, Check } from "lucide-react";
import { cn } from "@/lib/utils";

type CaptureStep = "front" | "left" | "right";
type FaceStatus = "none" | "detecting" | "found" | "ready";

interface FaceScanOverlayProps {
    currentStep: CaptureStep;
    faceStatus: FaceStatus;
    stabilityProgress: number;
}

/**
 * 面部扫描动态蒙版组件 - 3.0 亮色优化版
 * 核心优化：采用 White/Gold 亮色高级质感，去除深色沉重感
 */
export function FaceScanOverlay({
    currentStep,
    faceStatus,
    stabilityProgress,
}: FaceScanOverlayProps) {

    const getBorderColor = () => {
        switch (faceStatus) {
            case "found": return "border-brand-gold";
            case "ready": return "border-emerald-500";
            default: return "border-white/40";
        }
    };

    return (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            {/* 1. 核心扫描区域 */}
            <div className="relative h-[70%] w-[65%]">

                {/* 椭圆边框容器 */}
                <div className="absolute inset-0">
                    {/* 静态基础边框 */}
                    <div className={cn(
                        "absolute inset-0 rounded-[50%] border-[2px] transition-all duration-500",
                        getBorderColor(),
                        faceStatus !== "ready" && "border-dashed opacity-50"
                    )} />

                    {/* 动态呼吸光环 (Found) */}
                    {faceStatus === "found" && (
                        <m.div
                            className="absolute -inset-[2px] rounded-[50%] border-2 border-brand-gold/60"
                            animate={{ opacity: [0, 0.8, 0], scale: [1, 1.05, 1] }}
                            transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                        />
                    )}

                    {/* 成功锁定光环 (Ready) */}
                    {faceStatus === "ready" && (
                        <m.div
                            className="absolute -inset-[2px] rounded-[50%] border-2 border-emerald-500"
                            initial={{ scale: 1, opacity: 0 }}
                            animate={{ scale: 1.08, opacity: [0, 1, 0] }}
                            transition={{ duration: 0.6 }}
                        />
                    )}
                </div>

                {/* 扫描激光 */}
                <AnimatePresence>
                    {currentStep === "front" && faceStatus !== "ready" && (
                        <m.div
                            className="absolute left-[8%] right-[8%] h-[2px] bg-gradient-to-r from-transparent via-brand-gold to-transparent shadow-[0_0_15px_rgba(234,179,8,0.5)]"
                            initial={{ top: "10%", opacity: 0 }}
                            animate={{ top: ["10%", "90%", "10%"], opacity: 1 }}
                            transition={{ repeat: Infinity, duration: 3.5, ease: "easeInOut" }}
                            exit={{ opacity: 0 }}
                        />
                    )}
                </AnimatePresence>

            </div>

            {/* 2. 顶部统一指引区域 (置顶悬浮 - 4.0 极简融合版) */}
            <div className="absolute top-[8%] left-0 right-0 flex justify-center z-20">
                <AnimatePresence mode="wait">
                    <m.div
                        key={currentStep + faceStatus}
                        initial={{ y: -20, opacity: 0, scale: 0.9 }}
                        animate={{ y: 0, opacity: 1, scale: 1 }}
                        exit={{ y: 10, opacity: 0, scale: 0.9 }}
                        className={cn(
                            "flex items-center gap-4 rounded-full px-8 py-3 backdrop-blur-md shadow-lg transition-all duration-500",
                            // 状态样式区分
                            faceStatus === "ready"
                                ? "bg-emerald-500/90 text-white shadow-emerald-500/20"
                                : "bg-white/80 text-gray-800 border border-white/40 shadow-black/5"
                        )}
                    >
                        {/* 左侧：动态图标 */}
                        <div className="relative flex items-center justify-center">
                            {faceStatus === "ready" ? (
                                <Check className="h-6 w-6 stroke-[3]" />
                            ) : currentStep === "front" ? (
                                <ScanLine className="h-6 w-6 text-brand-gold/80" />
                            ) : (
                                // 转头图标
                                <div className="relative">
                                    {currentStep === "left"
                                        ? <ChevronLeft className="h-7 w-7 text-brand-gold" />
                                        : <ChevronRight className="h-7 w-7 text-brand-gold" />
                                    }
                                </div>
                            )}

                            {/* 识别中的动态光圈 (仅在未完成且非Front时增强提示，或者Front识别时) */}
                            {faceStatus === "detecting" && (
                                <m.div
                                    className="absolute inset-0 rounded-full border-2 border-brand-gold/30 border-t-brand-gold"
                                    animate={{ rotate: 360 }}
                                    transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                                    style={{ width: "140%", height: "140%", left: "-20%", top: "-20%" }}
                                />
                            )}
                        </div>

                        {/* 右侧：说明文字 */}
                        <div className="flex flex-col items-start gap-0.5">
                            <span className={cn(
                                "text-lg font-medium tracking-wider",
                                faceStatus === "ready" ? "text-white" : "text-gray-800"
                            )}>
                                {faceStatus === "ready" ? "扫描完成" :
                                    currentStep === "front" ? "正对屏幕" :
                                        currentStep === "left" ? "向左转头" : "向右转头"}
                            </span>

                            {/* 状态子标题 (整合进胶囊，不再悬浮) */}
                            <AnimatePresence mode="wait">
                                {faceStatus === "detecting" ? (
                                    <m.span
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: "auto" }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="text-xs text-brand-brown/60 font-medium whitespace-nowrap"
                                    >
                                        正在识别特征...
                                    </m.span>
                                ) : faceStatus === "found" ? (
                                    <m.span
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: "auto" }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="text-xs text-brand-gold font-medium whitespace-nowrap"
                                    >
                                        保持不动
                                    </m.span>
                                ) : null}
                            </AnimatePresence>
                        </div>
                    </m.div>
                </AnimatePresence>
            </div>


            {/* 3. 中心倒计时 (仅在Found且未Ready时显示) */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <AnimatePresence>
                    {faceStatus === "found" && stabilityProgress > 0 && stabilityProgress < 100 && (
                        <m.div
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 1.2, opacity: 0 }}
                            className="relative z-10"
                        >
                            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/20 backdrop-blur-md border border-white/40 shadow-lg">
                                <span className="font-mono text-3xl font-bold text-white tracking-tighter drop-shadow-md">
                                    {Math.ceil((100 - stabilityProgress) / 25)}
                                </span>
                                <svg className="absolute inset-0 h-full w-full -rotate-90">
                                    <circle cx="40" cy="40" r="38" className="fill-none stroke-white/20 stroke-[3]" />
                                    <m.circle
                                        cx="40" cy="40" r="38"
                                        className="fill-none stroke-brand-gold stroke-[3] stroke-linecap-round filter drop-shadow-sm"
                                        initial={{ pathLength: 0 }}
                                        animate={{ pathLength: stabilityProgress / 100 }}
                                        transition={{ duration: 0.2 }}
                                    />
                                </svg>
                            </div>
                        </m.div>
                    )}
                </AnimatePresence>
            </div>

        </div>
    );
}

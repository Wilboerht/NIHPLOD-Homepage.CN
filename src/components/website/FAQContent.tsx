"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Link } from "next-view-transitions";
import { m, AnimatePresence } from "framer-motion";
import { ChevronDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLayout } from "@/contexts/LayoutContext";

interface FAQContentProps {
    backgroundImage?: string;
}

const FAQS = [
    {
        question: "关于 NIHPLOD 的护肤理念",
        answer: "我们相信肌肤拥有自我疗愈和更新的能力。灵感源自海豚肌肤的卓越再生机制，我们的产品旨在唤醒并增强肌肤天然的修护力量，而非单纯的外部覆盖。"
    },
    {
        question: "产品是否适合敏感肌使用？",
        answer: "是的，我们的全线产品均经过严格的皮肤科测试，配方温和，摒弃了传统护肤品中常见的刺激性成分。特别添加的舒缓因子能有效修复受损屏障，即使是敏感肌也能安心使用。"
    },
    {
        question: "如何进行 AI 快速测肤？",
        answer: "您可以点击首页的 'AI 快速测肤' 按钮，或在菜单中选择相应入口。只需上传一张清晰的面部照片，我们的 AI 算法将精确分析您的肤质状况，通过 8 个维度为您提供个性化的护肤建议。"
    },
    {
        question: "发货与物流时效",
        answer: "一般情况下，订单将在 24 小时内发出。我们与顺丰速运合作，确保您的产品安全、快速地送达。大部分地区 2-3 天即可送达。"
    },
    {
        question: "退换货政策",
        answer: "我们提供 7 天无理由退换货服务（仅限未开封产品）。如果您在使用过程中遇到任何过敏或其他问题，请立即联系我们的客服团队，我们将竭诚为您解决。"
    },
    {
        question: "会员积分如何使用？",
        answer: "会员积分可在购买产品时直接抵扣现金，也可用于兑换限量版周边礼品。更多详情请查看会员中心说明。"
    }
];

export function FAQContent({ backgroundImage }: FAQContentProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [openIndex, setOpenIndex] = useState<number | null>(0);
    const { isDrawerOpen, setDrawerOpen } = useLayout();

    // Sync with LayoutContext
    useEffect(() => {
        if (isDrawerOpen && !isExpanded) {
            setIsExpanded(true);
        } else if (!isDrawerOpen && isExpanded) {
            setIsExpanded(false);
        }
    }, [isDrawerOpen, isExpanded]);

    // Auto expand on mount
    useEffect(() => {
        const timer = setTimeout(() => {
            setIsExpanded(true);
            setDrawerOpen(true);
        }, 100);
        return () => clearTimeout(timer);
    }, [setDrawerOpen]);

    // Toggle Accordion
    const toggleFAQ = (index: number) => {
        setOpenIndex(openIndex === index ? null : index);
    };

    return (
        <>
            {/* Content wrapper - top aligned */}
            <m.div
                className="safe-area-content !top-0"
                transition={{
                    duration: 0.8,
                    ease: [0.22, 1, 0.36, 1]
                }}
            >
                {/* Main content + Expand Button container */}
                <m.div
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{
                        opacity: 1,
                        scale: 1
                    }}
                    transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                    className="h-full"
                >
                    <div className="flex h-full flex-col items-center">
                        {/* Drawer Content */}
                        <m.div
                            className="relative w-full overflow-hidden rounded-b-2xl bg-[#F0EDE1] lg:rounded-b-3xl"
                            style={{ willChange: "flex-grow" }}
                            initial={{ flexGrow: 0, flexBasis: 0 }}
                            animate={{
                                flexGrow: isExpanded ? 1 : 0,
                                flexBasis: 0
                            }}
                            transition={{
                                duration: 1.2,
                                ease: [0.22, 1, 0.36, 1],
                                delay: isExpanded ? 0.3 : 0
                            }}
                        >
                            {/* Texture Overlay */}
                            <div className="texture-overlay absolute inset-0" />

                            {/* Scrollable Content */}
                            <div
                                className={cn(
                                    "relative z-10 flex h-full flex-col overflow-hidden",
                                    !isExpanded && "hidden"
                                )}
                            >
                                {/* Fixed Header */}
                                <div className="sticky top-0 z-50 flex h-[80px] shrink-0 items-center justify-center border-b border-brand-charcoal/5 bg-[#F0EDE1]/95 backdrop-blur-sm px-6">
                                    <Link href="/">
                                        <Image
                                            src="/images/logo.png"
                                            alt="NIHPLOD"
                                            width={180}
                                            height={55}
                                            className="h-9 sm:h-11 w-auto opacity-90"
                                        />
                                    </Link>
                                    {/* Texture Overlay for Header to match body */}
                                    <div className="texture-overlay absolute inset-0 z-[-1]" />
                                </div>

                                <div className="flex-1 flex flex-col overflow-hidden px-4 pb-4 sm:px-10 lg:px-[15%] xl:px-[20%]">

                                    {/* Page Title - Fixed */}
                                    <div className="shrink-0 text-center mb-6 mt-6 sm:mb-8">
                                        <h1 className="text-xl sm:text-2xl font-normal tracking-widest text-brand-charcoal/90">
                                            常见问题
                                        </h1>
                                    </div>

                                    {/* Scrollable Question Box */}
                                    <div className="flex-1 overflow-y-auto min-h-0 rounded-3xl border border-brand-charcoal/5 bg-[#F2EFE5] shadow-inner [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                                        <div className="space-y-3 p-4 sm:p-6 lg:p-8">
                                            {FAQS.map((faq, index) => (
                                                <div
                                                    key={index}
                                                    className={cn(
                                                        "group overflow-hidden rounded-xl border transition-all duration-500 px-5 sm:px-8",
                                                        openIndex === index
                                                            ? "bg-white border-brand-charcoal/5 shadow-sm"
                                                            : "bg-white/40 border-transparent hover:bg-white/80"
                                                    )}
                                                >

                                                    <button
                                                        onClick={() => toggleFAQ(index)}
                                                        className="w-full flex items-center justify-between py-5 text-left"
                                                    >
                                                        <span className={cn(
                                                            "text-[15px] sm:text-[16px] font-normal tracking-wide text-brand-charcoal transition-colors duration-300",
                                                            openIndex === index ? "text-brand-charcoal font-medium" : "group-hover:text-brand-charcoal/80"
                                                        )}>
                                                            {faq.question}
                                                        </span>
                                                        <span className={cn(
                                                            "shrink-0 ml-4 text-brand-charcoal/20 transition-transform duration-500",
                                                            openIndex === index ? "rotate-[135deg] text-brand-gold" : "group-hover:text-brand-charcoal/40"
                                                        )}>
                                                            <Plus size={18} />
                                                        </span>
                                                    </button>
                                                    <AnimatePresence>
                                                        {openIndex === index && (
                                                            <m.div
                                                                initial={{ height: 0, opacity: 0 }}
                                                                animate={{ height: "auto", opacity: 1 }}
                                                                exit={{ height: 0, opacity: 0 }}
                                                                transition={{ duration: 0.3, ease: "easeInOut" }}
                                                                className="overflow-hidden"
                                                            >
                                                                <div className="pb-8 pt-2 text-brand-charcoal/60 leading-[1.8] font-light text-[14px] sm:text-[15px] text-justify tracking-wide">
                                                                    {faq.answer}
                                                                </div>
                                                            </m.div>
                                                        )}
                                                    </AnimatePresence>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Footer Info - Fixed */}
                                    <div className="shrink-0 flex flex-col items-center justify-center gap-2 pt-4 pb-2">
                                        <p className="text-xs font-light tracking-widest text-center text-brand-charcoal/50">
                                            &copy; {new Date().getFullYear()} NIHPLOD. All Rights Reserved.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </m.div>

                        {/* Collapse Button */}
                        <button
                            type="button"
                            onClick={() => {
                                const newState = !isExpanded;
                                setIsExpanded(newState);
                                setDrawerOpen(newState);
                            }}
                            className="group -mt-[1px] relative z-10 flex items-center justify-center rounded-b-2xl bg-[#F0EDE1] px-10 py-3 shadow-sm transition-shadow hover:shadow-md lg:px-14 lg:py-3.5"
                        >
                            <div className="texture-overlay absolute inset-0 rounded-b-2xl" />
                            <m.div
                                className="relative z-10 flex flex-col items-center"
                                animate={{
                                    rotate: isExpanded ? 180 : 0,
                                    scale: 1
                                }}
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.95 }}
                                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                            >
                                <ChevronDown className="h-7 w-7 text-brand-gold lg:h-8 lg:w-8" />
                                <ChevronDown className="-mt-5 h-7 w-7 text-brand-gold lg:h-8 lg:w-8" />
                            </m.div>
                        </button>
                    </div>
                </m.div>
            </m.div>

            {/* Dynamic Background Image */}
            {backgroundImage && (
                <div className="fixed inset-0 z-[-1]">
                    <Image
                        src={backgroundImage}
                        alt="Background"
                        fill
                        className="object-cover"
                        priority
                    />
                    <div className="absolute inset-0 bg-black/10" />
                </div>
            )}
        </>
    );
}

"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Link } from "next-view-transitions";
import { m, AnimatePresence } from "framer-motion";
import { ChevronDown, Plus, MessageCircle, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLayout } from "@/contexts/LayoutContext";
import { useAuth } from "@/contexts/AuthContext";



const FAQS = [
    {
        question: "什么是 NIHPLOD ?",
        answer: (
            <div className="space-y-1.5">
                <p>海豚的皮肤拥有神奇的自我更新能力，每两小时就能更新一次。 我们从这种 “时间逆转” 的动物本能中汲取灵感。</p>
                <p>随着时间和空间的变化，我们的皮肤会因工作压力、不良习惯和衰老而面临各种问题。</p>
                <p>在逆转这一切之前，我们将“ Dolphin ”这个词反过来，也就是 <span className="font-semibold text-brand-charcoal">NIHPLOD</span> (发音 / nɪˈplɒd /) 的来源。</p>
                <p>NIHPLOD 运用最前沿的生物技术和配方，在护肤领域尽最大努力帮助人们 <span className="font-semibold text-brand-charcoal">“逆转时光”</span>。</p>
            </div>
        )
    },
    {
        question: "NIHPLOD 和其它护肤品牌有什么不一样的地方 ?",
        answer: (
            <div className="space-y-1.5">
                <p>随着现代科学技术的不断发展，越来越多的活性成分被应用于化妆品领域。</p>
                <p>然而 ，这些有效成分是否真的能被皮肤吸收而不被氧化、分解或产生不良反应，这可能是您真正需要认真考虑的问题。</p>
                <p>NIHPLOD 的主要产品，结合了当今前沿的 <span className="font-semibold text-brand-charcoal">脂质体技术</span>，将重要的 <span className="font-semibold text-brand-charcoal">活性成分</span> 和生长因子靶向输送到皮肤进行修复或改善 ，从而更有效地达到理想的护肤效果。</p>
            </div>
        )
    },
    {
        question: "使用 NIHPLOD 的产品多久可以看到效果 ?",
        answer: (
            <div className="space-y-1.5">
                <p>根据产品的不同优势和作用，您可能最快在 <span className="font-semibold text-brand-charcoal">数天内</span> 就能看到各类肌肤修护的显著效果，而一些色素及初老特征问题可能需要 <span className="font-semibold text-brand-charcoal">2-4 周</span> 甚至更久。</p>
                <p>我们强烈建议您在享受我们产品的同时，保持更积极、更健康的生活方式，由内而外的悦己。</p>
            </div>
        )
    },
    {
        question: "NIHPLOD 主张的「精简护肤」对我有什么好处 ?",
        answer: (
            <div className="space-y-1.5">
                <p>我们的专家团队曾多次强调 <span className="font-semibold text-brand-charcoal">“过度的皮肤护理, 是对肌肤的一种变相伤害”</span></p>
                <p>真正好的护肤法则，不是堆叠步骤，而是给皮肤刚刚好的关爱。</p>
                <p>旎柏的产品线不多，就 <span className="font-semibold text-brand-charcoal">9个单品</span>，但每个都是用心打造，旨在通过最精简的护理，带给用户最有效的体验和结果。</p>
                <p>如果不想在护肤这个环节花费过量的精力和时间，不妨试试旎柏；</p>
                <p>试着把更多的时间专注在生活中其它的精彩部分，也许你会收获更多。</p>
            </div>
        )
    },
    {
        question: "敏感肌可以使用 NIHPLOD 的产品吗 ?",
        answer: (
            <div className="space-y-1.5">
                <p>当然。我们所有的产品对于 <span className="font-semibold text-brand-charcoal">敏感的肌肤非常友好</span>，最大化的避免使用任何多余的、刺激性的成分，以免引起而非缓解炎症和皮肤刺激。</p>
                <p>然而，每个人的肤质都不同，皮肤可能对任何成分产生不良反应。例如，有些人可能对精油或海藻提取物等天然成分过敏，因此我们在本站的产品页面上展示了主要的成分列表，以便顾客在购买前做出明智的选择。</p>
                <p>即使是最“温和”的成分也可能在某些人的皮肤上引起反应，所以我们建议您先取少量产品涂抹在手腕内侧的皮肤上进行简易测试，以确定其是否适合您的肤质。</p>
            </div>
        )
    },
    {
        question: "我可以和我的家人分享我的产品吗？",
        answer: (
            <div className="space-y-1.5">
                <p>完全可以。NIHPLOD 的所有产品 <span className="font-semibold text-brand-charcoal">男女皆可使用 (全肤质配方设计)</span>。</p>
                <p>我们在成分选择上也秉持中立原则。 产品质地天然、清爽不油腻且高效，因此也适用于男性较厚的皮肤。</p>
            </div>
        )
    },
    {
        question: "孕妇或 (产后) 月子期可以使用吗 ?",
        answer: (
            <div className="space-y-1.5">
                <p>当然可以。旎柏旗下的主要产品均已获得 <span className="font-semibold text-brand-charcoal">国际权威检测机构 SGS 认证</span>，在细胞毒性、内分泌干扰物、致敏原、致畸性等多个 (孕中及产后) 维度均 <span className="font-semibold text-brand-charcoal">表现安全</span>，不会对孕妇造成不适或不良反应。</p>
                <p className="text-xs text-brand-charcoal/50 italic mt-2">* 若出于谨慎考虑，建议可咨询您的专属医生后再做决定。</p>
            </div>
        )
    }
];

export function FAQContent() {
    const [isExpanded, setIsExpanded] = useState(false);
    const [openIndex, setOpenIndex] = useState<number | null>(null);
    const { isDrawerOpen, setDrawerOpen } = useLayout();
    const { openContact } = useAuth();

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
                className="safe-area-content !top-0 !pointer-events-none"
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
                    className="h-full pointer-events-none"
                >
                    <div className="flex h-full flex-col items-center">
                        {/* Drawer Content */}
                        <m.div
                            className="relative w-full overflow-hidden rounded-b-2xl bg-[#F0EDE1] lg:rounded-b-3xl pointer-events-auto"
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
                                {/* Fixed Header - Mobile aligned with Ritual, PC kept stable */}
                                <div className="sticky top-0 z-50 flex h-20 sm:h-[80px] shrink-0 items-center justify-center sm:justify-start border-b border-transparent sm:border-brand-charcoal/5 bg-[#F0EDE1]/95 sm:bg-[#F0EDE1]/95 backdrop-blur-sm px-6 sm:px-[8%] transition-all">
                                    <Link href="/" className="flex items-center justify-center">
                                        <div className="relative h-[26px] w-[124px] sm:h-8 sm:w-[160px]">
                                            <Image
                                                src="/images/NIHPLOD-logo.svg"
                                                alt="NIHPLOD"
                                                fill
                                                className="object-contain"
                                                priority
                                            />
                                        </div>
                                    </Link>
                                    {/* Texture Overlay for Header to match body */}
                                    <div className="texture-overlay absolute inset-0 z-[-1]" />
                                </div>

                                <div className="flex-1 flex flex-col overflow-hidden px-4 pb-4 sm:px-10 lg:px-[15%] xl:px-[20%]">

                                    {/* Page Title - Fixed */}
                                    <div className="shrink-0 flex justify-center mb-10 mt-6 sm:mt-12">
                                        <h1 className="relative inline-block text-[24px] font-normal uppercase tracking-[0.2em] text-[#00263e] after:absolute after:-bottom-2.5 after:left-1/2 after:-translate-x-1/2 after:h-px after:w-[60%] after:bg-[#00263e]/20">
                                            常见问题
                                        </h1>
                                    </div>

                                    {/* Scrollable Question List - Minimalist Design */}
                                    <div className="flex-1 overflow-y-auto min-h-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                                        <div className="max-w-4xl mx-auto">
                                            {FAQS.map((faq, index) => (
                                                <div
                                                    key={index}
                                                    className={cn(
                                                        "group transition-all duration-500 ease-out",
                                                        // Unified list style (aligned with PC)
                                                        "border-b border-brand-charcoal/10 overflow-visible",
                                                        // Interactive States
                                                        openIndex === index
                                                            ? "bg-white/40"
                                                            : "hover:bg-white/20"
                                                    )}
                                                >

                                                    <button
                                                        onClick={() => toggleFAQ(index)}
                                                        className="w-full flex items-center justify-between py-4 px-5 sm:py-6 sm:px-6 text-left relative z-10"
                                                    >
                                                        <span className={cn(
                                                            "text-[14px] sm:text-[16px] font-normal tracking-wide text-brand-charcoal/80 transition-colors duration-300",
                                                            openIndex === index ? "text-brand-charcoal font-medium" : "group-hover:text-brand-charcoal"
                                                        )}>
                                                            {faq.question}
                                                        </span>
                                                        <span className={cn(
                                                            "shrink-0 ml-4 sm:ml-6 text-brand-charcoal/30 transition-transform duration-500",
                                                            openIndex === index ? "rotate-45 text-brand-charcoal/60" : "group-hover:text-brand-charcoal/50"
                                                        )}>
                                                            <Plus className="w-4 h-4 sm:w-5 sm:h-5 stroke-1" />
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
                                                                <div className="pb-6 pl-5 pr-5 sm:pb-8 sm:pl-6 sm:pr-12 text-brand-charcoal/60 leading-[1.6] sm:leading-[1.8] font-light text-[14px] sm:text-[15px] text-justify tracking-wide">
                                                                    {faq.answer}
                                                                </div>
                                                            </m.div>
                                                        )}
                                                    </AnimatePresence>
                                                </div>
                                            ))}


                                        </div>

                                        {/* Contact Support Section - Standalone Footer */}
                                        <div className="mt-8 sm:mt-12 mb-8 flex flex-col items-center justify-center text-center">
                                            <div className="mb-4 flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-brand-charcoal/5 text-brand-charcoal/60">
                                                <MessageCircle className="w-5 h-5 sm:w-6 sm:h-6" strokeWidth={1.2} />
                                            </div>
                                            <h3 className="mb-2 text-[15px] sm:text-[17px] font-normal tracking-wide text-brand-charcoal/90">
                                                没有找到想要的答案？
                                            </h3>
                                            <p className="mb-6 text-[13px] sm:text-sm font-light tracking-wide text-brand-charcoal/50">
                                                我们的支持团队随时候命，为您解答任何疑问。
                                            </p>
                                            <button
                                                onClick={() => openContact("support")}
                                                className="group flex items-center gap-2 rounded-full border border-brand-charcoal/10 bg-white/60 px-6 py-2.5 text-sm font-medium tracking-widest text-brand-charcoal/80 transition-all hover:bg-brand-gold/15 hover:text-[#8B7355] hover:border-[#8B7355]/30 hover:backdrop-blur-md hover:shadow-lg active:scale-95"
                                            >
                                                <span>联系我们</span>
                                                <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Footer Info - Fixed */}
                                    <div className="shrink-0 flex flex-col items-center justify-center gap-2 pt-4 pb-2">
                                        <p className="text-[10px] sm:text-[12px] font-light tracking-widest text-center text-brand-charcoal/60">
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
                            className="group -mt-[1px] relative z-10 flex items-center justify-center rounded-b-2xl bg-[#F0EDE1] px-10 py-3 shadow-sm transition-shadow hover:shadow-md lg:px-14 lg:py-3.5 pointer-events-auto"
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

        </>
    );
}

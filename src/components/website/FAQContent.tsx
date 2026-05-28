"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Link } from "next-view-transitions";
import { m, AnimatePresence } from "framer-motion";
import { ChevronDown, Plus, MessageCircle, ArrowRight, ChevronRight } from "lucide-react";
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
                    <div className="flex h-full flex-col items-center drop-shadow-[4px_2px_1px_rgba(123,114,108,0.2)]">
                        {/* Drawer Content */}
                        <m.div
                            className="relative w-full overflow-hidden rounded-b-2xl bg-[#F8F7F3] lg:rounded-b-3xl pointer-events-auto"
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
                                <div className="sticky top-0 z-50 flex h-[88px] sm:h-[80px] shrink-0 items-center justify-center sm:justify-start border-b border-transparent sm:border-brand-charcoal/5 bg-[#F8F7F3]/95 sm:bg-[#F8F7F3]/95 backdrop-blur-sm px-6 sm:px-[8%] transition-all">
                                    <Link href="/" className="flex items-center justify-center mt-1">
                                        <div className="relative h-[28px] w-[100px] sm:h-8 sm:w-[132px]">
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

                                <div className="flex-1 flex flex-col overflow-hidden pb-4 sm:px-10 lg:px-[15%] xl:px-[20%]">

                                    {/* Page Title - Desktop */}
                                    <div className="hidden sm:flex justify-center mb-10 mt-12">
                                        <h1 className="relative inline-block text-[24px] font-normal uppercase tracking-[0.2em] text-[#00263e] after:absolute after:-bottom-2.5 after:left-1/2 after:-translate-x-1/2 after:h-px after:w-[60%] after:bg-[#00263e]/20">
                                            常见问题
                                        </h1>
                                    </div>

                                    {/* Scrollable Question List */}
                                    <div className="flex-1 overflow-y-auto min-h-0 px-4 sm:px-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                                        {/* Page Title - Mobile */}
                                        <div className="flex flex-col items-center mb-7 sm:hidden">
                                            <div
                                                onClick={() => openContact("support")}
                                                className="flex h-[37px] w-full items-center justify-center mb-7 cursor-pointer active:scale-[0.98] transition-all"
                                                style={{
                                                    background: 'linear-gradient(90deg, #E8E4D8 0%, #F0EDE1 15%, #F5F3ED 50%, #F0EDE1 85%, #E8E4D8 100%)',
                                                    clipPath: 'polygon(0 0, 3% 20%, 0 40%, 4% 50%, 0 60%, 3% 80%, 0 100%, 100% 100%, 97% 80%, 100% 60%, 96% 50%, 100% 40%, 97% 20%, 100% 0)'
                                                }}
                                            >
                                                <span className="text-[12px] font-normal tracking-wide text-[#7B726C]" style={{ fontFamily: "'Source Han Sans SC', 'PingFang SC', sans-serif" }}>
                                                    遇到任何问题请联系我们的客户服务团队
                                                </span>
                                                <ChevronRight className="w-4 h-4 text-[#7B726C]" />
                                            </div>
                                            <h1 className="text-[24px] font-medium tracking-[0.2em] text-[#00263E]" style={{ fontFamily: "'Source Han Sans SC', 'PingFang SC', sans-serif" }}>
                                                常见问题
                                            </h1>
                                            <div className="mt-2 w-[70px] border-b-[1.5px] border-[#00263E]" />
                                        </div>
                                        <div className="flex flex-col gap-0 max-w-4xl mx-auto">
                                            {FAQS.map((faq, index) => (
                                                <div
                                                    key={index}
                                                    className={cn(
                                                        "group transition-all duration-500 ease-out border-b border-brand-charcoal/10 overflow-visible border-l-[1.5px] border-l-transparent",
                                                        openIndex === index
                                                            ? "bg-[#F0EDE1]/40 border-l-[#B5AC88]"
                                                            : "hover:bg-white/20"
                                                    )}
                                                >
                                                    <button
                                                        onClick={() => toggleFAQ(index)}
                                                        className="w-full flex items-start justify-between text-left gap-4 py-5 px-4 lg:py-6 lg:px-6"
                                                    >
                                                        <span className={cn(
                                                            "flex-1 text-[14px] lg:text-[16px] font-normal tracking-wide leading-snug lg:leading-normal text-[#00263E] transition-colors duration-300",
                                                            openIndex === index ? "text-brand-charcoal font-medium" : "group-hover:text-brand-charcoal"
                                                        )} style={{ fontFamily: "'Source Han Sans SC', 'PingFang SC', sans-serif" }}>
                                                            {faq.question}
                                                        </span>
                                                        <span className={cn(
                                                            "shrink-0 transition-all duration-500 p-1.5 -mr-1.5 mt-0.5 rounded-full text-brand-charcoal/30",
                                                            openIndex === index ? "rotate-45 text-brand-charcoal/80 bg-brand-charcoal/10" : "group-hover:text-brand-charcoal/50 group-hover:bg-brand-charcoal/[0.03]"
                                                        )}>
                                                            <Plus className="w-5 h-5 stroke-[1.5]" />
                                                        </span>
                                                    </button>
                                                    <AnimatePresence>
                                                        {openIndex === index && (
                                                            <m.div
                                                                initial={{ height: 0, opacity: 0 }}
                                                                animate={{ height: "auto", opacity: 1 }}
                                                                exit={{ height: 0, opacity: 0 }}
                                                                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                                                                style={{ overflow: "hidden" }}
                                                            >
                                                                <div className="pb-8 pl-6 pr-6 lg:pr-12 text-[14px] lg:text-[15px] font-light text-brand-charcoal/70 leading-snug lg:leading-[1.8] tracking-wide" style={{ fontFamily: "'Source Han Sans SC', 'PingFang SC', sans-serif" }}>
                                                                    {faq.answer}
                                                                </div>
                                                            </m.div>
                                                        )}
                                                    </AnimatePresence>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Contact Support Section */}
                                        <div className="mt-7 sm:mt-12 mb-7 flex flex-col items-center justify-center text-center sm:px-4">
                                            <div className="hidden sm:mb-4 sm:flex h-10 w-10 lg:h-12 lg:w-12 items-center justify-center rounded-full bg-brand-charcoal/5 text-brand-charcoal/60">
                                                <MessageCircle className="w-5 h-5 lg:w-6 lg:h-6" strokeWidth={1.2} />
                                            </div>
                                            <h3 className="hidden sm:block sm:mb-2 sm:text-[15px] lg:text-[17px] sm:font-normal sm:tracking-wide sm:text-brand-charcoal/90">
                                                没有找到想要的答案？
                                            </h3>
                                            <p className="hidden sm:block sm:mb-6 sm:text-[13px] lg:text-sm sm:font-light sm:tracking-wide sm:text-brand-charcoal/50">
                                                我们的支持团队随时候命，为您解答任何疑问。
                                            </p>
                                            <button
                                                onClick={() => openContact("support")}
                                                className="flex items-center gap-2 rounded-full bg-[#F0EDE1] px-7 py-3 text-[14px] lg:text-[16px] font-medium tracking-[0.2em] text-[#7B726C] sm:border sm:border-brand-charcoal/10 sm:bg-white/60 sm:px-6 sm:py-2.5 sm:font-medium sm:tracking-widest sm:text-brand-charcoal/80 sm:transition-all sm:hover:bg-brand-gold/15 sm:hover:text-[#8B7355] sm:hover:border-[#8B7355]/30 sm:hover:backdrop-blur-md sm:hover:shadow-lg sm:active:scale-95"
                                                style={{ fontFamily: "'Source Han Sans SC', 'PingFang SC', sans-serif" }}
                                            >
                                                <span>联系我们</span>
                                                <ArrowRight size={14} className="sm:transition-transform sm:group-hover:translate-x-0.5" />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Footer Info */}
                                    <div className="flex flex-col items-center justify-center pt-3 pb-1 sm:shrink-0 sm:gap-2 sm:pt-4 sm:pb-2">
                                        <p className="text-[10px] font-medium tracking-[0.12em] text-[rgba(123,114,108,0.3)] sm:text-[12px] sm:font-light sm:tracking-widest sm:text-center sm:text-brand-charcoal/60" style={{ fontFamily: "'Futura', sans-serif" }}>
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
                            className="group -mt-[1px] relative z-30 flex items-center justify-center rounded-b-2xl bg-[#F8F7F3] px-10 py-3 lg:px-14 lg:py-3.5 pointer-events-auto"
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

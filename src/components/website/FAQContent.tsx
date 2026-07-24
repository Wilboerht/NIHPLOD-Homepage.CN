"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { Link } from "next-view-transitions";
import { useRouter } from "next/navigation";
import { m, AnimatePresence } from "framer-motion";
import { Plus, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLayout } from "@/contexts/LayoutContext";
import { DrawerPageContainer } from "@/components/ui/DrawerPageContainer";

const FAQS = [
  {
    question: "什么是 NIHPLOD ?",
    answer: (
      <div className="space-y-3">
        <p>
          海豚的皮肤拥有神奇的自我更新能力，每两小时就能更新一次。 我们从这种 “时间逆转”
          的动物本能中汲取灵感。
        </p>
        <p>随着时间和空间的变化，我们的皮肤会因工作压力、不良习惯和衰老而面临各种问题。</p>
        <p>
          在逆转这一切之前，我们将“ Dolphin ”这个词反过来，也就是{" "}
          <span className="font-medium text-brand-charcoal">NIHPLOD</span> (发音 / nɪˈplɒd /)
          的来源。
        </p>
        <p>NIHPLOD 运用最前沿的生物技术和配方，在护肤领域尽最大努力帮助人们 “逆转时光”。</p>
      </div>
    ),
  },
  {
    question: "NIHPLOD 和其它护肤品牌有什么不一样的地方 ?",
    answer: (
      <div className="space-y-3">
        <p>随着现代科学技术的不断发展，越来越多的活性成分被应用于化妆品领域。</p>
        <p>
          然而
          ，这些有效成分是否真的能被皮肤吸收而不被氧化、分解或产生不良反应，这可能是您真正需要认真考虑的问题。
        </p>
        <p>
          NIHPLOD 的主要产品，结合了当今前沿的{" "}
          <span className="font-medium text-brand-charcoal">脂质体技术</span>，将重要的{" "}
          <span className="font-medium text-brand-charcoal">活性成分</span>{" "}
          和生长因子靶向输送到皮肤进行修复或改善 ，从而更有效地达到理想的护肤效果。
        </p>
      </div>
    ),
  },
  {
    question: "使用 NIHPLOD 的产品多久可以看到效果 ?",
    answer: (
      <div className="space-y-3">
        <p>
          根据产品的不同优势和作用，您可能最快在 数天内
          就能看到各类肌肤修护的显著效果，而一些色素及初老特征问题可能需要{" "}
          <span className="font-medium text-brand-charcoal">2-4 周</span> 甚至更久。
        </p>
        <p>我们强烈建议您在享受我们产品的同时，保持更积极、更健康的生活方式，由内而外的悦己。</p>
      </div>
    ),
  },
  {
    question: "NIHPLOD 主张的「精简护肤」对我有什么好处 ?",
    answer: (
      <div className="space-y-3">
        <p>
          我们的专家团队曾多次强调{" "}
          <span className="font-medium text-brand-charcoal">
            “过度的皮肤护理, 是对肌肤的一种变相伤害”
          </span>
        </p>
        <p>真正好的护肤法则，不是堆叠步骤，而是给皮肤刚刚好的关爱。</p>
        <p>
          旎柏的产品线不多，就 <span className="font-medium text-brand-charcoal">9个单品</span>
          ，但每个都是用心打造，旨在通过最精简的护理，带给用户最有效的体验和结果。
        </p>
        <p>如果不想在护肤这个环节花费过量的精力和时间，不妨试试旎柏；</p>
        <p>试着把更多的时间专注在生活中其它的精彩部分，也许你会收获更多。</p>
      </div>
    ),
  },
  {
    question: "敏感肌可以使用 NIHPLOD 的产品吗 ?",
    answer: (
      <div className="space-y-3">
        <p>
          当然。我们所有的产品对于{" "}
          <span className="font-medium text-brand-charcoal">敏感的肌肤非常友好</span>
          ，最大化的避免使用任何多余的、刺激性的成分，以免引起而非缓解炎症和皮肤刺激。
        </p>
        <p>
          然而，每个人的肤质都不同，皮肤可能对任何成分产生不良反应。例如，有些人可能对精油或海藻提取物等天然成分过敏，因此我们在本站的产品页面上展示了主要的成分列表，以便顾客在购买前做出明智的选择。
        </p>
        <p>
          即使是最“温和”的成分也可能在某些人的皮肤上引起反应，所以我们建议您先取少量产品涂抹在手腕内侧的皮肤上进行简易测试，以确定其是否适合您的肤质。
        </p>
      </div>
    ),
  },
  {
    question: "我可以和我的家人分享我的产品吗？",
    answer: (
      <div className="space-y-3">
        <p>
          完全可以。NIHPLOD 的所有产品{" "}
          <span className="font-medium text-brand-charcoal">男女皆可使用 (全肤质配方设计)</span>。
        </p>
        <p>
          我们在成分选择上也秉持中立原则。
          产品质地天然、清爽不油腻且高效，因此也适用于男性较厚的皮肤。
        </p>
      </div>
    ),
  },
  {
    question: "孕妇或 (产后) 月子期可以使用吗 ?",
    answer: (
      <div className="space-y-3">
        <p>
          当然可以。旎柏旗下的主要产品均已获得{" "}
          <span className="font-medium text-brand-charcoal">国际权威检测机构 SGS 认证</span>
          ，在细胞毒性、内分泌干扰物、致敏原、致畸性等多个 (孕中及产后) 维度均{" "}
          <span className="font-medium text-brand-charcoal">表现安全</span>
          ，不会对孕妇造成不适或不良反应。
        </p>
        <p className="mt-2 text-[14px] font-light leading-[1.8] tracking-[0.06em] text-brand-charcoal/50">
          * 若出于谨慎考虑，建议可咨询您的专属医生后再做决定。
        </p>
      </div>
    ),
  },
];

export function FAQContent() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [mobileSelectedIndex, setMobileSelectedIndex] = useState<number | null>(null);
  const mobileScrollRef = useRef<HTMLDivElement>(null);
  const fadeMaskRef = useRef<HTMLDivElement>(null);
  const { isDrawerOpen } = useLayout();
  const router = useRouter();

  // PC端遮罩始终可见；移动端仅在滚动后显示
  useEffect(() => {
    const el = mobileScrollRef.current;
    const mask = fadeMaskRef.current;
    if (!el || !mask) return;
    const mql = window.matchMedia("(min-width: 640px)");
    const sync = () => {
      if (mql.matches) {
        mask.style.opacity = "1";
      } else {
        mask.style.opacity = el.scrollTop > 8 ? "1" : "0";
      }
    };
    sync();
    el.addEventListener("scroll", sync, { passive: true });
    mql.addEventListener("change", sync);
    return () => {
      el.removeEventListener("scroll", sync);
      mql.removeEventListener("change", sync);
    };
  }, []);

  // Toggle Accordion
  const toggleFAQ = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <DrawerPageContainer wrapperClassName="!top-0 !pointer-events-none">
      {/* Texture Overlay */}
      <div className="texture-overlay absolute inset-0" />

      {/* Scrollable Content */}
      <div
        className={cn(
          "relative z-10 flex h-full flex-col overflow-hidden transition-opacity duration-300",
          isDrawerOpen ? "opacity-100 delay-300" : "pointer-events-none opacity-0"
        )}
      >
        {/* Header - Mobile 与 About/Guide 88px 标准对齐；sm+ 保持原有 PC 样式 */}
        <div className="sticky top-0 z-50 flex h-[88px] shrink-0 items-center justify-center border-b border-transparent bg-brand-cream/95 px-6 backdrop-blur-sm transition-all sm:justify-start sm:border-brand-charcoal/5 sm:px-[8%]">
          {/* Mobile Back Button - 仅在详情态显示 */}
          <AnimatePresence>
            {mobileSelectedIndex !== null && (
              <m.button
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                onClick={() => setMobileSelectedIndex(null)}
                className="absolute left-4 flex items-center gap-0.5 text-[13px] font-light tracking-[0.04em] text-brand-charcoal/50 transition-colors active:text-brand-charcoal/80 sm:hidden"
              >
                <ChevronLeft className="h-4 w-4" />
                返回
              </m.button>
            )}
          </AnimatePresence>
          <Link href="/" className="mt-1 flex items-center justify-center">
            <div className="relative h-[28px] w-[100px] sm:h-9 sm:w-[150px]">
              <Image
                src="/images/NIHPLOD-logo.svg"
                alt="NIHPLOD"
                fill
                className="object-contain"
                priority
              />
            </div>
          </Link>
          <div className="texture-overlay absolute inset-0 z-[-1]" />
        </div>

        <div className="flex flex-1 flex-col overflow-hidden pb-6 sm:pb-0 sm:px-10 lg:px-[15%] xl:px-[20%]">

          {/* Scroll Area Wrapper - 承载顶部渐隐遮罩 */}
          <div className="relative min-h-0 flex-1 overflow-hidden">
            {/* Top Fade Mask - 仅在滚动后显示，通过 ref 直接操作避免重渲染 */}
            <div
              ref={fadeMaskRef}
              className="pointer-events-none absolute inset-x-0 top-0 z-30 h-6 transition-opacity duration-300"
              style={{ background: "linear-gradient(to bottom, #FBF8F0, transparent)", opacity: 0 }}
            />

            {/* Scrollable Content */}
            <div
              ref={mobileScrollRef}
              className="flex h-full flex-col overflow-y-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >

              {/* ===== Mobile: Drill-down List/Detail ===== */}
              <div className="flex flex-1 flex-col sm:hidden">
                <AnimatePresence mode="wait">
                  {mobileSelectedIndex === null ? (
                    /* --- List View --- */
                    <m.div
                      key="faq-list"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                      className="flex min-h-full flex-col px-6"
                    >
                      {/* Page Title */}
                      <div className="mb-8 flex flex-col items-center pt-3">
                        <h1 className="text-[19px] font-normal tracking-[0.15em] text-[#00263E]">
                          常见问题
                        </h1>
                        <div className="mt-2 w-[70px] border-b border-[#00263E]" />
                      </div>

                      {/* Question List - no dividers, numbered */}
                      <div className="flex flex-col gap-1">
                        {FAQS.map((faq, index) => (
                          <button
                            key={index}
                            onClick={() => setMobileSelectedIndex(index)}
                            className="flex items-center gap-3 rounded-lg px-3 py-4 text-left transition-colors duration-200 active:bg-brand-charcoal/[0.03]"
                          >
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-[1.5px] border-brand-primary/70 text-[11px] font-normal text-brand-primary/80">
                              {index + 1}
                            </span>
                            <span className="flex-1 truncate text-[14px] font-light leading-[1.6] tracking-[0.04em] text-[#00263E]">
                              {faq.question}
                            </span>
                          </button>
                        ))}
                      </div>

                      {/* Contact Support */}
                      <div className="mt-7 flex flex-col items-center justify-center text-center">
                        {/* Decorative Separator */}
                        <div className="mb-7 w-[40px] border-b border-brand-charcoal/[0.12]" />
                        <h3 className="mb-3 text-[14px] font-light tracking-[0.08em] text-brand-charcoal/70">
                          没有找到想要的答案？
                        </h3>
                        <p className="mb-6 text-[13px] font-light tracking-[0.08em] text-brand-charcoal/50">
                          我们的支持团队随时候命，为您解答任何疑问。
                        </p>
                        <button
                          onClick={() => router.push("/contact?type=support")}
                          className="rounded-full border border-brand-charcoal/20 px-6 py-3.5 text-[14px] font-light tracking-[0.08em] text-brand-charcoal/70 transition-all duration-300 active:scale-[0.97]"
                        >
                          联系我们
                        </button>
                      </div>

                      {/* Mobile Footer Copyright */}
                      <div className="mt-auto flex flex-col items-center justify-center pt-10">
                        <p className="text-[12px] font-light tracking-[0.08em] text-brand-charcoal/[0.48]">
                          &copy; {new Date().getFullYear()} NIHPLOD. All Rights Reserved.
                        </p>
                      </div>
                    </m.div>
                  ) : (
                    /* --- Detail View --- */
                    <m.div
                      key={`faq-detail-${mobileSelectedIndex}`}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                      className="flex min-h-full flex-col px-6"
                    >
                      {/* Question Title */}
                      <div className="pt-6">
                        <h2 className="text-[17px] font-normal leading-[1.6] tracking-[0.06em] text-brand-primary">
                          {FAQS[mobileSelectedIndex].question}
                        </h2>
                      </div>

                      {/* Decorative Divider */}
                      <div className="mx-auto mt-6 w-[40px] border-b border-brand-charcoal/[0.12]" />

                      {/* Answer */}
                      <div className="mt-6 text-[14px] font-light leading-[1.8] tracking-[0.06em] text-brand-charcoal/90">
                        {FAQS[mobileSelectedIndex].answer}
                      </div>

                      {/* Mobile Footer Copyright */}
                      <div className="mt-auto flex flex-col items-center justify-center pt-10">
                        <p className="text-[12px] font-light tracking-[0.08em] text-brand-charcoal/[0.48]">
                          &copy; {new Date().getFullYear()} NIHPLOD. All Rights Reserved.
                        </p>
                      </div>
                    </m.div>
                  )}
                </AnimatePresence>
              </div>

              {/* ===== PC: Accordion (unchanged) ===== */}
              <div className="hidden sm:block">
                {/* Page Title - Desktop */}
                <div className="mb-6 mt-8 flex justify-center">
                  <h1 className="relative inline-block text-[24px] font-light tracking-[0.15em] text-[#00263e] after:absolute after:-bottom-2.5 after:left-1/2 after:h-px after:w-[60%] after:-translate-x-1/2 after:bg-[#00263e]/20">
                    常见问题
                  </h1>
                </div>

                <div className="mx-auto flex max-w-4xl flex-col gap-0">
                  {FAQS.map((faq, index) => (
                    <div
                      key={index}
                      className={cn(
                        "group border-b border-l-[1.5px] border-brand-charcoal/10 border-l-transparent border-t-0 border-r-0 transition-colors duration-500 ease-out",
                        openIndex === index
                          ? "bg-[#FFFFFF]/40 border-l-[#B5AC88]"
                          : "hover:bg-white/20"
                      )}
                    >
                      <button
                        onClick={() => toggleFAQ(index)}
                        className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left lg:py-6"
                      >
                        <span
                          className={cn(
                            "flex-1 text-[14px] font-light leading-snug tracking-[0.08em] text-[#00263E] transition-colors duration-300 lg:text-[16px] lg:leading-normal",
                            openIndex === index
                              ? "text-brand-charcoal"
                              : "group-hover:text-brand-charcoal"
                          )}
                        >
                          {faq.question}
                        </span>
                        <span
                          className={cn(
                            "shrink-0 rounded-full p-1.5 text-brand-charcoal/30 transition-all duration-500",
                            openIndex === index
                              ? "rotate-45 text-brand-charcoal/80 bg-brand-charcoal/10"
                              : "group-hover:text-brand-charcoal/50 group-hover:bg-brand-charcoal/[0.03]"
                          )}
                        >
                          <Plus className="h-5 w-5 stroke-[1.5]" />
                        </span>
                      </button>
                      <AnimatePresence>
                        {openIndex === index && (
                          <m.div
                            initial={{ gridTemplateRows: "0fr", opacity: 0 }}
                            animate={{ gridTemplateRows: "1fr", opacity: 1 }}
                            exit={{ gridTemplateRows: "0fr", opacity: 0 }}
                            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                            style={{ display: "grid" }}
                          >
                            <div style={{ overflow: "hidden" }}>
                              <div className="pb-8 pl-6 pr-6 pt-0 text-[14px] font-light leading-[1.8] tracking-[0.06em] text-brand-charcoal/90 lg:pr-12 lg:text-[15px]">
                                {faq.answer}
                              </div>
                            </div>
                          </m.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                </div>

                {/* Contact Support - Desktop */}
                <div className="mt-12 flex flex-col items-center justify-center px-4 text-center">
                  <h3 className="mb-2 text-[15px] font-light tracking-[0.08em] text-brand-charcoal/70">
                    没有找到想要的答案？
                  </h3>
                  <p className="mb-6 text-[14px] font-light tracking-[0.08em] text-brand-charcoal/50">
                    我们的支持团队随时候命，为您解答任何疑问。
                  </p>
                  <button
                    onClick={() => router.push("/contact?type=support")}
                    className="rounded-full border border-brand-beige/60 px-6 py-3.5 text-[14px] font-light tracking-[0.08em] text-brand-charcoal/70 transition-all duration-300 hover:border-brand-charcoal/20 hover:text-brand-charcoal active:scale-[0.97]"
                  >
                    联系我们
                  </button>
                </div>
              </div>

            </div>
          </div>

          {/* Footer Info - Desktop 固定页脚 */}
          <div className="hidden shrink-0 flex-col items-center justify-center gap-2 pt-10 pb-4 sm:flex">
            <p className="text-center text-[12px] font-light tracking-[0.1em] text-brand-charcoal/[0.48]">
              &copy; {new Date().getFullYear()} NIHPLOD. All Rights Reserved.
            </p>
          </div>
        </div>
      </div>
    </DrawerPageContainer>
  );
}

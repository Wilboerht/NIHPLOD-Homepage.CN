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
import { Breadcrumbs } from "@/components/website/Breadcrumbs";
import { faqData } from "@/config/faq-data";

/** Footer 版权信息组件 */
function FooterCopyright() {
  return <>&copy; {new Date().getFullYear()} NIHPLOD. All Rights Reserved.</>;
}

/** 渲染纯文本 FAQ 段落（与 FAQPage 结构化数据同源） */
function FaqAnswer({ paragraphs }: { paragraphs: string[] }) {
  return (
    <>
      {paragraphs.map((paragraph, index) => {
        const isNote = paragraph.startsWith("* ");
        return (
          <p
            key={index}
            className={cn(
              index > 0 && "mt-3",
              isNote &&
                "text-[14px] font-light leading-[1.8] tracking-[0.06em] text-brand-charcoal/50"
            )}
          >
            {paragraph}
          </p>
        );
      })}
    </>
  );
}

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

        <Breadcrumbs
          items={[
            { name: "首页", url: "/" },
            { name: "常见问题", url: "/faq" },
          ]}
          className="shrink-0 pt-4"
        />

        <div className="flex flex-1 flex-col overflow-hidden pb-6 sm:px-10 sm:pb-0 lg:px-[15%] xl:px-[20%]">
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
                      {/* Page Title（h1 由 PC 布局输出，此处避免重复） */}
                      <div className="mb-8 flex flex-col items-center pt-3">
                        <div className="text-[19px] font-normal tracking-[0.15em] text-brand-charcoal">
                          常见问题
                        </div>
                        <div className="mt-2 w-[70px] border-b border-brand-charcoal" />
                      </div>

                      {/* Question List - no dividers, numbered */}
                      <div className="flex flex-col gap-1">
                        {faqData.map((faq, index) => (
                          <button
                            key={index}
                            onClick={() => setMobileSelectedIndex(index)}
                            className="flex items-center gap-3 rounded-lg px-3 py-4 text-left transition-colors duration-200 active:bg-brand-charcoal/[0.03]"
                          >
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-[1.5px] border-brand-primary/70 text-[11px] font-normal text-brand-primary/80">
                              {index + 1}
                            </span>
                            <span className="flex-1 truncate text-[14px] font-light leading-[1.6] tracking-[0.04em] text-brand-charcoal">
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
                          <FooterCopyright />
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
                          {faqData[mobileSelectedIndex].question}
                        </h2>
                      </div>

                      {/* Decorative Divider */}
                      <div className="mx-auto mt-6 w-[40px] border-b border-brand-charcoal/[0.12]" />

                      {/* Answer */}
                      <div className="mt-6 text-[14px] font-light leading-[1.8] tracking-[0.06em] text-brand-charcoal/90">
                        <FaqAnswer paragraphs={faqData[mobileSelectedIndex].answer} />
                      </div>

                      {/* Mobile Footer Copyright */}
                      <div className="mt-auto flex flex-col items-center justify-center pt-10">
                        <p className="text-[12px] font-light tracking-[0.08em] text-brand-charcoal/[0.48]">
                          <FooterCopyright />
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
                  <h1 className="relative inline-block text-[24px] font-light tracking-[0.15em] text-brand-charcoal after:absolute after:-bottom-2.5 after:left-1/2 after:h-px after:w-[60%] after:-translate-x-1/2 after:bg-brand-charcoal/20">
                    常见问题
                  </h1>
                </div>

                <div className="mx-auto flex max-w-4xl flex-col gap-0">
                  {faqData.map((faq, index) => (
                    <div
                      key={index}
                      className={cn(
                        "group border-b border-l-[1.5px] border-r-0 border-t-0 border-brand-charcoal/10 border-l-transparent transition-colors duration-500 ease-out",
                        openIndex === index
                          ? "border-l-[#B5AC88] bg-[#FFFFFF]/40"
                          : "hover:bg-white/20"
                      )}
                    >
                      <button
                        onClick={() => toggleFAQ(index)}
                        className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left lg:py-6"
                      >
                        <span
                          className={cn(
                            "flex-1 text-[14px] font-light leading-snug tracking-[0.08em] text-brand-charcoal transition-colors duration-300 lg:text-[16px] lg:leading-normal",
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
                              ? "rotate-45 bg-brand-charcoal/10 text-brand-charcoal/80"
                              : "group-hover:bg-brand-charcoal/[0.03] group-hover:text-brand-charcoal/50"
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
                                <FaqAnswer paragraphs={faq.answer} />
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
          <div className="hidden shrink-0 flex-col items-center justify-center gap-2 pb-4 pt-10 sm:flex">
            <p className="text-center text-[12px] font-light tracking-[0.1em] text-brand-charcoal/[0.48]">
              <FooterCopyright />
            </p>
          </div>
        </div>
      </div>
    </DrawerPageContainer>
  );
}

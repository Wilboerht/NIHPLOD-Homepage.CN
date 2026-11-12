"use client";

import { useState } from "react";
import { m } from "framer-motion";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProductFaqProps {
  faqs: { question: string; answer: string }[];
  title?: string;
  className?: string;
}

/**
 * 产品页可见 FAQ
 * 与页面 FAQPage 结构化数据共用同一份问答，满足「结构化数据需对应用户可见内容」。
 * 答案始终保留在 DOM 中（关闭时仅收起高度），确保不执行 JS 的 AI 爬虫也能读取。
 */
export function ProductFaq({ faqs, title = "常见问题", className }: ProductFaqProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (faqs.length === 0) {
    return null;
  }

  return (
    <section
      id="faq"
      aria-label="产品常见问题"
      className={cn(
        "mx-auto mt-8 w-full max-w-4xl border-t border-brand-beige px-4 pb-12 pt-6 sm:px-6",
        className
      )}
    >
      <div className="mb-4 flex justify-center border-b border-brand-beige/80 pb-4">
        <h2 className="text-center text-[19px] font-normal tracking-[0.15em] text-brand-charcoal lg:text-[24px] lg:font-light">
          {title}
        </h2>
      </div>
      <div className="flex w-full flex-col">
        {faqs.map((faq, index) => {
          const isOpen = openIndex === index;
          return (
            <div
              key={`${index}-${faq.question}`}
              className={cn(
                "group border-b border-l-[1.5px] border-r-0 border-t-0 border-brand-charcoal/10 border-l-transparent transition-colors duration-500 ease-out",
                isOpen ? "border-l-brand-buff bg-white/40" : "hover:bg-white/20"
              )}
            >
              <button
                type="button"
                onClick={() => setOpenIndex(isOpen ? null : index)}
                aria-expanded={isOpen}
                aria-controls={`faq-answer-${index}`}
                className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left sm:px-5"
              >
                <span
                  role="heading"
                  aria-level={3}
                  className="flex-1 text-[14px] font-normal leading-[1.6] tracking-[0.03em] text-brand-charcoal transition-colors duration-300 lg:text-[15px]"
                >
                  {faq.question}
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-full p-1.5 text-brand-charcoal/30 transition-all duration-500",
                    isOpen
                      ? "rotate-45 bg-brand-charcoal/10 text-brand-charcoal/80"
                      : "group-hover:bg-brand-charcoal/[0.03] group-hover:text-brand-charcoal/50"
                  )}
                >
                  <Plus className="h-4 w-4 stroke-[1.5]" />
                </span>
              </button>
              <m.div
                id={`faq-answer-${index}`}
                initial={false}
                animate={{ gridTemplateRows: isOpen ? "1fr" : "0fr", opacity: isOpen ? 1 : 0 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                style={{ display: "grid" }}
                aria-hidden={!isOpen}
              >
                <div style={{ overflow: "hidden" }}>
                  <div className="whitespace-pre-line px-4 pb-5 pt-0 text-[14px] font-light leading-[1.7] tracking-[0.02em] text-brand-charcoal/90 sm:px-5 lg:pr-8">
                    {faq.answer}
                  </div>
                </div>
              </m.div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

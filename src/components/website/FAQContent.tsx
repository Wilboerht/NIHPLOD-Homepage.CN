"use client";

import { useState } from "react";
import Image from "next/image";
import { Link } from "next-view-transitions";
import { useRouter } from "next/navigation";
import { m, AnimatePresence } from "framer-motion";
import { Plus, MessageCircle, ArrowRight } from "lucide-react";
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
        <p className="mt-2 text-xs italic text-brand-charcoal/50">
          * 若出于谨慎考虑，建议可咨询您的专属医生后再做决定。
        </p>
      </div>
    ),
  },
];

export function FAQContent() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const { isDrawerOpen } = useLayout();
  const router = useRouter();

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
        {/* Fixed Header - Mobile aligned with Ritual, PC kept stable */}
        <div className="sticky top-0 z-50 flex h-[88px] shrink-0 items-center justify-center border-b border-transparent bg-[#FBF8F0]/95 px-6 backdrop-blur-sm transition-all sm:justify-start sm:border-brand-charcoal/5 sm:px-[8%]">
          <Link href="/" className="mt-1 flex items-center justify-center">
            <div className="relative h-[42px] w-[150px] sm:h-9 sm:w-[150px]">
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

        <div className="flex flex-1 flex-col overflow-hidden pb-4 sm:px-10 lg:px-[15%] xl:px-[20%]">
          {/* Page Title - Desktop */}
          <div className="mb-6 mt-8 hidden justify-center sm:flex">
              <h1 className="relative inline-block text-[24px] font-light tracking-[0.15em] text-[#00263e] after:absolute after:-bottom-2.5 after:left-1/2 after:h-px after:w-[60%] after:-translate-x-1/2 after:bg-[#00263e]/20">
              常见问题
            </h1>
          </div>

          {/* Scrollable Question List */}
          <div className="min-h-0 flex-1 scroll-pb-6 overflow-y-auto px-4 [-ms-overflow-style:none] [scrollbar-width:none] sm:px-0 [&::-webkit-scrollbar]:hidden">
            {/* Page Title - Mobile */}
            <div className="mb-7 flex flex-col items-center pb-2 pt-2 sm:hidden">
              <h1
                className="text-[24px] font-light tracking-[0.15em] text-[#00263E]"
                style={{ fontFamily: "'Source Han Sans SC', 'PingFang SC', sans-serif" }}
              >
                常见问题
              </h1>
              <div className="mt-2 w-[70px] border-b-[1.5px] border-[#00263E]" />
            </div>
            <div className="mx-auto flex max-w-4xl flex-col gap-3 sm:gap-0">
              {FAQS.map((faq, index) => (
                <div
                  key={index}
                  className={cn(
                    "group transition-colors duration-500 ease-out",
                    "mb-3 rounded-lg p-4 sm:mb-0 sm:overflow-visible sm:rounded-none sm:border-b sm:border-l-[1.5px] sm:border-brand-charcoal/10 sm:border-l-transparent sm:p-0",
                    openIndex === index
                      ? "bg-[#FFFFFF] sm:border-l-[#B5AC88] sm:bg-[#FFFFFF]/40"
                      : "ring-[1.5px] ring-inset ring-[#FFFFFF] sm:ring-0 sm:hover:bg-white/20"
                  )}
                >
                  <button
                    onClick={() => toggleFAQ(index)}
                    className="flex w-full items-center justify-between gap-4 px-0 py-3 text-left sm:px-4 sm:py-5 lg:px-6 lg:py-6"
                  >
                    <span
                      className={cn(
                        "flex-1 text-[14px] font-light leading-snug tracking-[0.12em] text-[#00263E] transition-colors duration-300 lg:text-[16px] lg:leading-normal",
                        openIndex === index
                          ? "text-brand-charcoal"
                          : "group-hover:text-brand-charcoal"
                      )}
                      style={{ fontFamily: "'Source Han Sans SC', 'PingFang SC', sans-serif" }}
                    >
                      {faq.question}
                    </span>
                    <span
                      className={cn(
                        "-mr-1.5 shrink-0 p-1.5 text-brand-charcoal/30 transition-all duration-500 sm:rounded-full",
                        openIndex === index
                          ? "rotate-45 text-brand-charcoal/80 sm:bg-brand-charcoal/10"
                          : "group-hover:text-brand-charcoal/50 sm:group-hover:bg-brand-charcoal/[0.03]"
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
                          <div
                            className="border-l border-brand-charcoal/20 pb-5 pl-4 pr-4 pt-5 text-[14px] font-light leading-[1.7] text-brand-charcoal/80 sm:border-l-0 sm:pb-8 sm:pl-6 sm:pr-6 sm:pt-0 lg:pr-12 lg:text-[15px] lg:leading-[1.8]"
                            style={{
                              fontFamily: "'Source Han Sans SC', 'PingFang SC', sans-serif",
                            }}
                          >
                            {faq.answer}
                          </div>
                        </div>
                      </m.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>

            {/* Contact Support Section */}
            <div className="mb-7 mt-7 flex flex-col items-center justify-center text-center sm:mt-12 sm:px-4">
              <div className="hidden h-10 w-10 items-center justify-center rounded-full bg-brand-charcoal/5 text-brand-charcoal/60 sm:mb-4 sm:flex lg:h-12 lg:w-12">
                <MessageCircle className="h-5 w-5 lg:h-6 lg:w-6" strokeWidth={1.2} />
              </div>
              <h3 className="hidden sm:mb-2 sm:block sm:text-[15px] sm:font-light sm:tracking-[0.12em] sm:text-brand-charcoal/90 lg:text-[17px]">
                没有找到想要的答案？
              </h3>
              <p className="hidden sm:mb-6 sm:block sm:text-[14px] sm:font-light sm:tracking-[0.12em] sm:text-brand-charcoal/60 lg:text-sm">
                我们的支持团队随时候命，为您解答任何疑问。
              </p>
              <button
                onClick={() => router.push("/contact?type=support")}
                className="flex items-center gap-2 rounded-full bg-[#FFFFFF] px-7 py-3 text-[14px] font-light tracking-[0.15em] text-[#4A6272] sm:border sm:border-brand-charcoal/10 sm:bg-white/60 sm:px-6 sm:py-2.5 sm:tracking-[0.15em] sm:text-brand-charcoal/80 sm:transition-all sm:hover:border-[#4A6272]/30 sm:hover:bg-brand-primary/15 sm:hover:text-[#4A6272] sm:hover:shadow-lg sm:hover:backdrop-blur-md sm:active:scale-95 lg:text-[16px]"
                style={{ fontFamily: "'Source Han Sans SC', 'PingFang SC', sans-serif" }}
              >
                <span>更多疑问</span>
                <ArrowRight
                  size={14}
                  className="sm:transition-transform sm:group-hover:translate-x-0.5"
                />
              </button>
            </div>
          </div>

          {/* Footer Info */}
          <div className="flex shrink-0 flex-col items-center justify-center gap-2 pt-4">
            <p className="text-center text-[11px] font-light tracking-[0.15em] text-brand-charcoal/[0.48]">
              &copy; {new Date().getFullYear()} NIHPLOD. All Rights Reserved.
            </p>
          </div>
        </div>
      </div>
    </DrawerPageContainer>
  );
}

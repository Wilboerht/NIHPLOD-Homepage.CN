"use client";

import Image from "next/image";
import { Link } from "next-view-transitions";
import { cn } from "@/lib/utils";
import { useLayout } from "@/contexts/LayoutContext";
import { DrawerPageContainer } from "@/components/ui/DrawerPageContainer";

const patents = [
  {
    id: "EP0272091",
    title: "含有两亲子体相关活性成分的给药工具",
    url: "https://patentscope.wipo.int/search/zh/result.jsf?query=EP0272091",
  },
  {
    id: "AU1991091780",
    title: "制备含脂质体的药物的加载技术",
    url: "https://patentscope.wipo.int/search/zh/result.jsf?query=AU1991091780",
  },
  {
    id: "US5817334",
    title: "干燥时稳定性提高的脂质体的制造方法",
    url: "https://patentscope.wipo.int/search/zh/result.jsf?query=US5817334",
  },
];

export function TechnologyContent() {
  const { isDrawerOpen } = useLayout();

  return (
    <DrawerPageContainer wrapperClassName="!top-0 !pointer-events-none">
      {/* 矿物纹理覆盖层 */}
      <div className="texture-overlay absolute inset-0" />

      <div
        className={cn(
          "relative z-10 flex h-full flex-col overflow-hidden transition-opacity duration-300",
          isDrawerOpen ? "opacity-100 delay-300" : "pointer-events-none opacity-0"
        )}
      >
        {/* Header - 与 FAQ/About/Guide 的 88px 标准对齐 */}
        <div className="sticky top-0 z-50 flex h-[88px] shrink-0 items-center justify-center border-b border-transparent bg-brand-cream/95 px-6 backdrop-blur-sm sm:justify-start sm:border-brand-charcoal/5 lg:px-10 xl:px-[8%]">
          <Link href="/" className="mt-1 flex items-center justify-center">
            <div className="relative h-[28px] w-[100px] sm:h-9 sm:w-[150px]">
              <Image
                src="/images/NIHPLOD-logo.svg"
                alt="NIHPLOD"
                fill
                className="object-contain object-left"
                priority
              />
            </div>
          </Link>
          <div className="texture-overlay absolute inset-0 z-[-1]" />
        </div>

        {/* 滚动内容区 */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex min-h-full flex-col">
            <main className="w-full flex-1 px-6 pb-6 pt-6 lg:px-10 lg:pt-8 xl:px-[8%]">
              <article className="w-full font-sans">
                {/* 标题区 */}
                <header className="border-b border-brand-charcoal/10 pb-8">
                  <div>
                    <h1
                      tabIndex={-1}
                      className="text-[22px] font-normal tracking-[0.08em] text-brand-charcoal focus:outline-none sm:text-[26px]"
                    >
                      脂质体技术
                    </h1>
                    <p className="mt-4 text-[14px] font-light leading-[1.9] tracking-[0.04em] text-brand-charcoal/70">
                      NIHPLOD 旎柏通过与{" "}
                      <a
                        href="https://www.gilead.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-primary underline decoration-brand-primary/40 underline-offset-2 transition-colors hover:decoration-brand-primary"
                      >
                        Gilead NexStar Pharmaceuticals
                      </a>{" "}
                      的合作，引入最先进的脂质体技术，将重要的活性成分包封于类脂质双分子层内，以微型囊泡的形式进入皮肤。脂质体的结构近乎人体皮肤脂质构造，与表皮层的细胞间质非常相融，进而对肌肤进行靶向修护或提升，达到更高效、更理想的护肤效果。
                    </p>
                    <ul className="mt-3 list-disc space-y-1.5 pl-4 text-[14px] font-light leading-[1.9] tracking-[0.04em] text-brand-charcoal/70 marker:text-brand-charcoal/25">
                      <li>
                        <span className="font-normal text-brand-charcoal/80">渗透性：</span>
                        可以透过皮肤角质层和毛细血管间隙，更有效地渗透到肌肤内部。
                      </li>
                      <li>
                        <span className="font-normal text-brand-charcoal/80">稳定分散：</span>
                        纳米乳液拥有稳定的结构，避免有效成分颗粒间的聚集及相互作用。
                      </li>
                      <li>
                        <span className="font-normal text-brand-charcoal/80">控释效应：</span>
                        脂质体技术可以实现活性成分的长效释放。由于它特殊的颗粒结构，能够控制活性成分的释放速率，从而延长有效成分在皮肤上的作用时间，提高溶解度和利用率。
                      </li>
                    </ul>
                  </div>
                  <div className="mt-6 flex flex-wrap items-center gap-4 sm:gap-6">
                    <div className="overflow-hidden rounded-xl border border-brand-charcoal/[0.06] bg-brand-beige/25">
                      <Image
                        src="/images/technology/liposome-macro.webp"
                        alt="脂质体包裹技术的微观结构"
                        width={960}
                        height={923}
                        sizes="(max-width: 640px) 150px, 200px"
                        className="h-[120px] w-auto object-cover sm:h-[180px]"
                        priority
                      />
                    </div>
                    <div className="overflow-hidden rounded-xl border border-brand-charcoal/[0.06] bg-brand-beige/25">
                      <Image
                        src="/images/technology/liposome-cell-diagram.webp"
                        alt="脂质体包裹活性物质进入细胞的过程示意"
                        width={715}
                        height={547}
                        sizes="(max-width: 640px) 190px, 260px"
                        className="h-[120px] w-auto object-cover sm:h-[180px]"
                      />
                    </div>
                    <div className="overflow-hidden rounded-xl border border-brand-charcoal/[0.06] bg-brand-beige/25">
                      <Image
                        src="/images/story/lab-research.webp"
                        alt="科研实验室场景"
                        width={1200}
                        height={670}
                        sizes="(max-width: 640px) 220px, 340px"
                        className="h-[120px] w-auto object-cover sm:h-[180px]"
                      />
                    </div>
                  </div>
                </header>

                {/* 正文区 */}
                <section className="mt-8">
                  <h2 className="text-[14px] font-normal tracking-[0.08em] text-brand-charcoal">
                    专利保护
                  </h2>
                  <p className="mt-3 text-[14px] font-light leading-[1.9] tracking-[0.04em] text-brand-charcoal/70">
                    NexStar 的脂质体技术已获多项国际专利保护。
                  </p>
                  <ul className="mt-4 list-disc space-y-2 text-pretty pl-4 text-[14px] font-light leading-[1.9] tracking-[0.04em] text-brand-charcoal/65 marker:text-brand-charcoal/25">
                    {patents.map((patent) => (
                      <li key={patent.id}>
                        <a
                          href={patent.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-num text-[13px] tracking-[0.04em] text-brand-primary/70 no-underline transition-colors hover:text-brand-primary hover:underline hover:underline-offset-2"
                        >
                          {patent.id}
                        </a>
                        <span className="ml-2">{patent.title}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              </article>
            </main>

            <footer className="w-full px-6 pb-2 pt-1.5 text-center sm:pb-3 sm:pt-2 lg:px-10 xl:px-[8%]">
              <span className="text-[11px] font-light tracking-[0.08em] text-brand-charcoal/[0.55] md:tracking-[0.15em]">
                &copy; {new Date().getFullYear()} NIHPLOD. All Rights Reserved.
              </span>
            </footer>
          </div>
        </div>
      </div>
    </DrawerPageContainer>
  );
}

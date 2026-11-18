"use client";

import Image from "next/image";
import { Link } from "next-view-transitions";
import { cn } from "@/lib/utils";
import { useLayout } from "@/contexts/LayoutContext";
import { DrawerPageContainer } from "@/components/ui/DrawerPageContainer";

const features = [
  {
    title: "渗透性",
    text: "透过角质层与毛细血管间隙，更有效渗透肌肤内部。",
  },
  {
    title: "稳定分散",
    text: "纳米乳液结构稳定，避免有效成分聚集与相互作用。",
  },
  {
    title: "控释效应",
    text: "控制活性成分释放速率，延长作用时间，提升利用率。",
  },
];

const stats = [
  {
    value: "90%",
    label: "高效吸收",
    text: "提升抗老因子吸收利用率。",
  },
  {
    value: "3天",
    label: "有效修护",
    text: "即时改善干燥泛红，修护屏障。",
  },
  {
    value: "28天",
    label: "深层改善",
    text: "延缓松弛、淡化细纹、提亮肤色。",
  },
];

const patents = [
  { id: "EP0272091", title: "含有两亲子体相关活性成分的给药工具" },
  { id: "AU1991091780", title: "制备含脂质体的药物的加载技术" },
  { id: "US5817334", title: "干燥时稳定性提高的脂质体的制造方法" },
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
        <div className="sticky top-0 z-50 flex h-[88px] shrink-0 items-center justify-center border-b border-transparent bg-brand-cream/95 px-6 backdrop-blur-sm sm:justify-start sm:border-brand-charcoal/5 sm:px-[8%]">
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
            <main className="w-full flex-1 px-6 pb-5 pt-5 sm:px-[8%] sm:pt-6">
              <article className="mx-auto w-full font-sans">
                <header className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_144px] sm:items-center">
                  <div>
                    <h1
                      tabIndex={-1}
                      className="text-[19px] font-normal tracking-[0.15em] text-brand-charcoal focus:outline-none sm:text-3xl sm:font-light sm:tracking-[0.08em]"
                    >
                      真脂质体技术
                    </h1>
                    <p className="mt-2.5 max-w-3xl text-[14px] font-light leading-[1.8] tracking-[0.08em] text-brand-charcoal/80">
                      NIHPLOD 旎柏携手 NexStar
                      联合实验室，将医药级脂质体技术引入护肤，以「靶向直达」+「精简护肤」的前沿理念，科学逆转时光。
                    </p>
                  </div>
                  <figure className="relative hidden aspect-square w-full overflow-hidden rounded-2xl border border-brand-charcoal/[0.06] bg-brand-beige/25 sm:block">
                    <Image
                      src="/images/technology/liposome-macro.webp"
                      alt="脂质体包裹技术的微观结构"
                      fill
                      sizes="144px"
                      className="object-cover"
                      priority
                    />
                  </figure>
                </header>

                <section
                  className="mt-4 border-t border-brand-charcoal/10 pt-4 sm:mt-5"
                  aria-label="技术特性"
                >
                  <ul className="grid gap-2.5 sm:grid-cols-3 sm:gap-6">
                    {features.map((feature) => (
                      <li
                        key={feature.title}
                        className="grid grid-cols-[80px_1fr] items-baseline gap-3 sm:block"
                      >
                        <p className="text-[15px] font-normal tracking-[0.12em] text-brand-charcoal">
                          {feature.title}
                        </p>
                        <p className="text-[14px] font-light leading-[1.8] tracking-[0.08em] text-brand-charcoal/80 sm:mt-2">
                          {feature.text}
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>

                <section
                  className="mt-4 border-t border-brand-charcoal/10 pt-4 sm:mt-5"
                  aria-label="护肤效果"
                >
                  <div className="grid grid-cols-3 gap-3 sm:gap-6">
                    {stats.map((item) => (
                      <div key={item.label}>
                        <p className="flex flex-wrap items-baseline gap-x-2.5">
                          <span className="font-num text-2xl font-light tracking-[0.02em] text-brand-charcoal sm:text-[28px]">
                            {item.value}
                          </span>
                          <span className="text-[14px] font-normal tracking-[0.12em] text-brand-charcoal/80">
                            {item.label}
                          </span>
                        </p>
                        <p className="mt-2 text-[14px] font-light leading-[1.8] tracking-[0.08em] text-brand-charcoal/80">
                          {item.text}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>

                <section
                  className="mt-4 border-t border-brand-charcoal/10 pt-4 sm:mt-5"
                  aria-label="专利保护"
                >
                  <p className="text-[14px] font-light leading-[1.8] tracking-[0.08em] text-brand-charcoal/80">
                    NexStar 的脂质体技术已获多项国际专利保护，并应用于 NIHPLOD{" "}
                    <Link
                      href="/products"
                      className="text-brand-primary underline decoration-brand-primary/40 underline-offset-2 transition-colors hover:decoration-brand-primary"
                    >
                      产品系列
                    </Link>
                    。
                  </p>
                  <ul className="mt-2.5 grid gap-2 sm:mt-3 sm:grid-cols-3 sm:gap-6">
                    {patents.map((patent) => (
                      <li key={patent.id} className="flex items-baseline gap-2.5">
                        <span className="shrink-0 font-num text-[11px] tracking-[0.04em] text-brand-primary/70">
                          {patent.id}
                        </span>
                        <span className="text-[14px] font-light leading-[1.8] tracking-[0.08em] text-brand-charcoal/80">
                          {patent.title}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-[12px] font-light tracking-[0.06em] text-brand-charcoal/50">
                    可在世界知识产权组织专利检索系统中查询，或查看{" "}
                    <Link
                      href="/faq"
                      className="text-brand-primary underline decoration-brand-primary/40 underline-offset-2 transition-colors hover:decoration-brand-primary"
                    >
                      常见问题
                    </Link>
                    。
                  </p>
                </section>
              </article>
            </main>

            <footer className="w-full px-6 pb-2 pt-1.5 text-center sm:px-[8%] sm:pb-3 sm:pt-2">
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

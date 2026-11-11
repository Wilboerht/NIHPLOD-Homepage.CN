"use client";

import Image from "next/image";
import { Link } from "next-view-transitions";
import { cn } from "@/lib/utils";
import { useLayout } from "@/contexts/LayoutContext";
import { DrawerPageContainer } from "@/components/ui/DrawerPageContainer";

const highlights = [
  {
    label: "核心科技",
    value: "脂质体 + 纳米乳液",
    description:
      "将「脂质体技术」与「纳米乳液技术」相结合，实现活性成分的稳定包裹与高效递送。",
  },
  {
    label: "核心优势",
    value: "90% 渗透率",
    description: "高达 90% 臻奢活性成分渗透率，直达肌肤根源，靶向修护。",
  },
  {
    label: "核心成分",
    value: "地中海海源动力",
    description:
      "海藻抗氧化 + 深海糖蛋白，活性达维 C 的 80 倍，肌肤逆转时光，凝注焕新。",
  },
];

const sourceFacts = [
  { term: "1990 年", text: "NexStar Pharmaceuticals 成立" },
  { term: "40 余年", text: "深耕脂质体技术" },
  { term: "世界五百强", text: "吉利德科学公司旗下" },
  { term: "首批", text: "将脂质体技术应用于护肤的公司之一" },
];

const features = [
  {
    title: "渗透性",
    text: "可以透过皮肤角质层和毛细血管间隙，更有效地渗透到肌肤内部。",
  },
  {
    title: "稳定分散",
    text: "纳米乳液拥有稳定的结构，避免有效成分颗粒间的聚集及相互作用。",
  },
  {
    title: "控释效应",
    text: "特殊的颗粒结构能够控制活性成分的释放速率，延长有效成分在皮肤上的作用时间，提高溶解度与利用率。",
  },
];

const stats = [
  {
    image: "/images/technology/liposome-absorb.webp",
    alt: "脂质体包裹活性成分渗透肌肤示意",
    value: "90%",
    label: "高效吸收",
    text: "脂质体包裹技术，大幅提高臻奢抗老因子的吸收利用率。",
  },
  {
    image: "/images/technology/liposome-repair.webp",
    alt: "纳米超微焕活粒子修护肌肤示意",
    value: "3天",
    label: "有效修护",
    text: "纳米超微焕活粒子深入肌肤，即时改善干燥与泛红，修护受损屏障。",
  },
  {
    image: "/images/technology/liposome-improve.webp",
    alt: "肌肤深层改善示意",
    value: "28天",
    label: "深层改善",
    text: "延缓肌肤松弛、淡化细纹，提亮暗沉肤色，重拾肌肤健康状态。",
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
          <main className="w-full px-6 pb-10 pt-8 sm:px-[8%] md:pt-12">
            <article className="font-sans">
              <header className="max-w-3xl">
                <p className="text-[12px] font-light tracking-[0.08em] text-brand-charcoal/50">
                  LIPOSOME TECHNOLOGY
                </p>
                <h1
                  tabIndex={-1}
                  className="mt-3 text-[20px] font-normal tracking-[0.05em] text-brand-charcoal focus:outline-none sm:text-[22px] lg:text-[28px]"
                >
                  真脂质体技术
                </h1>
                <p className="mt-3 max-w-2xl text-[14px] font-light leading-[1.8] tracking-[0.02em] text-brand-charcoal/70">
                  NIHPLOD 旎柏携手 NexStar 联合实验室，将医药级脂质体技术引入护肤，以「靶向直达」+「精简护肤」的前沿理念，科学逆转时光。
                </p>
              </header>

              <figure className="relative mt-8 aspect-[16/10] w-full overflow-hidden rounded-2xl border border-brand-charcoal/[0.06] bg-brand-beige/25 sm:aspect-[2.3/1]">
                <Image
                  src="/images/technology/liposome-macro.webp"
                  alt="脂质体包裹技术的微观结构"
                  fill
                  sizes="(max-width: 640px) 100vw, 84vw"
                  className="object-cover"
                />
              </figure>

              <section className="mt-10 md:mt-12">
                <div className="flex items-baseline gap-3">
                  <span className="font-num text-[12px] font-light tracking-[0.08em] text-brand-charcoal/40">
                    01
                  </span>
                  <h2 className="text-[16px] font-normal tracking-[0.04em] text-brand-charcoal lg:text-[18px]">
                    联合实验室
                  </h2>
                </div>
                <p className="mt-4 max-w-3xl text-[14px] font-light leading-[1.8] tracking-[0.02em] text-brand-charcoal/[0.85]">
                  NIHPLOD 旎柏与吉利德科学公司旗下 NexStar
                  联合实验室达成合作，以「尖端科技还原精简美学」，把医药级脂质体技术带入日常护肤。
                </p>
                <div className="mt-6 grid gap-4 md:grid-cols-3">
                  {highlights.map((item) => (
                    <div
                      key={item.label}
                      className="rounded-2xl border border-brand-charcoal/[0.06] bg-brand-warm-white p-5"
                    >
                      <p className="text-[12px] font-light tracking-[0.06em] text-brand-charcoal/50">
                        {item.label}
                      </p>
                      <p className="mt-2 text-[16px] font-normal tracking-[0.02em] text-brand-charcoal">
                        {item.value}
                      </p>
                      <p className="mt-2 text-[13px] font-light leading-[1.8] tracking-[0.02em] text-brand-charcoal/70">
                        {item.description}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="mt-12 grid gap-8 md:mt-16 lg:grid-cols-12 lg:items-start lg:gap-12 xl:gap-16">
                <div className="lg:col-span-7">
                  <div className="flex items-baseline gap-3">
                    <span className="font-num text-[12px] font-light tracking-[0.08em] text-brand-charcoal/40">
                      02
                    </span>
                    <h2 className="text-[16px] font-normal tracking-[0.04em] text-brand-charcoal lg:text-[18px]">
                      技术来源
                    </h2>
                  </div>
                  <div className="mt-4 space-y-3.5 text-[14px] font-light leading-[1.8] tracking-[0.02em] text-brand-charcoal/[0.85]">
                    <p>
                      医药界巨头、世界五百强 Gilead Sciences（吉利德科学公司）旗下
                      NexStar Pharmaceuticals，深耕脂质体技术 40
                      余年，是最早将脂质体技术应用于护肤领域的公司之一。
                    </p>
                    <p>
                      通过大量临床实验与调研，NexStar 将「脂质体技术」与「纳米乳液技术」相结合，实现「靶向直达」+「精简护肤」，让活性成分的递送更精准、更稳定。
                    </p>
                  </div>
                </div>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-5 rounded-2xl border border-brand-charcoal/[0.06] bg-brand-warm-white p-5 sm:p-6 lg:col-span-5">
                  {sourceFacts.map((fact) => (
                    <div key={fact.term}>
                      <dt className="font-num text-[16px] font-normal tracking-[0.02em] text-brand-charcoal">
                        {fact.term}
                      </dt>
                      <dd className="mt-1 text-[12px] font-light leading-[1.7] tracking-[0.02em] text-brand-charcoal/65">
                        {fact.text}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>

              <section className="mt-12 grid gap-7 md:mt-16 lg:grid-cols-12 lg:items-center lg:gap-12 xl:gap-16">
                <div className="lg:col-span-7">
                  <div className="flex items-baseline gap-3">
                    <span className="font-num text-[12px] font-light tracking-[0.08em] text-brand-charcoal/40">
                      03
                    </span>
                    <h2 className="text-[16px] font-normal tracking-[0.04em] text-brand-charcoal lg:text-[18px]">
                      脂质体技术
                    </h2>
                  </div>
                  <p className="mt-4 text-[14px] font-light leading-[1.8] tracking-[0.02em] text-brand-charcoal/[0.85]">
                    旎柏 NIHPLOD 通过与 NexStar Pharmaceuticals
                    的合作，引入先进的脂质体技术，将重要的活性成分包封于类脂质双分子层内，以微型囊泡的形式进入皮肤。脂质粒的结构近乎人体皮肤脂质构造，与表皮层的细胞间质非常相融，进而对肌肤进行靶向修护或提升，达到更高效、更理想的护肤效果。
                  </p>
                  <ul className="mt-5 space-y-3">
                    {features.map((feature) => (
                      <li
                        key={feature.title}
                        className="rounded-xl border border-brand-charcoal/[0.06] bg-brand-warm-white px-4 py-3"
                      >
                        <p className="text-[13px] font-normal tracking-[0.04em] text-brand-charcoal">
                          {feature.title}
                        </p>
                        <p className="mt-1 text-[13px] font-light leading-[1.8] tracking-[0.02em] text-brand-charcoal/70">
                          {feature.text}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="lg:col-span-5">
                  <figure className="relative aspect-[7/5] w-full overflow-hidden rounded-2xl border border-brand-charcoal/[0.06] bg-brand-beige/25">
                    <Image
                      src="/images/technology/liposome-cell-diagram.webp"
                      alt="脂质体包裹活性物质进入细胞的过程示意"
                      fill
                      sizes="(max-width: 1024px) 100vw, 40vw"
                      className="object-cover"
                    />
                  </figure>
                </div>
              </section>

              <section className="mt-12 md:mt-16">
                <div className="flex items-baseline gap-3">
                  <span className="font-num text-[12px] font-light tracking-[0.08em] text-brand-charcoal/40">
                    04
                  </span>
                  <h2 className="text-[16px] font-normal tracking-[0.04em] text-brand-charcoal lg:text-[18px]">
                    精简护肤
                  </h2>
                </div>
                <div className="mt-6 grid gap-4 md:grid-cols-3">
                  {stats.map((item) => (
                    <div
                      key={item.label}
                      className="overflow-hidden rounded-2xl border border-brand-charcoal/[0.06] bg-brand-warm-white"
                    >
                      <div className="relative aspect-square w-full bg-brand-beige/20">
                        <Image
                          src={item.image}
                          alt={item.alt}
                          fill
                          sizes="(max-width: 768px) 100vw, 30vw"
                          className="object-cover"
                        />
                      </div>
                      <div className="p-4 md:p-5">
                        <p className="flex items-baseline gap-2">
                          <span className="font-num text-[24px] font-medium tracking-[0.02em] text-brand-charcoal lg:text-[26px]">
                            {item.value}
                          </span>
                          <span className="text-[13px] font-normal tracking-[0.04em] text-brand-charcoal/80">
                            {item.label}
                          </span>
                        </p>
                        <p className="mt-2 text-[12px] font-light leading-[1.8] tracking-[0.02em] text-brand-charcoal/70">
                          {item.text}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="mt-12 grid gap-7 md:mt-16 lg:grid-cols-12 lg:items-center lg:gap-12 xl:gap-16">
                <div className="lg:order-2 lg:col-span-6">
                  <div className="flex items-baseline gap-3">
                    <span className="font-num text-[12px] font-light tracking-[0.08em] text-brand-charcoal/40">
                      05
                    </span>
                    <h2 className="text-[16px] font-normal tracking-[0.04em] text-brand-charcoal lg:text-[18px]">
                      脂质体专利报告
                    </h2>
                  </div>
                  <p className="mt-4 text-[14px] font-light leading-[1.8] tracking-[0.02em] text-brand-charcoal/[0.85]">
                    NexStar Pharmaceuticals
                    的脂质体相关技术已获得多项国际专利保护，涵盖活性成分的给药工具、脂质体药物的加载技术，以及干燥时稳定性提高的脂质体制备方法。
                  </p>
                  <ul className="mt-4 space-y-2.5">
                    {patents.map((patent) => (
                      <li
                        key={patent.id}
                        className="flex items-baseline gap-3 text-[13px] font-light leading-[1.7] tracking-[0.02em] text-brand-charcoal/75"
                      >
                        <span className="shrink-0 font-num text-[12px] tracking-[0.04em] text-brand-primary/70">
                          {patent.id}
                        </span>
                        <span>{patent.title}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-4 text-[12px] font-light tracking-[0.04em] text-brand-charcoal/50">
                    WIPO 国际专利查询 · Patentscope.wipo.int
                  </p>
                </div>
                <div className="lg:order-1 lg:col-span-6">
                  <figure className="relative aspect-[11/4] w-full overflow-hidden rounded-2xl border border-brand-charcoal/[0.06] bg-brand-beige/25">
                    <Image
                      src="/images/technology/liposome-patents.webp"
                      alt="WIPO 国际专利查询中的脂质体相关专利"
                      fill
                      sizes="(max-width: 1024px) 100vw, 52vw"
                      className="object-cover"
                    />
                  </figure>
                </div>
              </section>

              <div className="mt-12 rounded-2xl border border-brand-charcoal/[0.06] bg-brand-warm-white p-4 md:mt-14 md:p-5 lg:p-6">
                <p className="text-[14px] font-light leading-[1.8] tracking-[0.02em] text-brand-charcoal/[0.85]">
                  想亲自体验脂质体技术带来的护肤改变？前往{" "}
                  <Link
                    href="/products"
                    className="text-brand-primary underline decoration-brand-primary/40 underline-offset-2 transition-colors hover:decoration-brand-primary"
                  >
                    产品系列
                  </Link>
                  ，探索搭载真脂质体技术的 NIHPLOD 产品。
                </p>
              </div>
            </article>
          </main>

          <footer className="w-full px-6 pb-6 pt-5 text-center sm:px-[8%]">
            <span className="text-[11px] font-light tracking-[0.08em] text-brand-charcoal/[0.55] md:tracking-[0.15em]">
              &copy; {new Date().getFullYear()} NIHPLOD. All Rights Reserved.
            </span>
          </footer>
        </div>
      </div>
    </DrawerPageContainer>
  );
}

"use client";

import Image from "next/image";
import { Link } from "next-view-transitions";
import { cn } from "@/lib/utils";
import { useLayout } from "@/contexts/LayoutContext";
import { DrawerPageContainer } from "@/components/ui/DrawerPageContainer";

const sourceFacts = [
  { term: "1990 年", text: "NexStar 成立" },
  { term: "40 余年", text: "深耕脂质体技术" },
  { term: "世界五百强", text: "吉利德科学旗下" },
  { term: "业内首批", text: "应用于护肤领域" },
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
    value: "90%",
    label: "高效吸收",
    text: "脂质体包裹技术，大幅提高臻奢抗老因子的吸收利用率。",
  },
  {
    value: "3天",
    label: "有效修护",
    text: "纳米超微焕活粒子深入肌肤，即时改善干燥与泛红，修护受损屏障。",
  },
  {
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

function SectionHeading({ index, title }: { index: string; title: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="font-num text-[12px] font-light tracking-[0.08em] text-brand-charcoal/40">
        {index}
      </span>
      <h2 className="text-[16px] font-normal tracking-[0.04em] text-brand-charcoal lg:text-[18px]">
        {title}
      </h2>
    </div>
  );
}

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
            <article className="mx-auto max-w-4xl font-sans">
              <header className="grid gap-7 md:grid-cols-[minmax(0,1fr)_280px] md:items-center md:gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div>
                  <h1
                    tabIndex={-1}
                    className="text-[20px] font-normal tracking-[0.05em] text-brand-charcoal focus:outline-none sm:text-[22px] lg:text-[28px]"
                  >
                    真脂质体技术
                  </h1>
                  <p className="mt-3 max-w-2xl text-[14px] font-light leading-[1.8] tracking-[0.02em] text-brand-charcoal/70">
                    NIHPLOD 旎柏携手 NexStar
                    联合实验室，将医药级脂质体技术引入护肤，以「靶向直达」+「精简护肤」的前沿理念，科学逆转时光。
                  </p>
                </div>
                <figure className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-brand-charcoal/[0.06] bg-brand-beige/25 md:aspect-square">
                  <Image
                    src="/images/technology/liposome-macro.webp"
                    alt="脂质体包裹技术的微观结构"
                    fill
                    sizes="(max-width: 768px) 100vw, 320px"
                    className="object-cover"
                    priority
                  />
                </figure>
              </header>

              <section className="mt-10 border-t border-brand-charcoal/10 pt-8 md:mt-12 md:pt-10">
                <SectionHeading index="01" title="技术来源" />
                <div className="mt-4 max-w-3xl space-y-3.5 text-[14px] font-light leading-[1.8] tracking-[0.02em] text-brand-charcoal/[0.85]">
                  <p>
                    1990 年，NexStar 制药成立，后成为世界五百强吉利德科学公司旗下企业。40
                    余年来，NexStar 深耕脂质体技术，是最早将其应用于护肤领域的公司之一。
                  </p>
                  <p>
                    NIHPLOD 旎柏与 NexStar
                    联合实验室合作，将「脂质体技术」与「纳米乳液技术」相结合，实现「靶向直达」+「精简护肤」，让活性成分的递送更精准、更稳定。
                  </p>
                </div>
                <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-brand-charcoal/[0.06] pt-5 sm:grid-cols-4">
                  {sourceFacts.map((fact) => (
                    <div key={fact.term}>
                      <dt className="font-num text-[15px] font-normal tracking-[0.02em] text-brand-charcoal">
                        {fact.term}
                      </dt>
                      <dd className="mt-1 text-[12px] font-light leading-[1.7] tracking-[0.02em] text-brand-charcoal/65">
                        {fact.text}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>

              <section className="mt-10 border-t border-brand-charcoal/10 pt-8 md:mt-12 md:pt-10">
                <SectionHeading index="02" title="脂质体技术" />
                <p className="mt-4 max-w-3xl text-[14px] font-light leading-[1.8] tracking-[0.02em] text-brand-charcoal/[0.85]">
                  旎柏与 NexStar
                  合作，引入先进的脂质体技术，将重要活性成分包封于类脂质双分子层内，以微型囊泡的形式进入皮肤。脂质体的结构近乎人体皮肤脂质构造，与表皮层细胞间质高度相融，从而对肌肤进行靶向修护，达到更高效、更理想的护肤效果。
                </p>
                <ul className="mt-6 grid gap-5 sm:grid-cols-3 sm:gap-6">
                  {features.map((feature) => (
                    <li key={feature.title} className="border-t border-brand-charcoal/15 pt-3">
                      <p className="text-[13px] font-normal tracking-[0.04em] text-brand-charcoal">
                        {feature.title}
                      </p>
                      <p className="mt-1.5 text-[13px] font-light leading-[1.8] tracking-[0.02em] text-brand-charcoal/70">
                        {feature.text}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="mt-10 border-t border-brand-charcoal/10 pt-8 md:mt-12 md:pt-10">
                <SectionHeading index="03" title="精简护肤" />
                <div className="mt-6 grid gap-6 sm:grid-cols-3 sm:gap-8">
                  {stats.map((item) => (
                    <div key={item.label}>
                      <p className="flex items-baseline gap-2">
                        <span className="font-num text-[26px] font-medium tracking-[0.02em] text-brand-charcoal lg:text-[28px]">
                          {item.value}
                        </span>
                        <span className="text-[13px] font-normal tracking-[0.04em] text-brand-charcoal/80">
                          {item.label}
                        </span>
                      </p>
                      <p className="mt-2 text-[13px] font-light leading-[1.8] tracking-[0.02em] text-brand-charcoal/70">
                        {item.text}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="mt-10 border-t border-brand-charcoal/10 pt-8 md:mt-12 md:pt-10">
                <SectionHeading index="04" title="脂质体专利" />
                <p className="mt-4 max-w-3xl text-[14px] font-light leading-[1.8] tracking-[0.02em] text-brand-charcoal/[0.85]">
                  NexStar 的脂质体相关技术已获得多项国际专利保护。
                </p>
                <ul className="mt-5 divide-y divide-brand-charcoal/[0.06] border-y border-brand-charcoal/[0.06]">
                  {patents.map((patent) => (
                    <li
                      key={patent.id}
                      className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:gap-4"
                    >
                      <span className="shrink-0 font-num text-[12px] tracking-[0.04em] text-brand-primary/70 sm:w-[132px]">
                        {patent.id}
                      </span>
                      <span className="text-[13px] font-light leading-[1.7] tracking-[0.02em] text-brand-charcoal/75">
                        {patent.title}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-[12px] font-light tracking-[0.04em] text-brand-charcoal/50">
                  专利信息可在世界知识产权组织专利检索系统中查询。
                </p>
              </section>

              <section className="mt-10 border-t border-brand-charcoal/10 pt-8 md:mt-12 md:pt-10">
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
              </section>
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

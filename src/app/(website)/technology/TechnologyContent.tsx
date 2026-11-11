import Link from "next/link";
import { StandaloneNav } from "@/components/ui/StandaloneNav";

const sections = [
  {
    title: "什么是脂质体",
    paragraphs: [
      "脂质体（Liposome）是一种由磷脂双分子层构成的微小囊泡，其结构与人体细胞膜高度相似。这种独特的结构使其既能包裹水溶性活性成分，也能加载脂溶性活性成分，是现代护肤科学中重要的活性成分封装与载体技术。",
      "简单来说，脂质体就像一个「微型保护舱」：将脆弱、易失活的护肤活性成分妥善封装，在合适的时机与位置将其释放，让成分的价值真正作用于肌肤。",
    ],
  },
  {
    title: "为什么活性成分需要被保护",
    paragraphs: [
      "随着现代科学技术的不断发展，越来越多的活性成分被应用于化妆品领域。然而，这些有效成分是否真的能被皮肤吸收，而不在到达肌肤之前就被氧化、分解或产生不良反应，是每一位认真护肤的消费者都值得关心的问题。",
      "脂质体包裹技术正是对这一问题的回应：通过隔绝外界环境对活性成分的直接影响，帮助维持成分的稳定性与活性，并借助与细胞膜相似的结构，提升成分与肌肤的亲和度。",
    ],
  },
  {
    title: "Dolphin-Skin 真脂质体专利技术",
    paragraphs: [
      "NIHPLOD 旎柏以真脂质体专利技术（Dolphin-Skin）为核心，将重要的活性成分和生长因子封装于脂质体囊泡之中，通过保护及加载产品中的有效及活性成分，使其能够靶向性地在皮肤表皮及真皮层进行有效释放，从而更有效地达到理想的护肤效果。",
      "这一技术贯穿于 NIHPLOD 的主要产品之中，是品牌「简单，从不妥协」产品理念的科学基础：用前沿科技减少护肤步骤中的不确定性，让每一次使用都更值得期待。",
    ],
  },
];

export function TechnologyContent() {
  return (
    <div className="flex min-h-dvh animate-fade-in flex-col bg-[#fefcf8] pt-[100px] md:pt-32">
      <StandaloneNav title="核心技术" />

      <main className="flex-1 px-6 md:px-10">
        <article className="mx-auto w-full max-w-3xl font-sans text-brand-charcoal/80">
          <header className="space-y-4 border-b border-brand-beige pb-6">
            <p className="text-xs font-light tracking-[0.2em] text-brand-charcoal/50">
              LIPOSOME TECHNOLOGY
            </p>
            <h1 className="text-3xl font-light leading-tight tracking-[0.01em] text-brand-charcoal sm:text-4xl">
              真脂质体技术
            </h1>
            <p className="text-[15px] font-light leading-7 text-brand-charcoal/70">
              以 Dolphin-Skin 真脂质体专利技术为核心，让活性成分被妥善保护、靶向释放，让护肤更科学、更高效。
            </p>
          </header>

          <div className="mt-10 space-y-10 md:mt-12 md:space-y-12">
            {sections.map((section) => (
              <section key={section.title}>
                <h2 className="mb-4 font-sans text-[19px] font-light tracking-[0.04em] text-brand-charcoal md:mb-5 md:text-2xl md:tracking-[0.03em]">
                  {section.title}
                </h2>
                <div className="space-y-4 text-[15px] font-light leading-[1.8] text-brand-charcoal/90 md:text-base">
                  {section.paragraphs.map((paragraph) => (
                    <p key={paragraph.slice(0, 20)}>{paragraph}</p>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <div className="mt-12 rounded-xl border border-brand-charcoal/10 bg-brand-charcoal/[0.03] p-5 md:p-6">
            <p className="text-[15px] font-light leading-relaxed text-brand-charcoal/80">
              想亲自体验脂质体技术带来的护肤改变？前往{" "}
              <Link
                href="/products"
                className="text-brand-charcoal underline decoration-brand-charcoal/30 underline-offset-4 transition-colors hover:decoration-brand-charcoal/70"
              >
                产品系列
              </Link>
              ，探索搭载真脂质体技术的 NIHPLOD 产品。
            </p>
          </div>
        </article>
      </main>

      <footer className="mt-12 md:mt-24 md:border-t md:border-brand-charcoal/10">
        <div className="container mx-auto px-6 py-6 text-center md:px-8 md:py-10">
          <p className="text-xs font-light tracking-[0.08em] text-brand-charcoal/70 md:tracking-[0.12em]">
            &copy; {new Date().getFullYear()} 旎柏（上海）商贸有限公司 版权所有
          </p>
        </div>
      </footer>
    </div>
  );
}

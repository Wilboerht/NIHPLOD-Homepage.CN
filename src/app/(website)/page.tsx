"use client";

import { m } from "framer-motion";
import {
  fadeInUp,
  staggerContainer,
  defaultTransition,
  hoverScale,
  tapScale,
} from "@/lib/animations";

export default function Home() {
  return (
    <section className="flex min-h-[80vh] flex-col items-center justify-center bg-brand-cream">
      <m.div
        className="space-y-m text-center"
        variants={staggerContainer}
        initial="initial"
        animate="animate"
      >
        {/* 品牌标题 - 使用 serif 字体 */}
        <m.h1
          className="font-serif text-brand-charcoal"
          variants={fadeInUp}
          transition={defaultTransition}
        >
          NIHPLOD
        </m.h1>
        <m.p
          className="text-lg uppercase tracking-widest text-brand-charcoal/70"
          variants={fadeInUp}
          transition={defaultTransition}
        >
          高端婚礼花艺定制
        </m.p>

        {/* 分隔线 */}
        <m.div
          className="mx-auto my-l h-px w-24 bg-brand-gold"
          variants={fadeInUp}
          transition={defaultTransition}
        />

        {/* 品牌色展示 */}
        <m.div
          className="mt-l flex justify-center gap-s"
          variants={fadeInUp}
          transition={defaultTransition}
        >
          {[
            { color: "bg-brand-gold", name: "Gold" },
            {
              color: "bg-brand-cream border border-brand-beige",
              name: "Cream",
            },
            { color: "bg-brand-charcoal", name: "Charcoal" },
            { color: "bg-brand-blush", name: "Blush" },
            { color: "bg-brand-beige", name: "Beige" },
          ].map((item) => (
            <m.div
              key={item.name}
              className="flex cursor-pointer flex-col items-center"
              whileHover={hoverScale}
              whileTap={tapScale}
            >
              <div className={`h-16 w-16 ${item.color} rounded`} />
              <span className="mt-2 text-xs text-brand-charcoal/60">{item.name}</span>
            </m.div>
          ))}
        </m.div>

        {/* 按钮样式展示 */}
        <m.div
          className="mt-l flex justify-center gap-m"
          variants={fadeInUp}
          transition={defaultTransition}
        >
          <m.button className="btn-primary" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            主要按钮
          </m.button>
          <m.button className="btn-outline" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            轮廓按钮
          </m.button>
        </m.div>

        {/* 配置验证提示 */}
        <m.p
          className="mt-xl text-sm text-brand-charcoal/50"
          variants={fadeInUp}
          transition={{ ...defaultTransition, delay: 0.3 }}
        >
          ✓ 品牌设计系统 + 动画系统配置完成
        </m.p>
      </m.div>
    </section>
  );
}

"use client";

import { m } from "framer-motion";
import Image from "next/image";
import { Sparkles, Leaf, Globe, Heart } from "lucide-react";
import { FloatingCardLayout } from "@/components/website";
import { fadeInUp, defaultTransition } from "@/lib/animations";

// 品牌理念
const philosophies = [
  {
    icon: Sparkles,
    title: "极致追求",
    titleEn: "EXCELLENCE",
    description: "对每一个配方、每一道工序的严苛把控，只为呈现最完美的护肤体验",
  },
  {
    icon: Leaf,
    title: "自然之力",
    titleEn: "NATURE",
    description: "甄选全球珍稀植物精粹，以自然的力量唤醒肌肤本真之美",
  },
  {
    icon: Globe,
    title: "东西融合",
    titleEn: "FUSION",
    description: "源自摩纳哥的奢华基因，融入东方护肤智慧，创造独特的护肤哲学",
  },
  {
    icon: Heart,
    title: "仪式感",
    titleEn: "RITUAL",
    description: "每一次护肤都是与自己对话的珍贵时光，值得被温柔以待",
  },
];

// 品牌时间线
const timeline = [
  {
    year: "2018",
    title: "品牌诞生",
    description: "在摩纳哥的一间实验室里，NIHPLOD 旎柏正式创立，怀揣着对高端护肤的极致追求。",
  },
  {
    year: "2019",
    title: "首款产品",
    description: "历经数百次配方调整，第一款明星产品「焕活精华」问世，获得业内专家高度评价。",
  },
  {
    year: "2020",
    title: "进入中国",
    description: "NIHPLOD 旎柏正式进入中国市场，在上海设立亚太区总部，开启东方之旅。",
  },
  {
    year: "2022",
    title: "产品系列",
    description: "完成全系列护肤产品线布局，涵盖洁面、精华、面霜、防晒等核心品类。",
  },
  {
    year: "2024",
    title: "数字化升级",
    description: "推出 AI 护肤顾问服务，以科技赋能个性化护肤体验，开创智能护肤新时代。",
  },
];

// 品牌故事段落
const storyParagraphs = [
  {
    title: "起源",
    content:
      "NIHPLOD 旎柏，诞生于地中海畔的摩纳哥。这片被阳光眷顾的土地，孕育了无数关于美的传说。我们的创始人深受这里优雅生活方式的启发，立志创造一个能够传递纯粹美学理念的护肤品牌。",
  },
  {
    title: "理念",
    content:
      "我们相信，真正的美源于内心的平静与肌肤的健康。NIHPLOD 旎柏不仅仅是一个护肤品牌，更是一种生活态度的诠释。每一款产品都承载着我们对品质的执着追求，以及对使用者的深切关怀。",
  },
  {
    title: "承诺",
    content:
      "我们承诺只使用最优质的原料，坚持可持续发展理念，拒绝任何可能伤害肌肤或环境的成分。每一瓶 NIHPLOD 旎柏产品，都是我们对美好生活的诚挚献礼。",
  },
];

/**
 * 品牌故事页面内容组件
 */
export function StoryContent() {
  return (
    <FloatingCardLayout
      backgroundImage="/images/story-bg.jpg"
      backgroundAlt="品牌故事"
      initialState="expanded"
      pageTitle="品牌故事"
    >
      {/* 页面标题 */}
      <m.div
        className="mb-8 text-center"
        variants={fadeInUp}
        initial="initial"
        animate="animate"
        transition={defaultTransition}
      >
        <p className="text-xs uppercase tracking-widest text-brand-gold">
          OUR STORY
        </p>
        <h1 className="mt-1 font-serif text-2xl text-brand-charcoal md:text-3xl">
          品牌故事
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-brand-charcoal/70">
          源自摩纳哥的高端护肤品牌，将地中海的优雅与东方的智慧完美融合，
          <br className="hidden md:block" />
          为每一位追求卓越的你，带来非凡的护肤体验。
        </p>
      </m.div>

      {/* 品牌 Logo 展示 */}
      <m.div
        className="mb-10 flex justify-center"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <div className="relative h-24 w-48">
          <Image
            src="/images/logo.png"
            alt="NIHPLOD Logo"
            fill
            className="object-contain"
          />
        </div>
      </m.div>

      {/* 品牌故事段落 */}
      <div className="mb-10 space-y-6">
        {storyParagraphs.map((para, index) => (
          <m.div
            key={para.title}
            className="rounded-xl border border-brand-beige bg-white p-5"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 + index * 0.1 }}
          >
            <h2 className="mb-2 font-serif text-lg text-brand-gold">
              {para.title}
            </h2>
            <p className="text-sm leading-relaxed text-brand-charcoal/80">
              {para.content}
            </p>
          </m.div>
        ))}
      </div>

      {/* 品牌理念 */}
      <m.div
        className="mb-10"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.4 }}
      >
        <h2 className="mb-6 text-center font-serif text-xl text-brand-charcoal">
          品牌理念
        </h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {philosophies.map((item, index) => (
            <m.div
              key={item.title}
              className="rounded-xl border border-brand-beige bg-white p-4 text-center"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.5 + index * 0.1 }}
            >
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-gold/10">
                <item.icon className="h-6 w-6 text-brand-gold" />
              </div>
              <h3 className="font-serif text-base text-brand-charcoal">
                {item.title}
              </h3>
              <p className="text-xs uppercase tracking-wider text-brand-gold">
                {item.titleEn}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-brand-charcoal/60">
                {item.description}
              </p>
            </m.div>
          ))}
        </div>
      </m.div>

      {/* 品牌时间线 */}
      <m.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.6 }}
      >
        <h2 className="mb-6 text-center font-serif text-xl text-brand-charcoal">
          发展历程
        </h2>
        <div className="relative">
          {/* 时间线中轴 */}
          <div className="absolute left-5 top-0 h-full w-0.5 bg-brand-beige md:left-1/2 md:-translate-x-1/2" />

          {/* 时间点 */}
          <div className="space-y-6">
            {timeline.map((item, index) => (
              <m.div
                key={item.year}
                className="relative pl-14 md:pl-0"
                initial={{ opacity: 0, x: index % 2 === 0 ? -20 : 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.7 + index * 0.1 }}
              >
                {/* 时间点标记 - 确保足够大的触摸区域 */}
                <div className="absolute left-2.5 top-1 h-6 w-6 rounded-full border-2 border-brand-gold bg-white md:left-1/2 md:-translate-x-1/2" />

                {/* 内容卡片 */}
                <div
                  className={`rounded-xl border border-brand-beige bg-white p-4 md:w-5/12 ${
                    index % 2 === 0 ? "md:mr-auto md:pr-8" : "md:ml-auto md:pl-8"
                  }`}
                >
                  <span className="font-serif text-lg text-brand-gold">
                    {item.year}
                  </span>
                  <h3 className="mt-1 font-medium text-brand-charcoal">
                    {item.title}
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-brand-charcoal/70">
                    {item.description}
                  </p>
                </div>
              </m.div>
            ))}
          </div>
        </div>
      </m.div>

      {/* 底部间距 */}
      <div className="h-20" />
    </FloatingCardLayout>
  );
}


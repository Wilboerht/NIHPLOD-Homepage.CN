"use client";

import { Link } from "next-view-transitions";
import Image from "next/image";
import { m } from "framer-motion";
import { Sparkles, Package, ChevronRight } from "lucide-react";
import type { HomePageContent } from "@/types/page-content";

/**
 * 网格背景色值 - 2行4列 布局
 */
const gridColors = [
  ["#F5F3EA", "#F9F5E7", "#EAE8DF", "#E9E5D5"], // 上面一行
  ["#E2E0D7", "#EBE8DB", "#DDD9CE", "#D8D5CA"], // 下面一行
];

// 默认底部导航链接
const defaultFooterLinks = [
  { text: "关于旎柏", href: "/story" },
  { text: "护肤仪式", href: "/ritual" },
  { text: "联系我们", href: "/contact" },
  { text: "加入我们", href: "/careers" },
  { text: "隐私政策", href: "/privacy" },
  { text: "服务入口", href: "/services" },
];

// 默认内容
const defaultContent: HomePageContent = {
  brand: { chineseName: "旎柏", slogan: "逆转时光" },
  buttons: {
    advisorText: "AI 护肤顾问",
    advisorLink: "/advisor",
    productsText: "探索产品",
    productsLink: "/products",
  },
  footerLinks: defaultFooterLinks,
  copyright: "NIHPLOD All Rights Reserved.",
};

interface HomeClientProps {
  content?: HomePageContent;
}

/**
 * 首页客户端组件 - 网格色块背景布局
 */
export default function HomeClient({ content }: HomeClientProps) {
  // 合并默认内容和传入内容
  const brand = content?.brand || defaultContent.brand;
  const buttons = content?.buttons || defaultContent.buttons;
  const footerLinks = content?.footerLinks || defaultFooterLinks;
  const copyright = content?.copyright || defaultContent.copyright;

  return (
    <div className="fixed inset-0 flex flex-col">
      {/* 顶部线段 */}
      <div className="absolute left-0 right-0 top-0 z-20 h-2 bg-[#F0EDE1] sm:h-2.5 md:h-3 lg:h-4" />

      {/* 底部线段 */}
      <div className="absolute bottom-0 left-0 right-0 z-20 h-2 bg-[#F0EDE1] sm:h-2.5 md:h-3 lg:h-4" />

      {/* 网格色块背景：移动端 4行2列，PC端 2行4列 */}
      <div className="absolute inset-0 grid grid-cols-2 grid-rows-4 sm:grid-cols-4 sm:grid-rows-2">
        {gridColors.flat().map((color, index) => (
          <m.div
            key={index}
            className="h-full w-full"
            style={{ backgroundColor: color }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: index * 0.05 }}
          />
        ))}
      </div>

      {/* 主内容 - 居中 */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 pt-8 sm:px-6 sm:pt-12 md:pt-16">
        {/* Logo */}
        <m.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <Image
            src="/images/logo.png"
            alt="NIHPLOD"
            width={320}
            height={100}
            className="h-12 w-auto sm:h-16 md:h-20 lg:h-24 xl:h-28"
            priority
          />
        </m.div>

        {/* 中文名 */}
        <m.p
          className="mt-2 font-serif text-xl text-brand-gold sm:mt-3 sm:text-2xl md:mt-4 md:text-3xl lg:text-4xl"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          {brand.chineseName}
        </m.p>

        {/* 品牌语 */}
        <m.p
          className="mt-3 text-xs tracking-[0.2em] text-brand-charcoal/60 sm:mt-4 sm:text-sm sm:tracking-[0.3em] md:mt-5 md:text-base lg:text-lg"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          {brand.slogan}
        </m.p>

        {/* 分隔线 */}
        <m.div
          className="my-6 h-px w-10 bg-brand-gold/40 sm:my-8 sm:w-12 md:my-10"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        />

        {/* 双入口 - 垂直排列 */}
        <m.div
          className="flex flex-col items-center gap-5 sm:gap-6"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
        >
          {/* 产品浏览 - 金色主按钮 */}
          <Link href={buttons.productsLink} className="group">
            <m.div
              className="relative"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {/* 按钮主体 */}
              <div className="relative overflow-hidden rounded-full border border-brand-gold/30 bg-white/90 px-8 py-3.5 shadow-sm backdrop-blur-sm transition-all duration-300 group-hover:border-brand-gold group-hover:shadow-md sm:px-10 sm:py-4">
                <div className="relative z-10 flex items-center justify-center gap-2.5">
                  <Package className="h-4 w-4 text-brand-gold transition-colors duration-300 sm:h-5 sm:w-5" />
                  <span className="text-sm font-medium tracking-wide text-brand-charcoal/80 transition-colors duration-300 group-hover:text-brand-charcoal sm:text-base">
                    {buttons.productsText}
                  </span>
                  <ChevronRight className="h-4 w-4 text-brand-gold/60 transition-all duration-300 group-hover:translate-x-0.5 group-hover:text-brand-gold sm:h-5 sm:w-5" />
                </div>
              </div>
            </m.div>
          </Link>

          {/* AI 顾问 - 深蓝按钮 */}
          <Link href={buttons.advisorLink} className="group">
            <m.div
              className="relative"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <div className="relative overflow-hidden rounded-full bg-brand-blue px-8 py-3.5 shadow-sm transition-all duration-300 group-hover:shadow-md sm:px-10 sm:py-4">
                {/* 光泽效果 */}
                <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent" />
                <div className="relative z-10 flex items-center justify-center gap-2.5">
                  <Sparkles className="h-4 w-4 text-white/90 sm:h-5 sm:w-5" />
                  <span className="text-sm font-medium tracking-wide text-white sm:text-base">
                    {buttons.advisorText}
                  </span>
                </div>
              </div>
            </m.div>
          </Link>
        </m.div>

      </div>

      {/* 底部导航 */}
      <m.footer
        className="relative z-10 pb-4 pt-3 text-center sm:pb-6 sm:pt-4 md:pb-8"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.6 }}
      >
        <nav className="flex flex-wrap justify-center gap-3 text-[10px] text-brand-charcoal/50 sm:gap-4 sm:text-xs md:gap-6">
          {footerLinks.map((link, index) => (
            <Link
              key={index}
              href={link.href}
              className="transition-colors hover:text-brand-gold"
            >
              {link.text}
            </Link>
          ))}
        </nav>
        <p className="mt-3 text-[9px] text-brand-charcoal/25 sm:mt-4 sm:text-[10px]">
          © {new Date().getFullYear()} {copyright}
        </p>
      </m.footer>
    </div>
  );
}


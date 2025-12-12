"use client";

import { useState } from "react";
import { Link } from "next-view-transitions";
import Image from "next/image";
import { m, AnimatePresence } from "framer-motion";
import { Sparkles, Star, Heart, Sparkle, Diamond } from "lucide-react";
import type { HomePageContent } from "@/types/page-content";

/**
 * 护肤品图标 SVG 组件
 */
const ProductIcons = {
  // 面霜
  FaceCream: ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M4.71235 5.27496C5.84896 5.14222 8.00007 5 12 5C15.9999 5 18.151 5.14222 19.2876 5.27496C20.0401 5.36283 20.5 5.97852 20.5 6.73607V18C20.5 18.8284 19.8284 19.5 19 19.5H5C4.17157 19.5 3.5 18.8284 3.5 18V6.73607C3.5 5.97852 3.95992 5.36283 4.71235 5.27496Z" fill="currentColor" stroke="currentColor" strokeWidth="0.8"/>
    </svg>
  ),
  // 精华乳
  Essence: ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M9.84189 8.38604L10.8768 8.04105C10.9584 8.01386 11.0438 8 11.1298 8H12.8702C12.9562 8 13.0416 8.01386 13.1232 8.04105L14.1581 8.38604C14.3623 8.4541 14.5 8.64516 14.5 8.86038V21.2C14.5 21.6418 14.1418 22 13.7 22H10.3C9.85817 22 9.5 21.6418 9.5 21.2V8.86038C9.5 8.64516 9.63772 8.4541 9.84189 8.38604Z" fill="currentColor" stroke="currentColor" strokeWidth="0.8"/>
      <path d="M10.25 2.27892C10.25 2.0789 10.3703 1.90047 10.5645 1.85252C10.8494 1.78218 11.3279 1.69922 12 1.69922C12.6721 1.69922 13.1506 1.78218 13.4355 1.85252C13.6297 1.90047 13.75 2.0789 13.75 2.27892V7.44922C13.75 7.72536 13.5263 7.94922 13.2501 7.94922H10.7499C10.4737 7.94922 10.25 7.72536 10.25 7.44922V2.27892Z" fill="currentColor" stroke="currentColor" strokeWidth="0.7"/>
    </svg>
  ),
  // 防晒
  Sunscreen: ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="4.4" y="2.1" width="15.06" height="19.92" rx="7.2" fill="currentColor"/>
      <path d="M11.875 2C6.5 2 5.296 5.317 4.875 7C4.454 8.683 4.445 15.28 4.875 17C5.305 18.72 6.5 22 11.875 22" stroke="currentColor" strokeWidth="0.8"/>
      <path d="M12 2C17.375 2 18.579 5.317 19 7C19.421 8.683 19.43 15.28 19 17C18.57 18.72 17.375 22 12 22" stroke="currentColor" strokeWidth="0.8"/>
    </svg>
  ),
  // 面膜
  Mask: ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M5.5 3.5C5.5 2.94772 5.94772 2.5 6.5 2.5H17.5C18.0523 2.5 18.5 2.94772 18.5 3.5V20.5C18.5 21.0523 18.0523 21.5 17.5 21.5H6.5C5.94772 21.5 5.5 21.0523 5.5 20.5V3.5Z" fill="currentColor" stroke="currentColor" strokeWidth="0.8"/>
      <path d="M7 4.4C7 4.17909 7.17909 4 7.4 4H16.6C16.8209 4 17 4.17909 17 4.4V19.1C17 19.3209 16.8209 19.5 16.6 19.5H7.4C7.17909 19.5 7 19.3209 7 19.1V4.4Z" fill="currentColor" stroke="currentColor" strokeWidth="0.6"/>
    </svg>
  ),
  // 护理油
  Oil: ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M7.97144 11.9934C7.97144 11.782 8.04988 11.5782 8.23354 11.4734C8.65975 11.2302 9.69906 10.8438 12 10.8438C14.3009 10.8438 15.3402 11.2302 15.7664 11.4734C15.9501 11.5782 16.0285 11.782 16.0285 11.9934V20.3331C16.0285 20.8399 15.6176 21.2508 15.1108 21.2508H8.88917C8.38232 21.2508 7.97144 20.8399 7.97144 20.3331V11.9934Z" fill="currentColor" stroke="currentColor" strokeWidth="0.8"/>
      <path d="M10.5963 3.09543C10.8518 2.96797 11.4246 2.77734 11.9973 2.77734L12 10.8167H9.76721V10.0182L9.84981 9.85305C9.8479 8.27661 9.8452 5.26204 9.84891 4.63549C9.84929 4.57273 9.87044 4.51166 9.91704 4.46962C10.0556 4.3446 10.2531 4.26463 10.483 4.23654V3.29505C10.483 3.21142 10.5215 3.13277 10.5963 3.09543Z" fill="currentColor" stroke="currentColor" strokeWidth="0.8"/>
      <path d="M13.4037 3.09543C13.1482 2.96797 12.5754 2.77734 12.0027 2.77734L12 10.8167H14.2328V10.0182L14.1502 9.85305C14.1521 8.27661 14.1548 5.26204 14.1511 4.63549C14.1507 4.57273 14.1296 4.51166 14.083 4.46962C13.9444 4.3446 13.7469 4.26463 13.517 4.23654V3.29505C13.517 3.21142 13.4785 3.13277 13.4037 3.09543Z" fill="currentColor" stroke="currentColor" strokeWidth="0.8"/>
    </svg>
  ),
};

/**
 * 烟花图标配置 - 护肤品图标 + 装饰图标
 */
const fireworkIconList: React.ComponentType<{ className?: string }>[] = [
  // 护肤品图标 (权重更高)
  ProductIcons.FaceCream,
  ProductIcons.FaceCream,
  ProductIcons.Essence,
  ProductIcons.Essence,
  ProductIcons.Mask,
  ProductIcons.Sunscreen,
  ProductIcons.Oil,
  // 装饰图标
  Star,
  Heart,
  Sparkle,
  Diamond,
];

// 金色系颜色
const fireworkColors = [
  "text-brand-gold",
  "text-brand-gold/90",
  "text-amber-500",
  "text-yellow-500",
  "text-orange-400/80",
];

// 粒子ID计数器
let particleIdCounter = 0;

/**
 * 生成随机烟花粒子 - 向四周发射
 */
function generateFireworkParticles(count: number) {
  return Array.from({ length: count }, () => {
    // 随机角度 0-360度
    const angle = Math.random() * 360;
    const radian = (angle * Math.PI) / 180;
    // 多层距离：近(40-70)、中(70-100)、远(100-130)
    const layer = Math.random();
    const distance = layer < 0.3 ? 40 + Math.random() * 30
                   : layer < 0.7 ? 70 + Math.random() * 30
                   : 100 + Math.random() * 30;
    return {
      id: `particle-${++particleIdCounter}`, // 唯一ID
      Icon: fireworkIconList[Math.floor(Math.random() * fireworkIconList.length)],
      targetX: Math.cos(radian) * distance,
      targetY: Math.sin(radian) * distance,
      delay: Math.random() * 0.12,
      duration: 0.5 + Math.random() * 0.3,
      rotate: (Math.random() - 0.5) * 90,
      scale: 0.5 + Math.random() * 0.7,
      color: fireworkColors[Math.floor(Math.random() * fireworkColors.length)],
    };
  });
}

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
 * 产品按钮组件 - 带烟花效果
 */
function ProductButton({ href, text }: { href: string; text: string }) {
  const [isHovered, setIsHovered] = useState(false);
  const [particles, setParticles] = useState<ReturnType<typeof generateFireworkParticles>>([]);

  const handleMouseEnter = () => {
    setIsHovered(true);
    // 响应式粒子数量：移动端 10 个，桌面端 16 个
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
    const count = isMobile ? 10 : 16;
    setParticles(generateFireworkParticles(count));
  };

  return (
    <Link href={href} className="group">
      <div
        className="relative"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* 烟花图标容器 - 按钮周围，z-index 高于按钮 */}
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center overflow-visible">
          <AnimatePresence>
            {isHovered && particles.map(({ id, Icon, targetX, targetY, delay, duration, rotate, scale, color }) => (
              <m.div
                key={id}
                className="absolute"
                style={{ willChange: "transform, opacity" }}
                initial={{ x: 0, y: 0, opacity: 0, scale: 0, rotate: 0 }}
                animate={{
                  x: [0, targetX * 0.3, targetX, targetX],
                  y: [0, targetY * 0.3, targetY, targetY],
                  opacity: [0, 1, 0.8, 0],
                  scale: [0, scale * 1.2, scale, scale * 0.3],
                  rotate: [0, rotate * 0.3, rotate * 0.7, rotate],
                }}
                exit={{ opacity: 0, scale: 0, transition: { duration: 0.18, ease: "easeOut" } }}
                transition={{
                  duration: duration,
                  delay: delay,
                  ease: [0.25, 0.1, 0.25, 1],
                  times: [0, 0.2, 0.6, 1],
                }}
              >
                <Icon className={`h-3 w-3 sm:h-4 sm:w-4 ${color}`} />
              </m.div>
            ))}
          </AnimatePresence>
        </div>

        {/* 按钮主体 - z-index 高于烟花 */}
        <m.div
          className="relative z-10"
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
        >
          {/* 动态边框 - 旋转的渐变光晕 */}
          <div className="absolute -inset-[1px] overflow-hidden rounded-full">
            <m.div
              className="absolute inset-[-100%] bg-[conic-gradient(from_0deg,transparent_0deg,transparent_60deg,#c9a86c_120deg,#d4af37_180deg,#c9a86c_240deg,transparent_300deg,transparent_360deg)]"
              animate={{ rotate: 360 }}
              transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
            />
          </div>
          {/* 内部背景 */}
          <div className="relative rounded-full bg-[#EBE8DB] px-8 py-3 transition-all duration-300 group-hover:bg-[#E5E1D3] sm:px-10 sm:py-3.5">
            <div className="relative z-10 flex items-center justify-center gap-2">
              <span className="text-sm font-medium tracking-wider text-brand-charcoal/70 transition-colors duration-300 group-hover:text-brand-charcoal/90 sm:text-base">
                {text}
              </span>
            </div>
          </div>
        </m.div>
      </div>
    </Link>
  );
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
          {/* 产品浏览 - 金色主按钮（带烟花效果） */}
          <ProductButton href={buttons.productsLink} text={buttons.productsText} />

          {/* AI 顾问 - 透明背景金色边框按钮 */}
          <Link href={buttons.advisorLink} className="group">
            <m.div
              className="relative"
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
            >
              <div className="relative overflow-hidden rounded-full border border-brand-charcoal/20 bg-transparent px-8 py-3 transition-all duration-300 hover:border-brand-charcoal/40 hover:bg-brand-charcoal/5 sm:px-10 sm:py-3.5">
                <div className="relative z-10 flex items-center justify-center gap-2">
                  <Sparkles className="h-3.5 w-3.5 text-brand-gold/70 transition-colors duration-300 group-hover:text-brand-gold sm:h-4 sm:w-4" />
                  <span className="text-sm font-medium tracking-wider text-brand-charcoal/60 transition-colors duration-300 group-hover:text-brand-charcoal/80 sm:text-base">
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


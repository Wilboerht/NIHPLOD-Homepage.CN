"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import { m, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronLeft, ChevronRight, Menu, X, ShoppingBag } from "lucide-react";
import { ProductDrawer, ShopIcon, StoryIcon, RitualIcon, ContactIcon, HomeIcon } from "@/components/website";
import type { ProductData } from "@/components/website/ProductDrawer";
import { cn } from "@/lib/utils";

/**
 * 底部导航项配置
 */
const bottomNavItems = [
  { href: "/story", label: "关于旎柏", labelEn: "Story", icon: StoryIcon },
  { href: "/ritual", label: "护肤仪式", labelEn: "Ritual", icon: RitualIcon },
  { href: "/contact", label: "联系我们", labelEn: "Contact", icon: ContactIcon },
];

interface Category {
  id: string;
  name: string;
  nameEn: string;
  slug: string;
  icon?: string | null;
}

interface PurchaseLink {
  id: string;
  platform: string;
  url: string;
}

interface Product {
  id: string;
  name: string;
  nameEn: string;
  slug: string;
  description: string;
  price: number;
  capacity: string | null;
  purchaseUrl: string | null;
  purchaseLinks: PurchaseLink[];
  categoryId: string;
  category: Category;
  images: { url: string; alt: string | null }[];
  ingredients: string | null;
  usage: string | null;
  benefits: string[];
}

interface ProductsContentProps {
  categories: Category[];
  products: Product[];
}

/**
 * 分类图标 SVG 组件
 * 优先使用数据库中的图标，如果没有则使用默认图标
 */
function CategoryIcon({ icon, isActive }: { icon?: string | null; isActive: boolean }) {
  const color = isActive ? "#C9A86C" : "#8B8579";
  const iconClass = "h-7 w-7 sm:h-8 sm:w-8 md:h-10 md:w-10 lg:h-12 lg:w-12 flex-shrink-0";

  // 如果有自定义图标，使用 dangerouslySetInnerHTML 渲染
  if (icon) {
    // 将 currentColor 替换为实际颜色，并确保 SVG 填充容器
    const coloredIcon = icon
      .replace(/currentColor/g, color)
      .replace(/<svg/, '<svg class="w-full h-full"');
    return (
      <div
        className={iconClass}
        style={{ color }}
        dangerouslySetInnerHTML={{ __html: coloredIcon }}
      />
    );
  }

  // 默认图标
  return (
    <svg viewBox="0 0 40 40" className={iconClass}>
      <rect x="10" y="10" width="20" height="20" rx="4" fill={color} />
    </svg>
  );
}

/**
 * 平台图标组件
 */
function PlatformIcon({ platform, className }: { platform: string; className?: string }) {
  const iconClass = className || "h-4 w-4";

  switch (platform) {
    case "天猫":
      return (
        <svg viewBox="0 0 1025 1024" className={iconClass}>
          <path d="M145.92 1023.999h145.92c0-81.067-32.426-145.92-73.386-145.92-39.253 0-72.534 64.853-72.534 145.92zM731.306 1023.999h145.92c0-81.067-32.427-145.92-73.386-145.92-40.106 0-72.534 64.853-72.534 145.92z" fill="#D81E06"/>
          <path d="M965.12 663.04c-40.107-7.68-85.334 28.16-124.587 98.133-40.107 69.973-88.746 116.054-199.68 116.054H383.147c-110.934 0-159.573-46.08-199.68-116.054C143.361 691.2 98.134 655.36 58.88 663.04 30.72 668.16 8.533 696.32 0 733.866v144.213c0 54.613 30.72 102.4 75.093 127.146 9.386-71.68 69.973-127.146 144.213-127.146 81.067 0 145.92 65.706 145.92 145.92h73.387c0-40.106 32.426-73.387 73.386-73.387 40.107 0 73.387 32.426 73.387 73.387h73.387c0-81.067 65.706-145.92 145.92-145.92 74.24 0 134.827 55.467 144.213 127.146 44.373-24.747 75.093-72.534 75.093-127.146V735.573c-7.68-39.253-30.719-67.414-58.88-72.533z" fill="#D81E06"/>
          <path d="M878.08 0H145.92C65.707 0 0 65.706 0 145.92v459.946c13.653-9.386 29.014-16.213 45.226-19.627 33.28-6.827 120.32-5.973 200.533 134.827 26.453 46.08 51.2 78.506 136.533 78.506h257.706c85.333 0 110.933-32.426 136.534-78.506 80.212-140.8 167.252-140.8 200.532-134.827 16.214 3.414 31.574 10.24 46.08 19.627V145.92C1024 65.706 958.295 0 878.08 0zM694.614 219.307H585.387v292.692c0 40.107-32.426 73.387-73.386 73.387-40.107 0-73.387-32.426-73.387-73.387V219.307H329.387c-20.48 0-36.692-16.214-36.692-36.694 0-20.48 16.213-36.693 36.692-36.693h366.08c20.48 0 36.693 16.214 36.693 36.693 0 20.48-17.066 36.694-37.546 36.694z" fill="#D81E06"/>
        </svg>
      );
    case "小红书":
      return (
        <svg viewBox="0 0 1024 1024" className={iconClass}>
          <path d="M960 797.248V226.784C960 137.248 886.752 64 797.216 64H226.784C137.248 64 64 137.248 64 226.784v570.464c0 88.64 71.808 161.344 160.16 162.752h575.68c88.32-1.408 160.16-74.08 160.16-162.752" fill="#FF2442"/>
          <path d="M700.544 384h50.4v18.048c0 1.44 0.704 2.112 2.08 2.08 29.888-0.896 60 0.064 75.424 30.72 9.184 18.176 7.296 45.824 6.784 67.52-0.032 1.28 0.576 1.984 1.792 2.112 3.52 0.32 6.944 0.64 10.272 1.056 59.424 7.136 47.68 63.168 47.872 107.2 0.096 15.36-1.632 26.592-5.12 33.76-7.36 14.848-20.544 23.36-39.552 25.472H813.44l-18.944-43.968a1.44 1.44 0 0 1 0.096-1.344 1.376 1.376 0 0 1 1.152-0.64l40.192-0.032c2.24 0 4.352-0.96 5.888-2.624a8.896 8.896 0 0 0 2.368-6.176c-0.192-13.44-0.288-26.848-0.224-40.256 0-12.064-5.696-18.24-17.184-18.56-12.992-0.32-37.6-0.32-73.856 0.064-1.28 0-1.92 0.704-1.92 2.08l-0.192 111.456H700.48l-0.16-111.936a1.984 1.984 0 0 0-1.952-2.048h-47.04a2.24 2.24 0 0 1-2.176-2.24l0.064-48.704c0-1.632 0.768-2.464 2.304-2.464l46.496 0.096a2.208 2.208 0 0 0 1.6-0.704 2.432 2.432 0 0 0 0.64-1.664v-42.112a2.784 2.784 0 0 0-2.688-2.848l-28.704 0.128c-1.504 0-2.24-0.8-2.24-2.368l-0.096-48.96c0-1.44 0.64-2.144 2.08-2.144h29.728c1.28 0 1.92-0.64 1.92-2.016l0.32-17.984z m52.192 120.736l31.264-0.064c0.512 0 0.992-0.224 1.344-0.608a2.016 2.016 0 0 0 0.544-1.408l-0.16-39.136c0-3.072-2.24-5.568-4.96-5.568l-25.088 0.064a4.704 4.704 0 0 0-3.52 1.664 5.984 5.984 0 0 0-1.44 4l0.16 39.136c0 1.088 0.864 1.92 1.856 1.92zM429.344 508.256c-12.16 0.224-34.144 3.616-38.944-12.032-2.912-9.344 3.68-22.368 7.68-31.488 11.392-25.952 22.56-52 33.536-78.144 0.448-1.056 1.216-1.6 2.304-1.6h48.096c0.416 0 0.768 0.224 0.96 0.576a1.28 1.28 0 0 1 0.128 1.152l-27.84 65.056c-0.64 1.504-0.48 3.2 0.352 4.608a4.544 4.544 0 0 0 3.84 2.176h41.216c0.512 0 0.96 0.256 1.248 0.672 0.256 0.448 0.32 0.96 0.096 1.44-11.904 27.744-23.776 55.296-35.616 82.656-1.184 2.72-1.696 4.736-1.504 6.016 0.416 2.784 1.984 4.192 4.672 4.224l26.08 0.16c1.504 0.032 1.984 0.768 1.376 2.24l-16.864 39.68a3.328 3.328 0 0 1-3.2 2.208c-26.496 0.32-45.024 0.32-55.584-0.16-17.472-0.8-21.76-16.096-14.976-31.872l23.968-55.936a1.216 1.216 0 0 0-0.096-1.088 1.088 1.088 0 0 0-0.96-0.544zM229.504 671.968h-18.88l-18.496-43.424a1.408 1.408 0 0 1 0.096-1.312 1.28 1.28 0 0 1 1.088-0.64l26.112-0.064a6.112 6.112 0 0 0 5.984-6.24l0.704-230.304a2.24 2.24 0 0 1 2.208-2.304h44.928c2.112 0 3.168 1.12 3.2 3.328 0.192 77.984 0.192 154.624 0 229.952-0.128 30.912-14.464 52.032-46.944 51.008z" fill="#FFFFFF"/>
          <path d="M650.944 671.968h-170.432l22.848-51.52a3.04 3.04 0 0 1 2.976-1.952l41.728 0.064c1.472 0 2.24-0.736 2.24-2.24v-156.32c0-1.344-0.64-2.016-1.92-2.016l-27.68-0.032c-1.248 0-2.24-1.088-2.24-2.4v-50.144c0-0.768 0.576-1.408 1.312-1.408h112.832c1.408 0 2.08 0.736 2.08 2.208l0.064 49.6c0 1.44-0.704 2.176-2.112 2.176h-27.904c-1.28 0-1.92 0.672-1.92 2.016v156.224c0 1.504 0.736 2.24 2.144 2.24l44.224 0.096c1.216 0 1.824 0.64 1.824 1.92L650.944 672zM853.92 408.864c34.816-23.936 59.328 37.088 21.184 47.552-6.208 1.728-16.096 1.824-29.632 0.32-1.216-0.128-1.792-0.8-1.792-2.08-0.192-14.4-3.04-36.672 10.24-45.76zM373.312 588.288l-23.04 53.664c-2.08 4.8-4.352 4.896-6.88 0.384-16.96-30.656-22.72-55.68-26.048-93.792-2.56-29.6-4.768-59.2-6.688-88.864-0.064-1.344 0.544-2.016 1.824-2.016l46.688 0.032c1.312 0 2.048 0.704 2.144 2.048 2.4 34.496 4.928 68.896 7.552 103.2 0.672 8.832 2.176 16.16 4.48 21.984a4.16 4.16 0 0 1-0.032 3.36zM128 586.304v-2.208a22.592 22.592 0 0 0 4.16-10.112c3.456-38.08 6.272-76.128 8.48-114.208 0.096-1.184 0.672-1.792 1.792-1.792h47.68c0.416 0 0.832 0.192 1.152 0.544 0.288 0.32 0.448 0.768 0.416 1.216a6351.04 6351.04 0 0 1-8.416 105.184c-2.24 25.44-10.368 59.488-27.36 80.128-1.088 1.312-2.016 1.184-2.72-0.416L128 586.304zM453.184 671.968h-69.056l-8.8-3.488c-1.248-0.48-1.6-1.344-1.024-2.592l21.664-49.6c0.64-1.44 1.664-1.984 3.136-1.6 23.68 6.432 51.104 3.776 75.328 3.872 1.504 0.032 1.92 0.768 1.28 2.176l-22.528 51.2z" fill="#FFFFFF"/>
        </svg>
      );
    case "抖音":
      return (
        <svg viewBox="0 0 1024 1024" className={iconClass}>
          <path d="M208.323765 0h607.35247C922.262588 0 1008.941176 89.088 1008.941176 198.595765V822.814118c0 109.507765-86.678588 198.595765-193.264941 198.595764H208.323765C101.737412 1021.379765 15.058824 932.291765 15.058824 822.784V198.595765C15.058824 89.088 101.737412 0 208.323765 0z" fill="#170B1A"/>
          <path d="M503.356235 309.458824c0.572235-63.427765 0-126.855529 0.572236-190.283295h128.150588c-0.572235 11.203765 1.114353 22.437647 2.770823 33.129412h-94.32847v515.312941a124.295529 124.295529 0 0 1-15.510588 62.85553c-16.655059 29.214118-47.736471 49.392941-81.016471 52.224a107.580235 107.580235 0 0 1-61.590588-12.950588A106.134588 106.134588 0 0 1 346.352941 737.249882c32.737882 18.522353 75.444706 16.835765 107.068235-3.915294 30.509176-19.094588 50.507294-55.024941 50.507295-92.069647-0.572235-110.592-0.572235-221.184-0.572236-331.776z m211.395765-36.472471c17.769412 11.203765 37.707294 20.178824 58.247529 24.696471 12.197647 2.800941 24.395294 3.915294 37.165177 3.915294v29.214117a182.302118 182.302118 0 0 1-95.412706-57.825882z" fill="#25F4EE"/>
          <path d="M275.576471 427.459765a223.111529 223.111529 0 0 1 153.6-33.520941v31.232a267.956706 267.956706 0 0 0-42.255059 5.12 236.664471 236.664471 0 0 0-94.328471 43.730823c-30.177882 23.280941-53.217882 55.115294-69.12 90.322824a250.277647 250.277647 0 0 0-22.497882 107.911529c0 40.899765 10.962824 80.655059 29.605647 116.434824 8.794353 16.474353 18.672941 32.376471 31.834353 45.447529-26.895059-19.335529-49.392941-45.477647-65.837177-74.992941-22.497882-39.183059-33.430588-85.202824-32.37647-131.192471A256.210824 256.210824 0 0 1 198.776471 508.084706a236.212706 236.212706 0 0 1 76.8-80.624941z" fill="#25F4EE"/>
          <path d="M540.491294 153.208471h94.780235c3.312941 18.582588 9.999059 36.050824 18.31153 52.946823 13.312 25.901176 32.135529 49.031529 56.530823 64.240941a13.071059 13.071059 0 0 1 3.915294 3.915294 181.428706 181.428706 0 0 0 95.894589 58.066824c0.542118 33.792 0 68.156235 0 101.978353a297.020235 297.020235 0 0 1-176.308706-56.922353c0 81.136941 0 162.273882 0.542117 243.380706 0 10.721882 0.572235 21.413647 0 32.677647a269.312 269.312 0 0 1-34.334117 112.700235 243.802353 243.802353 0 0 1-66.56 76.619294 211.516235 211.516235 0 0 1-121.404235 42.255059c-22.166588 0.572235-44.363294-0.572235-65.957648-5.632a235.459765 235.459765 0 0 1-84.841411-37.737412l-1.656471-1.716706c-12.769882-12.950588-23.311059-28.732235-32.165647-45.056-18.853647-34.936471-29.936941-74.932706-29.936941-115.501176a246.061176 246.061176 0 0 1 22.738823-107.038118c16.052706-34.936471 39.905882-66.499765 69.872942-89.6a241.242353 241.242353 0 0 1 95.322353-43.369411c13.854118-2.831059 28.310588-4.517647 42.706823-5.059765 0.542118 12.950588 0 25.901176 0.542118 38.309647v65.897412c-16.082824-5.632-33.822118-5.632-50.447059-1.686589a124.084706 124.084706 0 0 0-54.332235 27.045648c-9.426824 8.432941-17.769412 18.582588-23.280942 29.876705-9.999059 19.154824-13.312 41.682824-11.083294 63.096471 2.198588 20.841412 11.083294 41.110588 24.395294 56.922353 8.854588 11.233882 20.48 19.696941 32.13553 27.587765 9.426824 13.522824 21.624471 24.786824 36.050823 32.677647a111.796706 111.796706 0 0 0 61.530353 12.950588c33.28-2.258824 64.301176-23.100235 80.956236-52.404706 10.541176-19.154824 16.082824-41.110588 15.510588-63.096471 1.114353-173.537882 0.572235-345.931294 0.572235-518.324705z" fill="#FFFFFF"/>
          <path d="M650.119529 136.192c10.992941 0.542118 21.985882 0 33.490824 0a189.138824 189.138824 0 0 0 32.948706 106.616471c2.740706 3.975529 5.481412 7.348706 8.252235 10.752-24.154353-15.239529-43.369412-38.369882-56.018823-64.331295a216.335059 216.335059 0 0 1-18.672942-53.037176z m172.965647 179.440941c12.047059 2.800941 24.154353 3.915294 36.773648 3.915294v131.493647c-62.584471 0.602353-125.168941-20.871529-176.248471-58.669176v260.698353a233.833412 233.833412 0 0 1-5.481412 58.669176c-12.047059 58.699294-46.110118 111.736471-93.334588 146.160941a225.520941 225.520941 0 0 1-83.425882 38.369883 225.942588 225.942588 0 0 1-109.808942-1.686588A230.309647 230.309647 0 0 1 280.094118 825.735529a222.780235 222.780235 0 0 0 84.028235 37.797647c21.383529 5.089882 43.369412 6.204235 65.295059 5.662118a207.932235 207.932235 0 0 0 120.259764-42.345412c26.895059-20.299294 48.850824-46.832941 65.867295-76.739764a271.962353 271.962353 0 0 0 34.032941-112.850824c0.542118-10.721882 0.542118-21.443765 0-32.737882-0.542118-81.227294-0.542118-162.484706-0.542118-243.742118a291.900235 291.900235 0 0 0 174.592 56.982588c-0.542118-33.852235 0-68.276706-0.542118-102.128941z" fill="#FE2C55"/>
          <path d="M440.380235 425.562353c12.649412 0 25.840941 0.602353 38.490353 2.258823v134.866824a106.706824 106.706824 0 0 0-58.006588-2.258824 110.983529 110.983529 0 0 0-79.299765 69.421177c-12.649412 33.852235-7.469176 73.366588 14.366118 102.128941a120.229647 120.229647 0 0 1-33.310118-27.648 105.502118 105.502118 0 0 1-25.298823-56.982588c-2.288941-21.443765 1.174588-44.032 11.504941-63.216941 5.722353-11.264 14.366118-21.443765 24.124235-29.906824 16.082824-13.552941 36.201412-21.985882 56.32-27.075765 17.227294-3.945412 35.599059-3.945412 52.254118 1.686589v-66.017883c-1.144471-11.294118-0.572235-24.274824-1.144471-37.255529z" fill="#FE2C55"/>
        </svg>
      );
    default:
      return <ShoppingBag className={iconClass} />;
  }
}

/**
 * 购买链接下拉菜单组件
 * 移动端使用底部弹出菜单，PC端使用传统下拉
 */
function PurchaseDropdown({ links }: { links: PurchaseLink[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 客户端挂载后才渲染 Portal
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // 点击外部关闭菜单（PC端）
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // 没有链接时显示禁用状态的图标按钮
  if (!links || links.length === 0) {
    return (
      <span className="flex cursor-not-allowed items-center justify-center rounded-full bg-brand-gold/20 p-2 text-brand-gold/50 sm:p-2.5">
        <ShoppingBag className="h-4 w-4 sm:h-5 sm:w-5" />
      </span>
    );
  }

  // 移动端底部弹出菜单（通过 Portal 渲染到 body，AnimatePresence 包在外层以支持退出动画）
  const mobileMenu = isMounted ? createPortal(
    <AnimatePresence>
      {isOpen && (
        <m.div
          key="mobile-purchase-menu"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[9999] sm:hidden"
          onClick={() => setIsOpen(false)}
        >
          {/* 背景遮罩 - 毛玻璃效果 */}
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="absolute inset-0 bg-black/20 backdrop-blur-sm"
          />
          {/* 底部菜单 */}
          <m.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 400 }}
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-0 left-0 right-0 mx-3 mb-3 overflow-hidden rounded-3xl bg-gradient-to-b from-[#FAF9F6] to-white shadow-2xl"
          >
            {/* 拖动条 */}
            <div className="flex justify-center pt-3">
              <div className="h-1 w-10 rounded-full bg-brand-gold/30" />
            </div>
            {/* 购买选项 - 横向排列 */}
            <div className="flex justify-center gap-6 px-6 py-6">
              {links.map((link) => (
                <a
                  key={link.id}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setIsOpen(false)}
                  className="flex flex-col items-center gap-2 transition-all active:scale-95"
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-md ring-1 ring-black/5">
                    <PlatformIcon platform={link.platform} className="h-8 w-8" />
                  </div>
                  <span className="text-xs font-medium text-brand-charcoal/80">{link.platform}</span>
                </a>
              ))}
            </div>
            {/* 取消按钮 */}
            <div className="border-t border-brand-gold/10 px-4 py-3">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="w-full py-2 text-center text-sm font-medium text-brand-charcoal/50 transition-colors active:text-brand-charcoal"
              >
                取消
              </button>
            </div>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>,
    document.body
  ) : null;

  // 有链接时显示菜单
  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-center rounded-full bg-brand-gold/20 p-2 text-brand-gold transition-all active:scale-95 sm:p-2.5 sm:hover:bg-brand-gold/30"
      >
        <ShoppingBag className="h-4 w-4 sm:h-5 sm:w-5" />
      </button>

      {/* 移动端：底部弹出菜单 */}
      {mobileMenu}

      {/* PC端：传统下拉菜单 */}
      <AnimatePresence>
        {isOpen && (
          <m.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full left-0 z-50 mb-2 hidden min-w-[140px] overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-black/5 sm:block"
          >
            {links.map((link) => (
              <a
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-brand-charcoal transition-colors hover:bg-brand-gold/10"
              >
                <PlatformIcon platform={link.platform} className="h-5 w-5" />
                {link.platform}
              </a>
            ))}
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * 产品列表内容组件
 * Client Component - 处理分类筛选和产品展示
 */
export function ProductsContent({ categories, products }: ProductsContentProps) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [currentProductIndex, setCurrentProductIndex] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductData | null>(null);
  const [isNavMenuOpen, setIsNavMenuOpen] = useState(false);

  // 按分类顺序排列产品
  const sortedProducts = useMemo(() => {
    const categoryOrder = new Map(categories.map((cat, index) => [cat.id, index]));
    return [...products].sort((a, b) => {
      const orderA = categoryOrder.get(a.categoryId) ?? 999;
      const orderB = categoryOrder.get(b.categoryId) ?? 999;
      return orderA - orderB;
    });
  }, [categories, products]);

  // 当前展示的产品（轮播显示所有产品，按分类顺序）
  const currentProduct = sortedProducts[currentProductIndex] || null;

  // 切换到上一个产品
  const handlePrevProduct = () => {
    setCurrentProductIndex((prev) =>
      prev === 0 ? sortedProducts.length - 1 : prev - 1
    );
    // 更新高亮的分类
    const prevIndex = currentProductIndex === 0 ? sortedProducts.length - 1 : currentProductIndex - 1;
    setActiveCategory(sortedProducts[prevIndex]?.categoryId || null);
  };

  // 切换到下一个产品
  const handleNextProduct = () => {
    setCurrentProductIndex((prev) =>
      prev === sortedProducts.length - 1 ? 0 : prev + 1
    );
    // 更新高亮的分类
    const nextIndex = currentProductIndex === sortedProducts.length - 1 ? 0 : currentProductIndex + 1;
    setActiveCategory(sortedProducts[nextIndex]?.categoryId || null);
  };

  // 点击分类时跳转到该分类的第一个产品并展开
  const handleCategoryChange = (categoryId: string) => {
    // 重复点击同一分类不取消选中，直接返回
    if (categoryId === activeCategory) {
      return;
    }
    const firstProductIndex = sortedProducts.findIndex((p) => p.categoryId === categoryId);
    if (firstProductIndex !== -1) {
      setActiveCategory(categoryId);
      setCurrentProductIndex(firstProductIndex);
    }
    // 点击分类时自动展开商品卡片
    setIsExpanded(true);
  };

  // 打开产品抽屉
  const handleProductClick = (product: Product) => {
    const productData: ProductData = {
      id: product.id,
      name: product.name,
      nameEn: product.nameEn,
      slug: product.slug,
      description: product.description,
      price: product.price,
      capacity: product.capacity || undefined,
      purchaseUrl: product.purchaseUrl || undefined,
      images: product.images.map((img) => ({
        url: img.url,
        alt: img.alt || undefined,
      })),
      category: { name: product.category.name },
      ingredients: product.ingredients || undefined,
      usage: product.usage || undefined,
      benefits: product.benefits,
    };
    setSelectedProduct(productData);
    setDrawerOpen(true);
  };

  // 关闭抽屉
  const handleCloseDrawer = () => {
    setDrawerOpen(false);
  };

  return (
    <>
      {/* 全屏背景图片 - 始终全屏显示，不受展开/收起影响 */}
      <div className="fixed inset-0 z-0">
        <Image
          src="/images/bg.png"
          alt="NIHPLOD 产品系列"
          fill
          priority
          quality={100}
          unoptimized
          className="object-cover"
        />
      </div>

      {/* 内容区域容器 - 展开时延伸到底部 */}
      <div className={cn(
        "fixed inset-0 z-10 transition-all duration-300",
        isExpanded ? "bottom-0" : "bottom-28 lg:bottom-32"
      )}>
        {/* 顶部分类导航栏 + 展开按钮一体化 */}
        <m.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="absolute left-2 right-2 top-2 z-30 sm:left-4 sm:right-4 sm:top-4 lg:left-6 lg:right-6 lg:top-6"
        >
          {/* 分类栏 + 按钮一体化容器 */}
          <div className="flex flex-col items-center">
            {/* 分类图标区域 */}
            <div className="w-full rounded-xl bg-[#EBE8DB] sm:w-fit sm:rounded-2xl lg:rounded-3xl">
              <div className="px-2 py-2 sm:px-8 sm:py-3 md:px-12 lg:px-20 lg:py-4">
                {/* 移动端：grid 5列，桌面端：flex 单行 */}
                <div className="grid grid-cols-5 gap-x-0 gap-y-1 sm:flex sm:items-center sm:justify-center sm:gap-4 md:gap-8 lg:gap-14">
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => handleCategoryChange(cat.id)}
                      className={cn(
                        "flex flex-col items-center gap-0.5 px-1.5 py-1.5 transition-all sm:gap-1 sm:px-3 sm:py-2 lg:px-4 lg:py-2.5",
                        "rounded-lg hover:bg-brand-beige/30 sm:rounded-xl",
                        activeCategory === cat.id && "bg-brand-beige/50"
                      )}
                    >
                      <CategoryIcon icon={cat.icon} isActive={activeCategory === cat.id} />
                      <span className={cn(
                        "text-[10px] whitespace-nowrap sm:text-[11px] md:text-xs lg:text-sm",
                        activeCategory === cat.id ? "text-brand-gold font-medium" : "text-brand-charcoal/70"
                      )}>
                        {cat.name}
                      </span>
                      <span className={cn(
                        "font-serif text-[7px] uppercase tracking-wide whitespace-nowrap sm:text-[9px] md:text-[10px] lg:text-xs",
                        activeCategory === cat.id ? "text-brand-gold/80" : "text-brand-charcoal/50"
                      )}>
                        {cat.nameEn}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {/* 展开/收起按钮 - 无缝连接 */}
            <button
              type="button"
              onClick={() => {
                if (isExpanded) {
                  // 收起时清除分类选中状态
                  setActiveCategory(null);
                } else {
                  // 展开时自动选中当前产品的分类
                  setActiveCategory(currentProduct?.categoryId || null);
                }
                setIsExpanded(!isExpanded);
              }}
              className="group flex items-center justify-center rounded-b-xl bg-[#EBE8DB] px-6 py-2 shadow-sm sm:rounded-b-2xl sm:px-10 sm:py-2.5 lg:px-14 lg:py-3"
            >
              <m.div
                className="flex flex-col items-center transition-transform duration-200 group-hover:scale-110"
                animate={{ rotate: isExpanded ? 180 : 0 }}
                transition={{ duration: 0.3 }}
              >
                <ChevronDown className="h-5 w-5 text-brand-gold transition-colors duration-200 group-hover:text-brand-gold/80 sm:h-6 sm:w-6 lg:h-8 lg:w-8" />
                <ChevronDown className="-mt-3 h-5 w-5 text-brand-gold transition-colors duration-200 group-hover:text-brand-gold/80 sm:-mt-4 sm:h-6 sm:w-6 lg:-mt-5 lg:h-8 lg:w-8" />
              </m.div>
            </button>
          </div>
        </m.div>

        {/* 产品展示区域 - 3D 旋转木马 */}
        <AnimatePresence>
          {isExpanded && currentProduct && (
            <m.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="absolute inset-x-0 bottom-2 top-36 z-10 sm:bottom-4 sm:top-40 md:top-44 lg:bottom-6 lg:top-48"
              style={{ perspective: "1200px" }}
            >
              <div className="relative mx-auto flex h-full max-w-6xl items-center justify-center px-2 sm:px-4">
                {/* 五张卡片容器：左2、中1、右2 */}
                {sortedProducts.map((product, index) => {
                  // 计算相对位置：-2=左2, -1=左1, 0=中, 1=右1, 2=右2
                  const diff = index - currentProductIndex;
                  const normalizedDiff =
                    diff > sortedProducts.length / 2 ? diff - sortedProducts.length :
                    diff < -sortedProducts.length / 2 ? diff + sortedProducts.length : diff;

                  // 只渲染5张卡片（左2、左1、中、右1、右2）
                  if (Math.abs(normalizedDiff) > 2) return null;

                  const isCenter = normalizedDiff === 0;
                  const isLeft1 = normalizedDiff === -1;
                  const isLeft2 = normalizedDiff === -2;
                  const isRight1 = normalizedDiff === 1;
                  const isRight2 = normalizedDiff === 2;

                  // 计算位置、缩放、透明度、旋转
                  // 移动端和PC端使用不同参数
                  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
                  const getTransform = () => {
                    if (isCenter) return { x: "0%", scale: 1, zIndex: 20, opacity: 1, rotateY: 0 };
                    if (isMobile) {
                      // 移动端：左右卡片靠近中心
                      if (isLeft1) return { x: "-55%", scale: 0.82, zIndex: 15, opacity: 0.7, rotateY: 6 };
                      if (isRight1) return { x: "55%", scale: 0.82, zIndex: 15, opacity: 0.7, rotateY: -6 };
                      if (isLeft2) return { x: "-95%", scale: 0.65, zIndex: 10, opacity: 0, rotateY: 10 };
                      if (isRight2) return { x: "95%", scale: 0.65, zIndex: 10, opacity: 0, rotateY: -10 };
                    } else {
                      // PC端
                      if (isLeft1) return { x: "-52%", scale: 0.75, zIndex: 15, opacity: 0.6, rotateY: 15 };
                      if (isRight1) return { x: "52%", scale: 0.75, zIndex: 15, opacity: 0.6, rotateY: -15 };
                      if (isLeft2) return { x: "-90%", scale: 0.55, zIndex: 10, opacity: 0.3, rotateY: 25 };
                      if (isRight2) return { x: "90%", scale: 0.55, zIndex: 10, opacity: 0.3, rotateY: -25 };
                    }
                    return { x: "0%", scale: 0, zIndex: 0, opacity: 0, rotateY: 0 };
                  };

                  const transform = getTransform();

                  return (
                    <m.div
                      key={product.id}
                      initial={false}
                      animate={transform}
                      transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
                      onClick={() => {
                        if (isLeft1 || isLeft2) handlePrevProduct();
                        if (isRight1 || isRight2) handleNextProduct();
                      }}
                      className={cn(
                        // 卡片基础样式
                        "absolute overflow-hidden",
                        // 移动端：竖向卡片（上图下文）
                        "flex w-[58%] max-w-[240px] flex-col rounded-2xl",
                        // PC端：横向卡片（左文右图）
                        "sm:aspect-[16/10] sm:h-auto sm:w-[480px] sm:max-w-none sm:flex-row sm:rounded-2xl",
                        "md:w-[560px] lg:w-[640px] lg:rounded-3xl",
                        isCenter
                          ? "cursor-default bg-white shadow-2xl ring-1 ring-black/5"
                          : "cursor-pointer bg-white/90 shadow-lg ring-1 ring-black/5 sm:bg-white/60 sm:shadow-xl sm:ring-0 sm:backdrop-blur-sm sm:hover:bg-white/70"
                      )}
                      style={{ transformStyle: "preserve-3d" }}
                    >
                      {isCenter ? (
                        <>
                          {/* ===== 移动端：图片在上 / PC端：图片在右 ===== */}
                          <div className="w-full p-4 sm:order-2 sm:flex sm:w-[55%] sm:items-center sm:justify-center sm:p-5 md:p-6 lg:p-7">
                            <div className="relative aspect-square w-full overflow-hidden rounded-xl sm:h-full sm:w-auto md:rounded-2xl">
                              {product.images[0] && (
                                <Image
                                  src={product.images[0].url}
                                  alt={product.images[0].alt || product.name}
                                  fill
                                  className="object-cover drop-shadow-lg"
                                  sizes="(max-width: 640px) 200px, (max-width: 768px) 250px, 300px"
                                  priority
                                />
                              )}
                            </div>
                          </div>

                          {/* ===== 移动端：文字在下 / PC端：文字在左 ===== */}
                          <div className="flex w-full flex-col items-center px-4 pb-4 pt-2 sm:order-1 sm:w-[45%] sm:items-start sm:justify-center sm:p-6 md:p-7 lg:p-8">
                            {/* 产品名称 */}
                            <h2 className="text-center text-xl font-medium tracking-wide text-brand-charcoal sm:text-left sm:text-xl md:text-2xl lg:text-[26px]">
                              {product.name}
                            </h2>

                            {/* 英文名 */}
                            <p className="mt-1.5 font-serif text-[11px] uppercase tracking-widest text-brand-gold/70 sm:mt-1.5 sm:text-xs md:text-[13px]">
                              {product.nameEn}
                            </p>

                            {/* 分隔线 - 移动端居中 */}
                            <div className="mt-2.5 h-px w-10 bg-gradient-to-r from-transparent via-brand-gold/40 to-transparent sm:mt-4 sm:w-12 sm:bg-gradient-to-r sm:from-brand-gold/40 sm:to-transparent md:w-14 lg:w-16" />

                            {/* 功效 - 移动端隐藏 */}
                            {product.benefits && product.benefits.length > 0 && (
                              <p className="mt-2 hidden text-xs leading-relaxed text-brand-charcoal/60 sm:mt-3 sm:line-clamp-2 sm:block md:text-[13px]">
                                {product.benefits.slice(0, 3).join(" · ")}
                              </p>
                            )}

                            {/* 价格 */}
                            <div className="mt-2.5 flex items-baseline gap-1 sm:mt-5 sm:gap-1.5">
                              <span className="text-xl font-light text-brand-gold sm:text-2xl md:text-3xl lg:text-[32px]">
                                ¥{product.price}
                              </span>
                              {product.capacity && (
                                <span className="text-[10px] text-brand-charcoal/40 sm:text-xs">
                                  / {product.capacity}
                                </span>
                              )}
                            </div>

                            {/* 按钮 */}
                            <div className="mt-3 flex gap-2 sm:mt-6 sm:gap-3">
                              <button
                                type="button"
                                onClick={() => handleProductClick(product)}
                                className="rounded-full border border-brand-charcoal/20 px-4 py-1.5 text-[11px] font-medium text-brand-charcoal transition-all hover:border-brand-charcoal/40 hover:bg-brand-charcoal/5 sm:px-5 sm:py-2 sm:text-xs md:px-6 md:py-2.5 md:text-sm"
                              >
                                了解详情
                              </button>
                              <PurchaseDropdown links={product.purchaseLinks} />
                            </div>
                          </div>
                        </>
                      ) : (
                        /* 侧边卡片 - 简洁的图片展示 */
                        <div className="flex h-full w-full flex-col items-center justify-center p-4 sm:aspect-[16/10] sm:p-0">
                          {/* 移动端：显示图片和产品名 */}
                          <div className="relative aspect-square w-full overflow-hidden rounded-xl sm:h-full sm:w-full sm:rounded-none">
                            {product.images[0] && (
                              <Image
                                src={product.images[0].url}
                                alt={product.name}
                                fill
                                className="object-cover sm:object-contain sm:p-10 sm:opacity-50 sm:blur-[2px]"
                                sizes="(max-width: 640px) 50vw, 280px"
                              />
                            )}
                          </div>
                          {/* 移动端：产品名称 */}
                          <p className="mt-2 text-center text-xs font-medium text-brand-charcoal/70 sm:hidden">
                            {product.name}
                          </p>
                        </div>
                      )}
                    </m.div>
                  );
                })}

                {/* 左右箭头 */}
                <button
                  type="button"
                  onClick={handlePrevProduct}
                  className="absolute left-0 z-30 flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-brand-charcoal shadow-md backdrop-blur-sm transition-all hover:scale-110 hover:bg-white sm:h-10 sm:w-10 sm:shadow-lg md:h-11 md:w-11 lg:left-2"
                >
                  <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6" />
                </button>
                <button
                  type="button"
                  onClick={handleNextProduct}
                  className="absolute right-0 z-30 flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-brand-charcoal shadow-md backdrop-blur-sm transition-all hover:scale-110 hover:bg-white sm:h-10 sm:w-10 sm:shadow-lg md:h-11 md:w-11 lg:right-2"
                >
                  <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6" />
                </button>

                {/* 底部指示点 - 移动端隐藏 */}
                <div className="absolute bottom-2 left-1/2 z-30 hidden -translate-x-1/2 gap-2 sm:flex">
                  {sortedProducts.map((_, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => {
                        setCurrentProductIndex(index);
                        setActiveCategory(sortedProducts[index]?.categoryId || null);
                      }}
                      className={cn(
                        "h-2 rounded-full transition-all",
                        index === currentProductIndex
                          ? "w-6 bg-brand-gold"
                          : "w-2 bg-brand-charcoal/30 hover:bg-brand-charcoal/50"
                      )}
                    />
                  ))}
                </div>
              </div>
            </m.div>
          )}
        </AnimatePresence>

        {/* 无产品提示 */}
        <AnimatePresence>
          {isExpanded && sortedProducts.length === 0 && (
            <m.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-x-4 bottom-4 top-44 z-10 flex items-center justify-center lg:inset-x-6 lg:bottom-6 lg:top-48"
            >
              <div className="rounded-2xl bg-white/90 px-8 py-6 shadow-xl backdrop-blur-md">
                <p className="text-brand-charcoal/50">暂无产品</p>
              </div>
            </m.div>
          )}
        </AnimatePresence>
      </div>

      {/* 移动端菜单遮罩层 */}
      <AnimatePresence>
        {isNavMenuOpen && !isExpanded && (
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm sm:hidden"
            onClick={() => setIsNavMenuOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* 移动端弹出菜单 */}
      <AnimatePresence>
        {isNavMenuOpen && !isExpanded && (
          <m.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className="fixed bottom-20 right-3 z-50 w-44 rounded-2xl bg-white/95 p-2 shadow-xl backdrop-blur-md sm:hidden"
          >
            <div className="flex flex-col gap-1">
              {/* 首页 */}
              <Link
                href="/"
                onClick={() => setIsNavMenuOpen(false)}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors active:bg-brand-beige/50"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-gold/10">
                  <HomeIcon className="h-5 w-5" />
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-brand-charcoal">首页</span>
                  <span className="font-serif text-[9px] uppercase tracking-wide text-brand-charcoal/50">Home</span>
                </div>
              </Link>
              {/* 其他导航项 */}
              {bottomNavItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsNavMenuOpen(false)}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors active:bg-brand-beige/50"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-gold/10">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-brand-charcoal">{item.label}</span>
                      <span className="font-serif text-[9px] uppercase tracking-wide text-brand-charcoal/50">{item.labelEn}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </m.div>
        )}
      </AnimatePresence>

      {/* 底部导航栏 - 展开时隐藏 */}
      <AnimatePresence>
        {!isExpanded && (
          <m.header
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="fixed bottom-2 left-3 right-3 z-50 sm:bottom-4 sm:left-6 sm:right-6 lg:bottom-6 lg:left-16 lg:right-16"
            role="banner"
          >
            <nav
              className={cn(
                "flex items-center justify-between",
                // 移动端：更紧凑的设计
                "rounded-2xl bg-white/95 px-3 py-2.5 shadow-lg backdrop-blur-md",
                // 平板和桌面端
                "sm:px-5 sm:py-4 lg:rounded-3xl lg:px-8 lg:py-5"
              )}
              aria-label="产品页导航"
            >
              {/* 左侧主导航 - 商城 */}
              <Link
                href="/products"
                className="group flex items-center gap-2 transition-opacity active:opacity-70 sm:gap-4 sm:hover:opacity-80"
              >
                {/* 图标容器 */}
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-gold/10 sm:h-16 sm:w-16 lg:h-20 lg:w-20">
                  <ShopIcon className="h-6 w-6 sm:h-10 sm:w-10 lg:h-14 lg:w-14" />
                </div>
                {/* 文字 */}
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-brand-charcoal sm:text-lg lg:text-2xl">
                    商城
                  </span>
                  <span className="font-serif text-[10px] uppercase tracking-wide text-brand-gold/70 sm:text-xs lg:text-base">
                    Products
                  </span>
                </div>
              </Link>

              {/* 移动端：菜单按钮 */}
              <button
                type="button"
                onClick={() => setIsNavMenuOpen(!isNavMenuOpen)}
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-beige/30 transition-colors active:bg-brand-beige/50 sm:hidden"
                aria-label={isNavMenuOpen ? "关闭菜单" : "打开菜单"}
              >
                <AnimatePresence mode="wait" initial={false}>
                  {isNavMenuOpen ? (
                    <m.div
                      key="close"
                      initial={{ opacity: 0, rotate: -90 }}
                      animate={{ opacity: 1, rotate: 0 }}
                      exit={{ opacity: 0, rotate: 90 }}
                      transition={{ duration: 0.15 }}
                    >
                      <X className="h-5 w-5 text-brand-charcoal" />
                    </m.div>
                  ) : (
                    <m.div
                      key="menu"
                      initial={{ opacity: 0, rotate: 90 }}
                      animate={{ opacity: 1, rotate: 0 }}
                      exit={{ opacity: 0, rotate: -90 }}
                      transition={{ duration: 0.15 }}
                    >
                      <Menu className="h-5 w-5 text-brand-charcoal" />
                    </m.div>
                  )}
                </AnimatePresence>
              </button>

              {/* 平板/桌面端：直接显示导航图标 */}
              <div className="hidden items-center gap-5 sm:flex lg:gap-8">
                {bottomNavItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="group flex flex-col items-center gap-1 transition-opacity hover:opacity-80"
                    >
                      <div className="flex h-14 w-14 items-center justify-center rounded-xl transition-colors group-hover:bg-brand-beige/50 lg:h-16 lg:w-16">
                        <Icon className="h-8 w-8 lg:h-9 lg:w-9" />
                      </div>
                      <span className="text-xs text-brand-charcoal/70 lg:text-sm">
                        {item.label}
                      </span>
                      <span className="font-serif text-[10px] uppercase tracking-wide text-brand-charcoal/50 lg:text-xs">
                        {item.labelEn}
                      </span>
                    </Link>
                  );
                })}
                {/* 回到首页按钮 */}
                <Link
                  href="/"
                  className="group flex flex-col items-center gap-1 transition-opacity hover:opacity-80"
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl transition-colors group-hover:bg-brand-beige/50 lg:h-16 lg:w-16">
                    <HomeIcon className="h-8 w-8 lg:h-9 lg:w-9" />
                  </div>
                  <span className="text-xs text-brand-charcoal/70 lg:text-sm">
                    首页
                  </span>
                  <span className="font-serif text-[10px] uppercase tracking-wide text-brand-charcoal/50 lg:text-xs">
                    Home
                  </span>
                </Link>
              </div>
            </nav>
          </m.header>
        )}
      </AnimatePresence>

      {/* 产品详情抽屉 */}
      <ProductDrawer
        isOpen={drawerOpen}
        onClose={handleCloseDrawer}
        product={selectedProduct}
      />
    </>
  );
}


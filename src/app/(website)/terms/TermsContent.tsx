"use client";

import { useState } from "react";
import Image from "next/image";
import { m, AnimatePresence } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TermsPageContent, TermsTabId } from "@/types/page-content";

// 图标颜色常量
const ICON_COLOR = "#C3BC9F";
const ICON_HOVER_COLOR = "#B8A47B"; // brand-gold

// 服务条款图标
const GeneralIcon = ({ className, isHovered }: { className?: string; isHovered?: boolean }) => {
  const color = isHovered ? ICON_HOVER_COLOR : ICON_COLOR;
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn(className, "transition-all duration-300")}>
      <path d="M17.6016 1.91602C18.5297 1.91602 19.2822 2.66859 19.2822 3.59668V21.335C19.2822 21.6147 19.1257 21.871 18.877 21.999C18.6282 22.127 18.3282 22.105 18.1006 21.9424L15.2676 19.918L12.4346 21.9424C12.1749 22.1279 11.8251 22.1279 11.5654 21.9424L8.73242 19.918L5.89941 21.9424C5.67176 22.105 5.37181 22.127 5.12305 21.999C4.87431 21.871 4.71777 21.6147 4.71777 21.335V3.59668C4.71777 2.66859 5.47032 1.91602 6.39844 1.91602H17.6016ZM9 14.1992C8.55817 14.1992 8.2002 14.5572 8.2002 14.999C8.2002 15.4409 8.55817 15.7988 9 15.7988H15C15.4418 15.7988 15.7998 15.4409 15.7998 14.999C15.7998 14.5572 15.4418 14.1992 15 14.1992H9ZM9 10.1992C8.55817 10.1992 8.2002 10.5572 8.2002 10.999C8.2002 11.4409 8.55817 11.7988 9 11.7988H15C15.4418 11.7988 15.7998 11.4409 15.7998 10.999C15.7998 10.5572 15.4418 10.1992 15 10.1992H9ZM9 6.19922C8.55817 6.19922 8.2002 6.5572 8.2002 6.99902C8.2002 7.44085 8.55817 7.79883 9 7.79883H15C15.4418 7.79883 15.7998 7.44085 15.7998 6.99902C15.7998 6.5572 15.4418 6.19922 15 6.19922H9Z" fill={color} />
    </svg>
  );
};

const ProductIcon = ({ className, isHovered }: { className?: string; isHovered?: boolean }) => {
  const color = isHovered ? ICON_HOVER_COLOR : ICON_COLOR;
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn(className, "transition-all duration-300")}>
      <path d="M12 1.99805C14.7611 1.99816 17.2624 3.11905 19.0713 4.92773C20.8803 6.73672 22.0009 9.23861 22.001 12C22.0009 14.7614 20.8802 17.2623 19.0713 19.0713C17.2623 20.8802 14.7613 22.0009 12 22.001C9.23864 22.0009 6.73671 20.8802 4.92773 19.0713C3.11905 17.2624 1.99816 14.7611 1.99805 12C1.99814 9.23863 3.1188 6.73672 4.92773 4.92773C6.73671 3.11879 9.23864 1.99816 12 1.99805ZM11.3057 9.80566C10.864 9.80577 10.506 10.1638 10.5059 10.6055C10.5059 11.0472 10.8639 11.4052 11.3057 11.4053H11.4316V16.2881H10.6104C10.1689 16.2884 9.81068 16.6464 9.81055 17.0879C9.81066 17.5294 10.1688 17.8874 10.6104 17.8877H13.8516C14.2933 17.8876 14.6513 17.5296 14.6514 17.0879C14.6512 16.6462 14.2933 16.2881 13.8516 16.2881H13.0312V10.6055C13.0311 10.1639 12.673 9.8059 12.2314 9.80566H11.3057ZM12 5.98047C11.3609 5.98057 10.8419 6.49956 10.8418 7.13867C10.842 7.7777 11.3609 8.2958 12 8.2959C12.639 8.29577 13.157 7.77769 13.1572 7.13867C13.1571 6.49958 12.6391 5.9806 12 5.98047Z" fill={color} />
    </svg>
  );
};

const ResponsibilityIcon = ({ className, isHovered }: { className?: string; isHovered?: boolean }) => {
  const color = isHovered ? ICON_HOVER_COLOR : ICON_COLOR;
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn(className, "transition-all duration-300")}>
      <path d="M11.7852 1.46875C11.9283 1.42705 12.0805 1.42699 12.2236 1.46875L21.0254 4.03906C21.359 4.13658 21.5889 4.44345 21.5889 4.79102V10.0635C21.5889 15.9424 17.8264 21.1619 12.249 23.0205C12.0885 23.074 11.9145 23.074 11.7539 23.0205C6.17508 21.1621 2.41125 15.9418 2.41113 10.0615V4.79102C2.41131 4.44344 2.64098 4.13657 2.97461 4.03906L11.7852 1.46875ZM16.5654 9.06445C16.253 8.75214 15.747 8.75214 15.4346 9.06445L11.2627 13.2344L9.06543 11.0381C8.75304 10.7258 8.24696 10.7258 7.93457 11.0381C7.62219 11.3505 7.62226 11.8565 7.93457 12.1689L10.6973 14.9326C11.0097 15.245 11.5167 15.245 11.8291 14.9326L16.5654 10.1953C16.8778 9.88289 16.8778 9.37685 16.5654 9.06445Z" fill={color} />
    </svg>
  );
};

const DisputeIcon = ({ className, isHovered }: { className?: string; isHovered?: boolean }) => {
  const color = isHovered ? ICON_HOVER_COLOR : ICON_COLOR;
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn(className, "transition-all duration-300")}>
      <path d="M7 11.4609V7.46094C7 4.69951 9.2386 2.46094 12 2.46094C14.7614 2.46094 17 4.69951 17 7.46094V11.4609" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19.5576 9.33203C20.7011 9.33217 21.5029 10.3082 21.5029 11.3506V20.5186C21.5029 21.561 20.7012 22.537 19.5576 22.5371H4.44238C3.29889 22.5369 2.49805 21.561 2.49805 20.5186V11.3506C2.4981 10.3082 3.29893 9.33223 4.44238 9.33203H19.5576ZM12 14.0654C11.5582 14.0654 11.2002 14.4234 11.2002 14.8652V18.8652C11.2002 19.3071 11.5582 19.665 12 19.665C12.4418 19.665 12.7998 19.3071 12.7998 18.8652V14.8652C12.7998 14.4234 12.4418 14.0654 12 14.0654Z" fill={color} />
    </svg>
  );
};

// 标签页配置
interface TabConfig {
  id: TermsTabId;
  label: string;
  icon: React.FC<{ className?: string; isHovered?: boolean }>;
}

const defaultTabs: TabConfig[] = [
  { id: "general", label: "总则", icon: GeneralIcon },
  { id: "product", label: "产品服务", icon: ProductIcon },
  { id: "responsibility", label: "责任限制", icon: ResponsibilityIcon },
  { id: "dispute", label: "争议解决", icon: DisputeIcon },
];

// Tab 按钮组件 - 支持 hover 状态
const TabButton = ({
  tab,
  index,
  isLast,
  onClick
}: {
  tab: TabConfig;
  index: number;
  isLast: boolean;
  onClick: () => void;
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const Icon = tab.icon;

  return (
    <m.button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        "group relative flex flex-1 flex-col items-center justify-center gap-3 px-3 py-6 transition-all duration-300 sm:gap-4 sm:px-6 sm:py-8 md:py-10",
        !isLast && "border-r border-brand-charcoal/20"
      )}
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.15 + index * 0.06, ease: "easeOut" }}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
    >
      <div className="flex h-12 w-12 items-center justify-center sm:h-16 sm:w-16 md:h-20 md:w-20 lg:h-24 lg:w-24">
        <Icon className="h-10 w-10 sm:h-14 sm:w-14 md:h-16 md:w-16 lg:h-20 lg:w-20" isHovered={isHovered} />
      </div>
      <span className={cn(
        "text-xs font-medium transition-colors duration-300 sm:text-sm md:text-base lg:text-lg",
        isHovered ? "text-brand-charcoal" : "text-brand-charcoal/70"
      )}>
        {tab.label}
      </span>
    </m.button>
  );
};

interface TermsContentProps {
  content: TermsPageContent;

}

/**
 * 服务条款页面内容组件
 * 默认展开，无底部导航栏
 */
export function TermsContent({ content }: TermsContentProps) {
  const [activeTab, setActiveTab] = useState<TermsTabId | null>(null);

  // 从 content 中获取数据
  const pageTitle = content.pageTitle || { en: "TERMS OF SERVICE", zh: "服务条款" };
  const description = content.description || "在使用我们的服务前，请仔细阅读以下条款";
  const lastUpdated = content.lastUpdated || "2024年12月1日";
  const tabContents = content.tabs;

  // 根据 content 中的标签标题动态生成 tabs
  const tabs: TabConfig[] = defaultTabs.map((tab) => ({
    ...tab,
    label: tabContents?.[tab.id]?.title || tab.label,
  }));

  return (
    <>
      {/* 全屏背景容器 - 延伸到安全区域外，覆盖状态栏 */}


      {/* 主内容区域 - 在安全区域内 */}
      <m.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="safe-area-content !pointer-events-none"
      >
        <div className="flex h-full flex-col items-center pointer-events-none">
          {/* 主内容区域 */}
          <div className="w-full flex-1 overflow-hidden rounded-2xl bg-[#EBE8DB] lg:rounded-3xl pointer-events-auto">
            <div className="flex h-full flex-col justify-center overflow-y-auto px-4 py-6 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] sm:px-6 sm:py-8 lg:px-8 lg:py-10">
              {/* 页面标题 */}
              {!activeTab && (
                <div className="mb-6 text-center sm:mb-8">
                  <p className="text-xs uppercase tracking-widest text-brand-gold sm:text-sm md:text-base">
                    {pageTitle.en}
                  </p>
                  <h1 className="mt-1 font-serif text-2xl text-brand-charcoal sm:text-3xl md:text-4xl">
                    {pageTitle.zh}
                  </h1>
                  <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-brand-charcoal/70 sm:mt-3 sm:text-base md:text-lg">
                    {description}
                  </p>
                  <p className="mt-1 text-xs text-brand-charcoal/50 sm:text-sm">
                    最后更新：{lastUpdated}
                  </p>
                </div>
              )}

              {/* 内容区域 */}
              <AnimatePresence mode="wait">
                {!activeTab && (
                  <m.div
                    key="tabs"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className="flex flex-col items-center"
                  >
                    {/* Logo */}
                    <m.div
                      className="mb-8 flex justify-center sm:mb-10"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.5, delay: 0.1, ease: "easeOut" }}
                    >
                      <div className="relative h-16 w-32 sm:h-20 sm:w-40 md:h-24 md:w-48">
                        <Image src="/images/logo.png" alt="NIHPLOD Logo" fill className="object-contain" />
                      </div>
                    </m.div>

                    {/* 4个大标签按钮 */}
                    <div className="flex w-full max-w-4xl items-stretch justify-center">
                      {tabs.map((tab, index) => (
                        <TabButton
                          key={tab.id}
                          tab={tab}
                          index={index}
                          isLast={index === tabs.length - 1}
                          onClick={() => setActiveTab(tab.id)}
                        />
                      ))}
                    </div>
                  </m.div>
                )}

                {/* 选中标签后显示的内容 */}
                {activeTab && (
                  <m.div
                    key={activeTab}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className="flex h-full flex-col"
                  >
                    {/* 返回按钮和标题 */}
                    <div className="mb-4 flex items-center justify-between sm:mb-6">
                      <m.button
                        type="button"
                        onClick={() => setActiveTab(null)}
                        className="flex items-center gap-2 text-brand-charcoal/70 transition-colors duration-300 hover:text-brand-charcoal"
                      >
                        <svg className="h-5 w-5 sm:h-6 sm:w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M15 18l-6-6 6-6" />
                        </svg>
                        <span className="text-sm sm:text-base">返回</span>
                      </m.button>
                      <m.h2 className="font-serif text-xl text-brand-gold sm:text-2xl md:text-3xl">
                        {tabContents?.[activeTab]?.title || activeTab}
                      </m.h2>
                      <div className="w-16 sm:w-20" />
                    </div>

                    {/* 内容区域 */}
                    <div className="flex-1 overflow-y-auto rounded-xl border border-brand-beige bg-white/80 p-4 backdrop-blur-sm [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] sm:p-6 md:p-8">
                      <div className="space-y-6">
                        {(tabContents?.[activeTab]?.content || []).map((paragraph, index) => {
                          // 按换行符分割段落
                          const lines = paragraph.split('\n');
                          return (
                            <m.div
                              key={index}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.3, delay: index * 0.1 }}
                              className="text-sm leading-relaxed text-brand-charcoal/70 sm:text-base"
                            >
                              {lines.map((line, lineIndex) => {
                                const trimmedLine = line.trim();
                                // 空行
                                if (!trimmedLine) {
                                  return <div key={lineIndex} className="h-2" />;
                                }
                                // 标题行（一、二、三等开头）
                                if (/^[一二三四五六七八九十]+、/.test(trimmedLine)) {
                                  return (
                                    <p key={lineIndex} className="mb-2 mt-4 font-medium text-brand-charcoal first:mt-0">
                                      {trimmedLine}
                                    </p>
                                  );
                                }
                                // 列表项（• 开头）
                                if (trimmedLine.startsWith('•')) {
                                  return (
                                    <p key={lineIndex} className="pl-4 text-brand-charcoal/60">
                                      {trimmedLine}
                                    </p>
                                  );
                                }
                                // 普通段落
                                return (
                                  <p key={lineIndex} className="text-brand-charcoal/70">
                                    {trimmedLine}
                                  </p>
                                );
                              })}
                            </m.div>
                          );
                        })}
                      </div>
                    </div>
                  </m.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* 返回上页按钮 */}
          <button
            onClick={() => typeof window !== "undefined" && window.history.back()}
            className="group flex items-center justify-center gap-2 rounded-b-2xl bg-[#EBE8DB] px-10 py-2.5 shadow-sm lg:px-14 lg:py-3 pointer-events-auto"
          >
            <ArrowLeft className="h-5 w-5 text-brand-gold transition-all duration-200 group-hover:scale-110 group-hover:text-brand-gold/80 lg:h-6 lg:w-6" />
            <span className="text-sm font-medium text-brand-charcoal transition-colors duration-200 group-hover:text-brand-charcoal/70 lg:text-base">返回上页</span>
          </button>
        </div>
      </m.div>
    </>
  );
}


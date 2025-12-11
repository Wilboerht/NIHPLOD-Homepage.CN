"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { Link } from "next-view-transitions";
import { m, AnimatePresence } from "framer-motion";
import { ChevronDown, Send, CheckCircle, AlertCircle, Loader2, MessageSquare, Briefcase, MessageCircle, AlertTriangle, HelpCircle, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ShopIcon, StoryIcon, RitualIcon, HomeIcon, ContactIcon } from "@/components/website";
import type { ContactPageContent } from "@/types/page-content";

/**
 * 底部导航项配置
 */
const bottomNavItems = [
  { href: "/products", label: "商城", labelEn: "Products", icon: ShopIcon },
  { href: "/story", label: "关于旎柏", labelEn: "Story", icon: StoryIcon },
  { href: "/ritual", label: "护肤仪式", labelEn: "Ritual", icon: RitualIcon },
];

type FormStatus = "idle" | "loading" | "success" | "error";

// 图标映射
const iconMap: Record<string, typeof HelpCircle> = {
  consultation: MessageSquare,
  cooperation: Briefcase,
  feedback: MessageCircle,
  complaint: AlertTriangle,
  other: HelpCircle,
};

// 默认留言类型
const defaultMessageTypes = [
  { value: "consultation", label: "产品咨询" },
  { value: "cooperation", label: "商务合作" },
  { value: "feedback", label: "使用反馈" },
  { value: "complaint", label: "投诉建议" },
  { value: "other", label: "其他问题" },
];

// 默认内容
const defaultContent: ContactPageContent = {
  title: { en: "CONTACT US", zh: "联系我们" },
  description: "有任何问题或建议？我们期待与您的每一次交流",
  messageTypes: defaultMessageTypes,
  copyright: "NIHPLOD All Rights Reserved.",
};

interface FormData {
  name: string;
  email: string;
  type: string;
  content: string;
  website: string; // 蜜罐字段
}

interface ContactContentProps {
  content?: ContactPageContent;
}

/**
 * 联系我们页面内容组件
 * 直接显示联系表单
 */
export function ContactContent({ content }: ContactContentProps) {
  // 合并默认内容和传入内容
  const title = content?.title || defaultContent.title;
  const description = content?.description || defaultContent.description;
  const messageTypesData = content?.messageTypes || defaultMessageTypes;
  const copyright = content?.copyright || defaultContent.copyright;

  // 构建带图标的留言类型选项
  const messageTypes = [
    { value: "", label: "请选择留言类型", icon: HelpCircle },
    ...messageTypesData.map((t) => ({
      value: t.value,
      label: t.label,
      icon: iconMap[t.value] || HelpCircle,
    })),
  ];
  const [isExpanded, setIsExpanded] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    name: "",
    email: "",
    type: "",
    content: "",
    website: "",
  });
  const [status, setStatus] = useState<FormStatus>("idle");
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);
  const typeDropdownRef = useRef<HTMLDivElement>(null);
  const [isNavMenuOpen, setIsNavMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  // 监听滚动，添加毛玻璃效果
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // 点击外部关闭下拉框
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (typeDropdownRef.current && !typeDropdownRef.current.contains(event.target as Node)) {
        setIsTypeDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 表单验证
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) {
      newErrors.name = "请输入您的姓名";
    } else if (formData.name.length < 2) {
      newErrors.name = "姓名至少2个字符";
    }
    if (!formData.email.trim()) {
      newErrors.email = "请输入您的邮箱";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "请输入有效的邮箱地址";
    }
    if (!formData.type) {
      newErrors.type = "请选择留言类型";
    }
    if (!formData.content.trim()) {
      newErrors.content = "请输入留言内容";
    } else if (formData.content.length < 10) {
      newErrors.content = "留言内容至少10个字符";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // 提交表单
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setStatus("loading");
    setMessage("");
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await response.json();
      if (response.ok) {
        setStatus("success");
        setMessage(data.message || "留言已提交");
        setFormData({ name: "", email: "", type: "", content: "", website: "" });
      } else {
        setStatus("error");
        setMessage(data.error || "提交失败，请稍后重试");
      }
    } catch {
      setStatus("error");
      setMessage("网络错误，请检查您的网络连接");
    }
  };

  // 输入变化处理
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  return (
    <>
      {/* 全屏背景图片 - 始终全屏显示，不受展开/收起影响 */}
      <div className="fixed inset-0 z-0">
        <Image
          src="/images/bg.png"
          alt="联系我们"
          fill
          priority
          quality={100}
          className="object-cover"
          sizes="100vw"
        />
        {/* 毛玻璃遮罩层 - 滚动或展开时显示 */}
        <div
          className={cn(
            "absolute inset-0 bg-white/30 backdrop-blur-md transition-opacity duration-300",
            isScrolled || isExpanded ? "opacity-100" : "opacity-0"
          )}
        />
      </div>

      {/* 内容区域容器 - 使用 framer-motion 统一控制动画 */}
      <m.div
        className="fixed inset-x-0 top-0 z-10"
        animate={{
          bottom: isExpanded ? 0 : 112 // bottom-28 = 7rem = 112px
        }}
        transition={{
          duration: 0.5,
          ease: [0.32, 0.72, 0, 1]
        }}
      >
        {/* 主内容区域 */}
        <m.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{
            opacity: 1,
            scale: 1,
            bottom: isExpanded ? 16 : 0 // bottom-4 = 1rem = 16px
          }}
          transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
          className="absolute left-6 right-6 top-4 z-20 sm:left-10 sm:right-10 lg:left-16 lg:right-16 lg:top-6"
        >
          {/* 主内容区域 + 按钮一体化容器 */}
          <div className="flex h-full flex-col items-center">
            {/* 主内容区域 - 使用 bg-[#EBE8DB] 不透明样式 */}
            <m.div
              className="w-full overflow-hidden rounded-2xl bg-[#EBE8DB] lg:rounded-3xl"
              animate={{
                flexGrow: isExpanded ? 1 : 0
              }}
              transition={{
                duration: 0.5,
                ease: [0.32, 0.72, 0, 1]
              }}
            >
              <div className={cn(
                "flex flex-col px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10",
                isExpanded ? "h-full justify-center overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]" : ""
              )}>
                {/* 页面标题 */}
                <div className={cn("text-center", isExpanded ? "mb-6 sm:mb-8" : "")}>
                  <p className="text-xs uppercase tracking-widest text-brand-gold sm:text-sm">
                    {title.en}
                  </p>
                  <h1 className="mt-2 font-serif text-3xl text-brand-charcoal sm:text-4xl lg:text-5xl">
                    {title.zh}
                  </h1>
                  <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-brand-charcoal/70 sm:mt-4 sm:text-base">
                    {description}
                  </p>
                </div>

                {/* 联系表单 - 仅在展开时显示 */}
                <AnimatePresence mode="popLayout">
                  {isExpanded && (
                    <m.div
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15, ease: "easeOut" }}
                      className="mx-auto w-full max-w-xl"
                    >
                  {status === "success" && (
                    <div className="mb-6 flex items-center justify-center gap-2 rounded-xl bg-green-50/80 p-4 text-green-700 backdrop-blur-sm">
                      <CheckCircle className="h-5 w-5" />
                      <span className="text-sm">{message}</span>
                    </div>
                  )}
                  {status === "error" && (
                    <div className="mb-6 flex items-center justify-center gap-2 rounded-xl bg-red-50/80 p-4 text-red-700 backdrop-blur-sm">
                      <AlertCircle className="h-5 w-5" />
                      <span className="text-sm">{message}</span>
                    </div>
                  )}

                  <form onSubmit={handleSubmit} className="space-y-5">
                    {/* 蜜罐字段 */}
                    <input type="text" name="website" value={formData.website} onChange={handleChange} autoComplete="off" tabIndex={-1} className="absolute left-[-9999px] top-0 h-0 w-0 opacity-0" aria-hidden="true" />

                    {/* 姓名和邮箱并排 */}
                    <div className="grid gap-5 sm:grid-cols-2">
                      <div>
                        <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-brand-charcoal">
                          姓名 <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          id="name"
                          name="name"
                          value={formData.name}
                          onChange={handleChange}
                          placeholder="请输入您的姓名"
                          autoComplete="name"
                          className={cn(
                            "w-full rounded-xl border bg-white/90 px-4 py-3 text-sm outline-none transition-all backdrop-blur-sm",
                            errors.name ? "border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-100" : "border-brand-beige/50 focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/10"
                          )}
                        />
                        {errors.name && <p className="mt-1.5 text-xs text-red-500">{errors.name}</p>}
                      </div>

                      <div>
                        <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-brand-charcoal">
                          邮箱 <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="email"
                          id="email"
                          name="email"
                          value={formData.email}
                          onChange={handleChange}
                          placeholder="请输入您的邮箱"
                          autoComplete="email"
                          inputMode="email"
                          className={cn(
                            "w-full rounded-xl border bg-white/90 px-4 py-3 text-sm outline-none transition-all backdrop-blur-sm",
                            errors.email ? "border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-100" : "border-brand-beige/50 focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/10"
                          )}
                        />
                        {errors.email && <p className="mt-1.5 text-xs text-red-500">{errors.email}</p>}
                      </div>
                    </div>

                    {/* 留言类型 - 自定义下拉框 */}
                    <div ref={typeDropdownRef} className="relative">
                      <label htmlFor="type" className="mb-1.5 block text-sm font-medium text-brand-charcoal">
                        留言类型 <span className="text-red-500">*</span>
                      </label>
                      {/* 触发按钮 */}
                      <button
                        type="button"
                        onClick={() => setIsTypeDropdownOpen(!isTypeDropdownOpen)}
                        className={cn(
                          "flex w-full items-center justify-between rounded-xl border bg-white/90 px-4 py-3 text-left text-sm outline-none transition-all backdrop-blur-sm",
                          !formData.type && "text-brand-charcoal/50",
                          errors.type
                            ? "border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-100"
                            : "border-brand-beige/50 hover:border-brand-gold/50 focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/10",
                          isTypeDropdownOpen && !errors.type && "border-brand-gold ring-2 ring-brand-gold/10"
                        )}
                      >
                        <span className="flex items-center gap-2.5">
                          {formData.type && (() => {
                            const selected = messageTypes.find(t => t.value === formData.type);
                            if (selected) {
                              const Icon = selected.icon;
                              return <Icon className="h-4 w-4 text-brand-gold" />;
                            }
                            return null;
                          })()}
                          <span className={formData.type ? "text-brand-charcoal" : ""}>
                            {messageTypes.find(t => t.value === formData.type)?.label || "请选择留言类型"}
                          </span>
                        </span>
                        <ChevronDown className={cn(
                          "h-4 w-4 text-brand-charcoal/40 transition-transform duration-200",
                          isTypeDropdownOpen && "rotate-180"
                        )} />
                      </button>

                      {/* 下拉选项 */}
                      <AnimatePresence>
                        {isTypeDropdownOpen && (
                          <m.div
                            initial={{ opacity: 0, y: -8, scale: 0.96 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -8, scale: 0.96 }}
                            transition={{ duration: 0.15, ease: "easeOut" }}
                            className="absolute left-0 right-0 top-full z-50 mt-1.5 overflow-hidden rounded-xl border border-brand-beige/50 bg-white/95 shadow-lg shadow-brand-charcoal/5 backdrop-blur-sm"
                          >
                            {messageTypes.filter(t => t.value !== "").map((type, index) => {
                              const Icon = type.icon;
                              const isSelected = formData.type === type.value;
                              return (
                                <button
                                  key={type.value}
                                  type="button"
                                  onClick={() => {
                                    setFormData(prev => ({ ...prev, type: type.value }));
                                    setIsTypeDropdownOpen(false);
                                    if (errors.type) {
                                      setErrors(prev => ({ ...prev, type: "" }));
                                    }
                                  }}
                                  className={cn(
                                    "flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-all",
                                    isSelected
                                      ? "bg-brand-gold/10 text-brand-charcoal"
                                      : "text-brand-charcoal/70 hover:bg-brand-beige/30 hover:text-brand-charcoal",
                                    index !== messageTypes.filter(t => t.value !== "").length - 1 && "border-b border-brand-beige/30"
                                  )}
                                >
                                  <Icon className={cn(
                                    "h-4 w-4 transition-colors",
                                    isSelected ? "text-brand-gold" : "text-brand-charcoal/40"
                                  )} />
                                  <span>{type.label}</span>
                                  {isSelected && (
                                    <CheckCircle className="ml-auto h-4 w-4 text-brand-gold" />
                                  )}
                                </button>
                              );
                            })}
                          </m.div>
                        )}
                      </AnimatePresence>
                      {errors.type && <p className="mt-1.5 text-xs text-red-500">{errors.type}</p>}
                    </div>

                    {/* 留言内容 */}
                    <div>
                      <label htmlFor="content" className="mb-1.5 block text-sm font-medium text-brand-charcoal">
                        留言内容 <span className="text-red-500">*</span>
                      </label>
                      <textarea
                        id="content"
                        name="content"
                        value={formData.content}
                        onChange={handleChange}
                        placeholder="请输入您的留言内容..."
                        rows={5}
                        className={cn(
                          "w-full resize-none rounded-xl border bg-white/90 px-4 py-3 text-sm outline-none transition-all backdrop-blur-sm",
                          errors.content ? "border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-100" : "border-brand-beige/50 focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/10"
                        )}
                      />
                      {errors.content && <p className="mt-1.5 text-xs text-red-500">{errors.content}</p>}
                    </div>

                    <button
                      type="submit"
                      disabled={status === "loading"}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-gold py-3.5 text-sm font-medium text-white shadow-lg shadow-brand-gold/20 transition-all hover:bg-brand-gold/90 hover:shadow-xl hover:shadow-brand-gold/30 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {status === "loading" ? (
                        <><Loader2 className="h-4 w-4 animate-spin" /><span>提交中...</span></>
                      ) : (
                        <><Send className="h-4 w-4" /><span>提交留言</span></>
                      )}
                    </button>
                  </form>

                  {/* 版权信息 */}
                  <p className="mt-6 text-center text-xs text-brand-charcoal/40">
                    © {new Date().getFullYear()} {copyright}
                  </p>
                </m.div>
                  )}
                </AnimatePresence>
              </div>
            </m.div>

            {/* 展开/收起按钮 */}
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="group flex items-center justify-center rounded-b-2xl bg-[#EBE8DB] px-10 py-2.5 shadow-sm lg:px-14 lg:py-3"
            >
              <m.div
                className="flex flex-col items-center"
                animate={{
                  rotate: isExpanded ? 180 : 0,
                  scale: 1
                }}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
              >
                <ChevronDown className="h-7 w-7 text-brand-gold lg:h-8 lg:w-8" />
                <ChevronDown className="-mt-5 h-7 w-7 text-brand-gold lg:h-8 lg:w-8" />
              </m.div>
            </button>
          </div>
        </m.div>
      </m.div>

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
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{
              duration: 0.35,
              ease: [0.32, 0.72, 0, 1]
            }}
            className="fixed bottom-2 left-3 right-3 z-50 sm:bottom-4 sm:left-6 sm:right-6 lg:bottom-6 lg:left-16 lg:right-16"
            role="banner"
          >
            <nav
              className={cn(
                "flex items-center justify-between",
                "rounded-2xl bg-white/95 px-3 py-2.5 shadow-lg backdrop-blur-md",
                "sm:px-5 sm:py-4 lg:rounded-3xl lg:px-8 lg:py-5"
              )}
              aria-label="联系我们页导航"
            >
              {/* 左侧主导航 - 联系我们 */}
              <Link
                href="/contact"
                className="group flex items-center gap-2 transition-opacity active:opacity-70 sm:gap-4 sm:hover:opacity-80"
              >
                {/* 图标容器 */}
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-gold/10 sm:h-16 sm:w-16 lg:h-20 lg:w-20">
                  <ContactIcon className="h-6 w-6 sm:h-10 sm:w-10 lg:h-14 lg:w-14" />
                </div>
                {/* 文字 */}
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-brand-charcoal sm:text-lg lg:text-2xl">
                    联系我们
                  </span>
                  <span className="font-serif text-[10px] uppercase tracking-wide text-brand-gold/70 sm:text-xs lg:text-base">
                    Contact
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
    </>
  );
}


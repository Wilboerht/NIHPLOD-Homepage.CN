"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { m, AnimatePresence } from "framer-motion";
import { ChevronDown, ShoppingBag, BookMarked, Sparkles, Mail, Phone, MapPin, Send, CheckCircle, AlertCircle, Loader2, Home } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 底部导航项配置
 */
const bottomNavItems = [
  { href: "/products", label: "商城", labelEn: "Products", icon: ShoppingBag },
  { href: "/story", label: "关于旎柏", labelEn: "Story", icon: BookMarked },
  { href: "/ritual", label: "护肤仪式", labelEn: "Ritual", icon: Sparkles },
];

// 自定义图标组件
const MailIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="M22 6l-10 7L2 6" />
  </svg>
);

const PhoneIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" />
  </svg>
);

const LocationIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

// 标签页配置
type TabId = "email" | "phone" | "address";

interface TabConfig {
  id: TabId;
  label: string;
  icon: React.FC<{ className?: string }>;
}

const tabs: TabConfig[] = [
  { id: "email", label: "电子邮箱", icon: MailIcon },
  { id: "phone", label: "客服热线", icon: PhoneIcon },
  { id: "address", label: "公司地址", icon: LocationIcon },
];

// 各标签页内容
interface TabContent {
  title: string;
  value: string;
  href: string | null;
  description: string;
}

const tabContents: Record<TabId, TabContent> = {
  email: {
    title: "电子邮箱",
    value: "contact@nihplod.com",
    href: "mailto:contact@nihplod.com",
    description: "发送邮件给我们，我们会在24小时内回复您",
  },
  phone: {
    title: "客服热线",
    value: "+86 400-888-8888",
    href: "tel:+864008888888",
    description: "工作时间：周一至周五 9:00-18:00",
  },
  address: {
    title: "公司地址",
    value: "中国上海市静安区南京西路1788号",
    href: null,
    description: "欢迎预约到访，体验我们的产品与服务",
  },
};

type FormStatus = "idle" | "loading" | "success" | "error";

interface FormData {
  name: string;
  email: string;
  content: string;
  website: string; // 蜜罐字段
}

/**
 * 联系我们页面内容组件
 * 样式参考 StoryContent，使用独立的导航栏
 */
export function ContactContent() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId | null>(null);
  const [formData, setFormData] = useState<FormData>({
    name: "",
    email: "",
    content: "",
    website: "",
  });
  const [status, setStatus] = useState<FormStatus>("idle");
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

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
        setFormData({ name: "", email: "", content: "", website: "" });
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
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  return (
    <>
      {/* 全屏背景容器 */}
      <div className={cn(
        "fixed inset-0 transition-all duration-500 ease-out",
        isExpanded ? "bottom-0" : "bottom-28 lg:bottom-32"
      )}>
        {/* 背景图片 */}
        <div className="absolute inset-0 z-0">
          <Image
            src="/images/contact-bg.jpg"
            alt="联系我们"
            fill
            priority
            className="object-cover"
            sizes="100vw"
          />
        </div>

        {/* 主内容区域 */}
        <m.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className={cn(
            "absolute left-6 right-6 top-4 z-20 transition-all duration-500 ease-out sm:left-10 sm:right-10 lg:left-16 lg:right-16 lg:top-6",
            isExpanded ? "bottom-4 lg:bottom-6" : ""
          )}
        >
          <div className="flex h-full flex-col items-center">
            {/* 主内容区域 */}
            <div className={cn(
              "w-full overflow-hidden rounded-2xl bg-brand-gold/10 backdrop-blur-md lg:rounded-3xl",
              "transition-all duration-500 ease-out",
              isExpanded ? "flex-1" : ""
            )}>
              <div className={cn(
                "flex flex-col px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10",
                isExpanded ? "h-full justify-center overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]" : ""
              )}>
                {/* 页面标题 */}
                {!activeTab && (
                  <div className={cn("text-center", isExpanded ? "mb-6 sm:mb-8" : "")}>
                    <p className="text-xs uppercase tracking-widest text-brand-gold sm:text-sm md:text-base">
                      CONTACT US
                    </p>
                    <h1 className="mt-1 font-serif text-2xl text-brand-charcoal sm:text-3xl md:text-4xl">
                      联系我们
                    </h1>
                    <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-brand-charcoal/70 sm:mt-3 sm:text-base md:text-lg">
                      有任何问题或建议？我们期待与您的每一次交流
                    </p>
                  </div>
                )}

                {/* 展开后显示的内容 */}
                <AnimatePresence mode="wait">
                  {isExpanded && !activeTab && (
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

                      {/* 3个大标签按钮 */}
                      <div className="flex w-full max-w-3xl items-stretch justify-center">
                        {tabs.map((tab, index) => {
                          const Icon = tab.icon;
                          return (
                            <m.button
                              key={tab.id}
                              type="button"
                              onClick={() => setActiveTab(tab.id)}
                              className={cn(
                                "group relative flex flex-1 flex-col items-center justify-center gap-3 px-4 py-6 transition-all duration-300 sm:gap-4 sm:px-8 sm:py-8 md:py-10",
                                index < tabs.length - 1 && "border-r border-brand-charcoal/20"
                              )}
                              initial={{ opacity: 0, y: 15 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.4, delay: 0.15 + index * 0.06, ease: "easeOut" }}
                              whileHover={{ scale: 1.03 }}
                              whileTap={{ scale: 0.97 }}
                            >
                              <div className="flex h-14 w-14 items-center justify-center sm:h-20 sm:w-20 md:h-24 md:w-24 lg:h-28 lg:w-28">
                                <Icon className="h-12 w-12 text-brand-charcoal/70 transition-colors duration-300 group-hover:text-brand-gold sm:h-16 sm:w-16 md:h-20 md:w-20 lg:h-24 lg:w-24" />
                              </div>
                              <span className="text-xs font-medium text-brand-charcoal/70 transition-colors duration-300 group-hover:text-brand-charcoal sm:text-sm md:text-base lg:text-lg">
                                {tab.label}
                              </span>
                            </m.button>
                          );
                        })}
                      </div>
                    </m.div>
                  )}

                  {/* 选中标签后显示的内容 */}
                  {isExpanded && activeTab && (
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
                          {tabContents[activeTab].title}
                        </m.h2>
                        <div className="w-16 sm:w-20" />
                      </div>

                      {/* 内容区域 */}
                      <div className="flex-1 overflow-y-auto rounded-xl border border-brand-beige bg-white/80 p-4 backdrop-blur-sm [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] sm:p-6 md:p-8">
                        {/* 联系信息 */}
                        <m.div
                          className="mb-8 text-center"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3, delay: 0.1 }}
                        >
                          <p className="text-lg font-medium text-brand-charcoal sm:text-xl md:text-2xl">
                            {tabContents[activeTab].href ? (
                              <a href={tabContents[activeTab].href!} className="hover:text-brand-gold">
                                {tabContents[activeTab].value}
                              </a>
                            ) : (
                              tabContents[activeTab].value
                            )}
                          </p>
                          <p className="mt-2 text-sm text-brand-charcoal/70">
                            {tabContents[activeTab].description}
                          </p>
                        </m.div>

                        {/* 留言表单 */}
                        <m.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3, delay: 0.2 }}
                        >
                          <h3 className="mb-4 text-center font-serif text-lg text-brand-charcoal">给我们留言</h3>

                          {status === "success" && (
                            <div className="mb-4 flex items-center justify-center gap-2 rounded-lg bg-green-50 p-3 text-green-700">
                              <CheckCircle className="h-5 w-5" />
                              <span className="text-sm">{message}</span>
                            </div>
                          )}
                          {status === "error" && (
                            <div className="mb-4 flex items-center justify-center gap-2 rounded-lg bg-red-50 p-3 text-red-700">
                              <AlertCircle className="h-5 w-5" />
                              <span className="text-sm">{message}</span>
                            </div>
                          )}

                          <form onSubmit={handleSubmit} className="mx-auto max-w-md space-y-4">
                            <input type="text" name="website" value={formData.website} onChange={handleChange} autoComplete="off" tabIndex={-1} className="absolute left-[-9999px] top-0 h-0 w-0 opacity-0" aria-hidden="true" />

                            <div>
                              <label htmlFor="name" className="mb-1 block text-sm text-brand-charcoal">姓名 <span className="text-red-500">*</span></label>
                              <input type="text" id="name" name="name" value={formData.name} onChange={handleChange} placeholder="请输入您的姓名" autoComplete="name" className={cn("w-full rounded-lg border bg-white px-4 py-3 text-base outline-none transition-colors md:py-2.5 md:text-sm", errors.name ? "border-red-300 focus:border-red-500" : "border-brand-beige focus:border-brand-gold")} />
                              {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
                            </div>

                            <div>
                              <label htmlFor="email" className="mb-1 block text-sm text-brand-charcoal">邮箱 <span className="text-red-500">*</span></label>
                              <input type="email" id="email" name="email" value={formData.email} onChange={handleChange} placeholder="请输入您的邮箱" autoComplete="email" inputMode="email" className={cn("w-full rounded-lg border bg-white px-4 py-3 text-base outline-none transition-colors md:py-2.5 md:text-sm", errors.email ? "border-red-300 focus:border-red-500" : "border-brand-beige focus:border-brand-gold")} />
                              {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email}</p>}
                            </div>

                            <div>
                              <label htmlFor="content" className="mb-1 block text-sm text-brand-charcoal">留言内容 <span className="text-red-500">*</span></label>
                              <textarea id="content" name="content" value={formData.content} onChange={handleChange} placeholder="请输入您的留言内容..." rows={4} className={cn("w-full resize-none rounded-lg border bg-white px-4 py-3 text-base outline-none transition-colors md:py-2.5 md:text-sm", errors.content ? "border-red-300 focus:border-red-500" : "border-brand-beige focus:border-brand-gold")} />
                              {errors.content && <p className="mt-1 text-xs text-red-500">{errors.content}</p>}
                            </div>

                            <button type="submit" disabled={status === "loading"} className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-gold py-3 font-medium text-white transition-colors hover:bg-brand-gold/90 disabled:cursor-not-allowed disabled:opacity-60">
                              {status === "loading" ? (<><Loader2 className="h-4 w-4 animate-spin" /><span>提交中...</span></>) : (<><Send className="h-4 w-4" /><span>提交留言</span></>)}
                            </button>
                          </form>
                        </m.div>
                      </div>
                    </m.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* 展开/收起按钮 */}
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="group flex items-center justify-center rounded-b-2xl bg-brand-gold/10 px-10 py-2.5 shadow-sm backdrop-blur-md lg:px-14 lg:py-3"
            >
              <m.div
                className="flex flex-col items-center transition-transform duration-200 group-hover:scale-110"
                animate={{ rotate: isExpanded ? 180 : 0 }}
                transition={{ duration: 0.3 }}
              >
                <ChevronDown className="h-7 w-7 text-brand-gold transition-colors duration-200 group-hover:text-brand-gold/80 lg:h-8 lg:w-8" />
                <ChevronDown className="-mt-5 h-7 w-7 text-brand-gold transition-colors duration-200 group-hover:text-brand-gold/80 lg:h-8 lg:w-8" />
              </m.div>
            </button>
          </div>
        </m.div>
      </div>

      {/* 底部导航栏 */}
      <AnimatePresence>
        {!isExpanded && (
          <m.header
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="fixed bottom-4 left-6 right-6 z-50 sm:left-10 sm:right-10 lg:bottom-6 lg:left-16 lg:right-16"
            role="banner"
          >
            <nav className={cn("flex items-center justify-between", "rounded-2xl bg-white/95 px-5 py-4 shadow-lg backdrop-blur-md", "lg:rounded-3xl lg:px-8 lg:py-5")} aria-label="联系我们页导航">
              <Link href="/contact" className="group flex items-center gap-2 transition-opacity hover:opacity-80 sm:gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-gold/10 sm:h-12 sm:w-12 lg:h-14 lg:w-14">
                  <Mail className="h-5 w-5 text-brand-gold sm:h-6 sm:w-6 lg:h-7 lg:w-7" />
                </div>
                <div className="flex flex-col">
                  <span className="text-lg font-semibold text-brand-charcoal sm:text-xl lg:text-2xl">联系我们</span>
                  <span className="font-serif text-xs uppercase tracking-wide text-brand-gold/70 sm:text-sm lg:text-base">Contact</span>
                </div>
              </Link>

              <div className="flex items-center gap-3 sm:gap-5 lg:gap-8">
                {bottomNavItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link key={item.href} href={item.href} className="group flex flex-col items-center gap-0.5 transition-opacity hover:opacity-80 sm:gap-1">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl transition-colors group-hover:bg-brand-beige/50 sm:h-11 sm:w-11 lg:h-12 lg:w-12">
                        <Icon className="h-5 w-5 text-brand-gold sm:h-6 sm:w-6 lg:h-7 lg:w-7" />
                      </div>
                      <span className="hidden text-xs text-brand-charcoal/70 sm:block lg:text-sm">{item.label}</span>
                      <span className="hidden font-serif text-[10px] uppercase tracking-wide text-brand-charcoal/50 sm:block lg:text-xs">{item.labelEn}</span>
                    </Link>
                  );
                })}
                {/* 回到首页按钮 */}
                <Link
                  href="/"
                  className="group flex flex-col items-center gap-0.5 transition-opacity hover:opacity-80 sm:gap-1"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl transition-colors group-hover:bg-brand-beige/50 sm:h-11 sm:w-11 lg:h-12 lg:w-12">
                    <Home className="h-5 w-5 text-brand-gold sm:h-6 sm:w-6 lg:h-7 lg:w-7" />
                  </div>
                  <span className="hidden text-xs text-brand-charcoal/70 sm:block lg:text-sm">首页</span>
                  <span className="hidden font-serif text-[10px] uppercase tracking-wide text-brand-charcoal/50 sm:block lg:text-xs">Home</span>
                </Link>
              </div>
            </nav>
          </m.header>
        )}
      </AnimatePresence>
    </>
  );
}


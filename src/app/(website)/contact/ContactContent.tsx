"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { m, AnimatePresence } from "framer-motion";
import {
  Send,
  CheckCircle,
  Loader2,
  MessageSquare,
  Briefcase,
  MessageCircle,
  AlertTriangle,
  HelpCircle,
  ChevronDown,
  Home,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks";
import { apiPost, ApiError } from "@/lib/api-client";
import type { ContactPageContent } from "@/types/page-content";

// ============================================
// Constants
// ============================================

const iconMap: Record<string, typeof HelpCircle> = {
  consultation: MessageSquare,
  cooperation: Briefcase,
  feedback: MessageCircle,
  complaint: AlertTriangle,
  other: HelpCircle,
};

const defaultMessageTypes = [
  { value: "consultation", label: "产品咨询" },
  { value: "cooperation", label: "商务合作" },
  { value: "feedback", label: "使用反馈" },
  { value: "complaint", label: "投诉建议" },
  { value: "other", label: "其他问题" },
];

type FormStatus = "idle" | "loading" | "success" | "error";

interface FormData {
  name: string;
  phone: string;
  type: string;
  content: string;
  website: string;
}

interface ContactContentProps {
  content?: ContactPageContent;
}

// ============================================
// Main Component
// ============================================

export function ContactContent({ content }: ContactContentProps) {
  const title = content?.title || { en: "CONTACT US", zh: "联系我们" };
  const description = content?.description || "有任何问题或建议？我们期待与您的每一次交流";
  const messageTypesData = content?.messageTypes || defaultMessageTypes;
  const searchParams = useSearchParams();

  const messageTypes = [
    { value: "", label: "请选择留言类型", icon: HelpCircle },
    ...messageTypesData.map((t) => ({
      value: t.value,
      label: t.label,
      icon: iconMap[t.value] || HelpCircle,
    })),
  ];

  const [formData, setFormData] = useState<FormData>({
    name: "",
    phone: "",
    type: "",
    content: "",
    website: "",
  });
  const [status, setStatus] = useState<FormStatus>("idle");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { success: toastSuccess, error: toastError } = useToast();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const [desktopMenuOpen, setDesktopMenuOpen] = useState(false);
  const desktopMenuRef = useRef<HTMLDivElement>(null);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Per-field validation for onBlur
  const validateField = (name: string, value: string): string => {
    switch (name) {
      case "name":
        if (!value.trim()) return "请输入您的称呼";
        if (value.length < 2) return "称呼至少2个字符";
        if (value.length > 50) return "称呼最多50个字符";
        return "";
      case "phone":
        if (!value.trim()) return "请输入您的手机号";
        if (!/^1[3456789]\d{9}$/.test(value)) return "请输入有效的11位手机号";
        return "";
      case "type":
        if (!value) return "请选择留言类型";
        return "";
      case "content":
        if (!value.trim()) return "请输入留言内容";
        if (value.length < 10) return "留言内容至少10个字符";
        if (value.length > 2000) return "留言内容最多2000个字符";
        return "";
      default:
        return "";
    }
  };

  const handleBlur = (
    e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    const error = validateField(name, value);
    setErrors((prev) => {
      if (error && prev[name] !== error) return { ...prev, [name]: error };
      if (!error && prev[name]) {
        const next = { ...prev };
        delete next[name];
        return next;
      }
      return prev;
    });
  };

  // URL type 参数同步到表单（渲染阶段同步派生状态，避免 effect 内 setState）
  const typeParam = searchParams.get("type");
  const [prevTypeParam, setPrevTypeParam] = useState<string | null>(null);
  if (prevTypeParam !== typeParam) {
    setPrevTypeParam(typeParam);
    if (typeParam) {
      const match = messageTypesData.find((t) => t.value === typeParam);
      if (match) setFormData((prev) => ({ ...prev, type: typeParam }));
    }
  }

  useEffect(() => {
    if (mobileMenuOpen) {
      const scrollY = window.scrollY;
      document.body.style.position = "fixed";
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = "100%";
      return () => {
        document.body.style.position = "";
        document.body.style.top = "";
        document.body.style.width = "";
        window.scrollTo(0, scrollY);
      };
    }
  }, [mobileMenuOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (desktopMenuRef.current && !desktopMenuRef.current.contains(event.target as Node)) {
        setDesktopMenuOpen(false);
      }
    };
    if (desktopMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [desktopMenuOpen]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) newErrors.name = "请输入您的称呼";
    else if (formData.name.length < 2) newErrors.name = "称呼至少2个字符";
    else if (formData.name.length > 50) newErrors.name = "称呼最多50个字符";
    if (!formData.phone.trim()) newErrors.phone = "请输入您的手机号";
    else if (!/^1[3456789]\d{9}$/.test(formData.phone)) newErrors.phone = "请输入有效的11位手机号";
    if (!formData.type) newErrors.type = "请选择留言类型";
    if (!formData.content.trim()) newErrors.content = "请输入留言内容";
    else if (formData.content.length < 10) newErrors.content = "留言内容至少10个字符";
    else if (formData.content.length > 2000) newErrors.content = "留言内容最多2000个字符";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === "loading") return; // 防止重复提交
    if (!validateForm()) return;
    setStatus("loading");
    try {
      const data = await apiPost<{ message?: string }>("/api/contact", {
        ...formData,
        name: formData.name.trim(),
        phone: formData.phone.trim(),
        content: formData.content.trim(),
      });
      setStatus("success");
      toastSuccess(data.message || "留言已提交");
      setFormData({ name: "", phone: "", type: "", content: "", website: "" });
    } catch (error) {
      setStatus("error");
      toastError(error instanceof ApiError ? error.message : "网络错误，请检查您的网络连接");
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: "" }));
    // Auto-grow textarea (capped at 200px)
    if (e.target instanceof HTMLTextAreaElement) {
      e.target.style.height = "auto";
      e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
    }
  };

  return (
    <div className="mb-[-7rem] flex min-h-dvh animate-fade-in flex-col bg-[#fefcf8] lg:mb-[-6rem]">
      {/* Top Bar */}
      <nav
        className="fixed left-0 right-0 top-0 z-50 flex w-full items-center bg-[#fefcf8]/80 px-6 py-6 backdrop-blur-md md:px-20"
        style={{ pointerEvents: "none" }}
        aria-label="主导航"
      >
        <div
          className="relative flex w-full items-center justify-center md:justify-between"
          style={{ pointerEvents: "auto" }}
        >
          {/* Logo - mobile centered, desktop left */}
          <Link href="/">
            <div className="relative h-[30px] w-[107px] md:h-[40px] md:w-[143px]">
              <Image
                src="/images/NIHPLOD-logo.svg"
                alt="NIHPLOD"
                fill
                className="object-contain object-center md:object-left"
                priority
              />
            </div>
          </Link>

          {/* Desktop nav links */}
          <div className="hidden items-center gap-1 md:flex">
            <Link
              href="/terms"
              className="group relative px-3 py-2 text-[15px] font-light tracking-[0.15em] text-brand-charcoal transition-colors duration-500 hover:text-brand-charcoal-light"
            >
              服务条款
              <span className="absolute bottom-1 left-1/2 h-[1px] w-0 -translate-x-1/2 bg-current transition-all duration-500 group-hover:w-[calc(100%-1.5rem)]" />
            </Link>
            <Link
              href="/privacy"
              className="group relative px-3 py-2 text-[15px] font-light tracking-[0.15em] text-brand-charcoal transition-colors duration-500 hover:text-brand-charcoal-light"
            >
              隐私政策
              <span className="absolute bottom-1 left-1/2 h-[1px] w-0 -translate-x-1/2 bg-current transition-all duration-500 group-hover:w-[calc(100%-1.5rem)]" />
            </Link>

            {/* Desktop More Menu */}
            <div ref={desktopMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setDesktopMenuOpen((prev) => !prev)}
                className="group inline-flex items-center gap-1.5 px-3 py-2 text-[15px] font-light tracking-[0.15em] text-brand-charcoal transition-colors duration-500 hover:text-brand-charcoal-light"
                aria-expanded={desktopMenuOpen}
              >
                菜单
                <ChevronDown
                  className={`h-4 w-4 transition-transform duration-500 ${desktopMenuOpen ? "rotate-180" : ""}`}
                />
              </button>

              <AnimatePresence>
                {desktopMenuOpen && (
                  <m.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                    className="absolute right-0 top-full z-50 mt-2 w-56 rounded-2xl border border-brand-charcoal/5 bg-[#FBF8F0] p-2 shadow-[0_2px_4px_-1px_rgba(0,38,62,0.05),0_8px_16px_-2px_rgba(0,38,62,0.08),0_24px_48px_-6px_rgba(0,38,62,0.06)]"
                  >
                    <Link
                      href="/products"
                      onClick={() => setDesktopMenuOpen(false)}
                      className="block rounded-xl px-4 py-3 text-[15px] font-light tracking-[0.15em] text-brand-charcoal transition-colors hover:bg-brand-charcoal/5"
                    >
                      产品系列
                    </Link>
                    <div className="h-px origin-top scale-y-50 bg-brand-charcoal/[0.04]" />
                    <Link
                      href="/guide"
                      onClick={() => setDesktopMenuOpen(false)}
                      className="block rounded-xl px-4 py-3 text-[15px] font-light tracking-[0.15em] text-brand-charcoal transition-colors hover:bg-brand-charcoal/5"
                    >
                      护肤指南
                    </Link>
                    <div className="h-px origin-top scale-y-50 bg-brand-charcoal/[0.04]" />
                    <Link
                      href="/faq"
                      onClick={() => setDesktopMenuOpen(false)}
                      className="block rounded-xl px-4 py-3 text-[15px] font-light tracking-[0.15em] text-brand-charcoal transition-colors hover:bg-brand-charcoal/5"
                    >
                      常见问题
                    </Link>
                    <div className="h-px origin-top scale-y-50 bg-brand-charcoal/[0.04]" />
                    <Link
                      href="/about"
                      onClick={() => setDesktopMenuOpen(false)}
                      className="block rounded-xl px-4 py-3 text-[15px] font-light tracking-[0.15em] text-brand-charcoal transition-colors hover:bg-brand-charcoal/5"
                    >
                      品牌故事
                    </Link>
                  </m.div>
                )}
              </AnimatePresence>
            </div>

            <Link
              href="/"
              className="group relative inline-flex items-center gap-2 px-3 py-2 text-[15px] font-light tracking-[0.15em] text-brand-charcoal transition-colors duration-500 hover:text-brand-charcoal-light"
            >
              <Home className="h-4 w-4" /> 返回首页
              <span className="absolute bottom-1 left-1/2 h-[1px] w-0 -translate-x-1/2 bg-current transition-all duration-500 group-hover:w-[calc(100%-1.5rem)]" />
            </Link>
          </div>

          {/* Mobile hamburger button */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="absolute left-0 flex h-10 w-10 items-center justify-center md:hidden"
            aria-label="打开菜单"
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-nav-panel"
          >
            <Menu className="h-5 w-5 text-brand-charcoal" />
          </button>
        </div>
      </nav>

      {/* Mobile Slide-in Menu Panel */}
      <div
        id="mobile-nav-panel"
        ref={mobileMenuRef}
        role="dialog"
        aria-modal={mobileMenuOpen}
        aria-label="导航菜单"
        className={`fixed inset-0 z-[100] transition-all duration-500 md:hidden ${mobileMenuOpen ? "visible opacity-100" : "invisible opacity-0"}`}
      >
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-[#00263E]/20 backdrop-blur-sm"
          onClick={() => setMobileMenuOpen(false)}
        />

        {/* Slide-in panel from left */}
        <div
          className={`absolute left-0 top-0 h-full w-[min(300px,80vw)] transform rounded-r-3xl bg-[#fefcf8] pb-[calc(1.25rem+env(safe-area-inset-bottom,16px))] pt-[calc(1.25rem+env(safe-area-inset-top,0px))] shadow-2xl transition-transform duration-500 ease-out ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full"}`}
        >
          <div className="flex h-full flex-col px-6">
            {/* Logo + 关闭按钮同行 */}
            <div className="mb-8 flex items-center justify-between rounded-xl px-4 py-4">
              <Link href="/" onClick={() => setMobileMenuOpen(false)}>
                <div className="relative h-[30px] w-[107px]">
                  <Image
                    src="/images/NIHPLOD-logo.svg"
                    alt="NIHPLOD"
                    fill
                    className="object-contain object-left"
                  />
                </div>
              </Link>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full transition-colors active:bg-brand-charcoal/5"
                aria-label="关闭菜单"
              >
                <X className="h-5 w-5 text-brand-charcoal" strokeWidth={1.5} />
              </button>
            </div>

            {/* Nav links */}
            <div className="flex flex-1 flex-col gap-2 overflow-y-auto overscroll-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <Link
                href="/terms"
                onClick={() => setMobileMenuOpen(false)}
                className="flex h-12 items-center rounded-xl px-4 text-[15px] font-light tracking-[0.08em] text-brand-charcoal transition-colors active:bg-brand-charcoal/5"
              >
                服务条款
              </Link>
              <Link
                href="/privacy"
                onClick={() => setMobileMenuOpen(false)}
                className="flex h-12 items-center rounded-xl px-4 text-[15px] font-light tracking-[0.08em] text-brand-charcoal transition-colors active:bg-brand-charcoal/5"
              >
                隐私政策
              </Link>
            </div>

            {/* 返回首页 */}
            <Link
              href="/"
              onClick={() => setMobileMenuOpen(false)}
              className="mt-8 flex h-12 items-center gap-2 rounded-xl px-4 text-[15px] font-light tracking-[0.08em] text-brand-charcoal transition-colors active:bg-brand-charcoal/5"
            >
              <Home className="h-5 w-5" />
              返回首页
            </Link>
          </div>
        </div>
      </div>

      {/* Spacer */}
      <div className="h-[88px] shrink-0 md:h-[88px]" />

      {/* Header */}
      <div className="pb-8 pt-8 text-center md:pb-12 md:pt-20">
        <h1 className="mb-2 text-[19px] font-normal tracking-[0.15em] text-brand-charcoal md:mb-4 md:text-4xl md:font-light md:tracking-wider">
          {title.zh}
        </h1>
        <div className="mx-auto mb-4 w-[70px] border-b border-brand-primary md:hidden" />
        <p className="mx-auto max-w-md px-6 text-[13px] font-light leading-[1.8] tracking-[0.06em] text-brand-charcoal/60 md:px-0 md:text-base md:tracking-[0.12em]">
          {description}
        </p>
      </div>

      {/* Contact Form */}
      <main className="container mx-auto flex-1 px-6 pb-10 pt-0 md:px-8 md:pb-16 lg:px-12 xl:px-16">
        <div className="mx-auto max-w-xl">
          {status === "success" ? (
            <div className="py-16 text-center">
              <CheckCircle className="mx-auto mb-4 h-12 w-12 text-green-500" />
              <h2 className="mb-2 text-xl font-medium text-brand-charcoal">留言已提交</h2>
              <p className="text-brand-charcoal/60">感谢您的留言，我们会尽快回复</p>
              <Link
                href="/"
                className="mt-6 inline-block text-[15px] font-light tracking-[0.12em] text-brand-charcoal hover:underline"
              >
                返回首页
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 md:space-y-5">
              {/* Honeypot */}
              <input
                type="text"
                name="website"
                value={formData.website}
                onChange={handleChange}
                autoComplete="off"
                tabIndex={-1}
                className="absolute left-[-9999px] opacity-0"
                aria-hidden="true"
              />

              {/* Name + Phone */}
              <div className="grid gap-4 sm:grid-cols-2 md:gap-5">
                <div>
                  <label
                    htmlFor="name"
                    className="mb-1 block text-[13px] font-light tracking-[0.06em] text-brand-charcoal/70 md:mb-1.5 md:text-[14px] md:tracking-[0.12em]"
                  >
                    称呼 <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    placeholder="您的称呼"
                    autoComplete="name"
                    maxLength={50}
                    className={cn(
                      "w-full rounded-none border-0 border-b px-0 py-3 text-base font-light tracking-wide outline-none transition-colors placeholder:text-sm placeholder:uppercase placeholder:tracking-wider placeholder:text-brand-charcoal/40 md:rounded-lg md:border md:px-4 md:py-3.5 md:text-[15px] md:tracking-[0.06em] md:placeholder:text-[15px] md:placeholder:font-light md:placeholder:normal-case md:placeholder:tracking-[0.06em]",
                      errors.name
                        ? "border-red-300 focus:border-red-500 md:focus:ring-2 md:focus:ring-red-100"
                        : "border-brand-charcoal/25 focus:border-brand-primary/60 md:border-brand-charcoal/20 md:focus:border-[#00263E]/40 md:focus:ring-4 md:focus:ring-[#00263E]/10"
                    )}
                  />
                  {errors.name && <p className="mt-1.5 text-xs text-red-500">{errors.name}</p>}
                </div>
                <div>
                  <label
                    htmlFor="phone"
                    className="mb-1 block text-[13px] font-light tracking-[0.06em] text-brand-charcoal/70 md:mb-1.5 md:text-[14px] md:tracking-[0.12em]"
                  >
                    手机号 <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="tel"
                    id="phone"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    placeholder="您的手机号"
                    autoComplete="tel"
                    inputMode="tel"
                    maxLength={11}
                    className={cn(
                      "w-full rounded-none border-0 border-b px-0 py-3 text-base font-light tracking-wide outline-none transition-colors placeholder:text-sm placeholder:uppercase placeholder:tracking-wider placeholder:text-brand-charcoal/40 md:rounded-lg md:border md:px-4 md:py-3.5 md:text-[15px] md:tracking-[0.06em] md:placeholder:text-[15px] md:placeholder:font-light md:placeholder:normal-case md:placeholder:tracking-[0.06em]",
                      errors.phone
                        ? "border-red-300 focus:border-red-500 md:focus:ring-2 md:focus:ring-red-100"
                        : "border-brand-charcoal/25 focus:border-brand-primary/60 md:border-brand-charcoal/20 md:focus:border-[#00263E]/40 md:focus:ring-4 md:focus:ring-[#00263E]/10"
                    )}
                  />
                  {errors.phone && <p className="mt-1.5 text-xs text-red-500">{errors.phone}</p>}
                </div>
              </div>

              {/* Message Type Dropdown */}
              <div>
                <label
                  htmlFor="type"
                  className="mb-1 block text-[13px] font-light tracking-[0.06em] text-brand-charcoal/70 md:mb-1.5 md:text-[14px] md:tracking-[0.12em]"
                >
                  留言类型 <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <select
                    id="type"
                    name="type"
                    value={formData.type}
                    onChange={(e) => {
                      setFormData((prev) => ({ ...prev, type: e.target.value }));
                      if (errors.type) setErrors((prev) => ({ ...prev, type: "" }));
                    }}
                    onBlur={handleBlur}
                    className={cn(
                      "w-full appearance-none rounded-none border-0 border-b px-0 py-3 pr-8 text-base font-light tracking-wide outline-none transition-colors md:rounded-lg md:border md:px-4 md:py-3.5 md:pr-12 md:text-[15px] md:tracking-[0.06em]",
                      !formData.type && "text-sm text-brand-charcoal/40",
                      errors.type
                        ? "border-red-300 focus:border-red-500 md:focus:ring-2 md:focus:ring-red-100"
                        : "border-brand-charcoal/25 focus:border-brand-primary/60 md:border-brand-charcoal/20 md:hover:border-[#00263E]/40 md:focus:border-[#00263E]/40 md:focus:ring-4 md:focus:ring-[#00263E]/10"
                    )}
                  >
                    {messageTypes.map((type) => (
                      <option key={type.value} value={type.value} disabled={type.value === ""}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-0 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-charcoal/40 md:right-4" />
                </div>
                {errors.type && <p className="mt-1.5 text-xs text-red-500">{errors.type}</p>}
              </div>

              {/* Content */}
              <div>
                <label
                  htmlFor="content"
                  className="mb-1 block text-[13px] font-light tracking-[0.06em] text-brand-charcoal/70 md:mb-1.5 md:text-[14px] md:tracking-[0.12em]"
                >
                  留言内容 <span className="text-red-400">*</span>
                </label>
                <textarea
                  ref={textareaRef}
                  id="content"
                  name="content"
                  value={formData.content}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  placeholder="请输入您的留言内容..."
                  rows={4}
                  maxLength={2000}
                  className={cn(
                    "w-full resize-none rounded-none border-0 border-b px-0 py-3 text-base font-light tracking-wide outline-none transition-colors placeholder:text-sm placeholder:uppercase placeholder:tracking-wider placeholder:text-brand-charcoal/40 md:rounded-lg md:border md:px-4 md:py-3.5 md:text-[15px] md:tracking-[0.06em] md:placeholder:text-[15px] md:placeholder:font-light md:placeholder:normal-case md:placeholder:tracking-[0.06em]",
                    errors.content
                      ? "border-red-300 focus:border-red-500 md:focus:ring-2 md:focus:ring-red-100"
                      : "border-brand-charcoal/25 focus:border-brand-primary/60 md:border-brand-charcoal/20 md:focus:border-[#00263E]/40 md:focus:ring-4 md:focus:ring-[#00263E]/10"
                  )}
                  style={{ maxHeight: "200px" }}
                />
                {errors.content && <p className="mt-1.5 text-xs text-red-500">{errors.content}</p>}
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={status === "loading"}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#00263E]/30 bg-[#00263E]/[0.04] px-6 py-2.5 text-[15px] font-light tracking-[0.08em] text-brand-charcoal transition-colors active:border-[#00263E] active:bg-[#00263E]/10 disabled:opacity-50 md:gap-2 md:bg-transparent md:py-3.5 md:tracking-[0.15em] md:hover:border-[#00263E] md:hover:bg-[#00263E]/5"
              >
                {status === "loading" ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin md:h-4 md:w-4" />
                    提交中...
                  </>
                ) : (
                  <>
                    <Send className="h-3.5 w-3.5 md:h-4 md:w-4" />
                    提交留言
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </main>

      {/* Page Footer */}
      <footer className="md:border-t md:border-brand-charcoal/10">
        <div className="mx-auto overflow-visible px-6 py-6 text-center md:px-8 md:py-10 lg:px-12 xl:px-16">
          <div className="flex items-center justify-center gap-3">
            <span className="text-[11px] font-light tracking-[0.08em] text-brand-charcoal/[0.48] md:tracking-[0.15em]">
              &copy; {new Date().getFullYear()} NIHPLOD. All Rights Reserved.
            </span>
            <span className="text-[11px] font-light text-brand-charcoal/20">|</span>
            {/* 移动端点击弹出二维码 */}
            <button
              type="button"
              onClick={() => setQrModalOpen(true)}
              className="text-[11px] font-light tracking-[0.08em] text-brand-charcoal/[0.48] transition-colors active:text-brand-charcoal/70 md:hidden"
            >
              服务号
            </button>
            {/* PC 端 hover 展示 */}
            <div className="group relative hidden cursor-pointer md:inline-flex">
              <span className="text-[11px] font-light tracking-[0.15em] text-brand-charcoal/[0.48] transition-colors group-hover:text-brand-charcoal/70">
                服务号
              </span>
              <Image
                src="/images/wechat-qrcode.jpg"
                alt="NIHPLOD 微信服务号"
                width={160}
                height={160}
                unoptimized
                className="absolute bottom-full left-1/2 z-50 mb-2 hidden h-auto w-40 -translate-x-1/2 rounded-lg bg-white p-2 shadow-lg group-hover:block"
              />
            </div>
          </div>
        </div>
      </footer>

      {/* 移动端二维码模态框 */}
      <AnimatePresence>
        {qrModalOpen && (
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-brand-charcoal/30 backdrop-blur-sm md:hidden"
            onClick={() => setQrModalOpen(false)}
          >
            <m.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="mx-6 flex flex-col items-center rounded-2xl bg-white p-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <Image
                src="/images/wechat-qrcode.jpg"
                alt="NIHPLOD 微信服务号"
                width={200}
                height={200}
                unoptimized
                className="h-[200px] w-[200px] rounded-lg"
              />
              <p className="mt-4 text-[13px] font-light tracking-[0.06em] text-brand-charcoal/60">
                扫码关注 NIHPLOD 服务号
              </p>
              <button
                type="button"
                onClick={() => setQrModalOpen(false)}
                className="mt-4 flex h-8 w-8 items-center justify-center rounded-full transition-colors active:bg-brand-charcoal/5"
                aria-label="关闭"
              >
                <X className="h-4 w-4 text-brand-charcoal/40" strokeWidth={1.5} />
              </button>
            </m.div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}

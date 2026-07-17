"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { m, AnimatePresence } from "framer-motion";
import { Send, CheckCircle, Loader2, MessageSquare, Briefcase, MessageCircle, AlertTriangle, HelpCircle, ChevronDown, Home, Menu, X } from "lucide-react";
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
  const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);
  const typeDropdownRef = useRef<HTMLDivElement>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const typeParam = searchParams.get("type");
    if (typeParam) {
      const match = messageTypesData.find((t) => t.value === typeParam);
      if (match) setFormData((prev) => ({ ...prev, type: typeParam }));
    }
  }, [searchParams, messageTypesData]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (typeDropdownRef.current && !typeDropdownRef.current.contains(event.target as Node)) {
        setIsTypeDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
  };

  return (
    <div className="animate-fade-in bg-[#fefcf8] min-h-screen flex flex-col pb-[env(safe-area-inset-bottom)]">
      {/* Top Bar */}
      <nav
        className="fixed top-0 left-0 right-0 z-50 flex items-center bg-[#fefcf8]/80 backdrop-blur-md w-full px-6 py-3 md:px-20 md:py-6"
        style={{ pointerEvents: "none" }}
        aria-label="主导航"
      >
        <div className="w-full flex items-center justify-center md:justify-between relative" style={{ pointerEvents: "auto" }}>
          {/* Logo - mobile centered, desktop left */}
          <Link href="/">
            <div className="relative h-[30px] w-[130px] md:h-[40px] md:w-[160px]">
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
          <div className="hidden md:flex items-center gap-10">
            <Link href="/terms" className="text-sm tracking-wider text-[#00263E] hover:text-brand-charcoal-light transition-colors">服务条款</Link>
            <Link href="/privacy" className="text-sm tracking-wider text-[#00263E] hover:text-brand-charcoal-light transition-colors">隐私政策</Link>
            <Link href="/" className="inline-flex items-center gap-1 text-sm tracking-wider text-[#00263E] hover:text-brand-charcoal-light transition-colors"><Home className="h-3.5 w-3.5" /> 返回首页</Link>
          </div>

          {/* Mobile hamburger button */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="md:hidden absolute left-0 flex items-center justify-center w-10 h-10 rounded-full hover:bg-brand-charcoal/5 transition-colors"
            aria-label="打开菜单"
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-nav-panel"
          >
            <Menu className="h-5 w-5 text-[#00263E]" />
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
        className={`fixed inset-0 z-[100] md:hidden transition-all duration-500 ${mobileMenuOpen ? "visible opacity-100" : "invisible opacity-0"}`}
      >
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-[#00263E]/20 backdrop-blur-sm"
          onClick={() => setMobileMenuOpen(false)}
        />

        {/* Slide-in panel from left */}
        <div
          className={`absolute top-0 left-0 h-full w-[min(300px,80vw)] bg-[#FBF8F0] shadow-2xl rounded-r-3xl transform transition-transform duration-500 ease-out pt-[calc(1.25rem+env(safe-area-inset-top,0px))] pb-[calc(1.25rem+env(safe-area-inset-bottom,16px))] ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full"}`}
        >
          <div className="flex flex-col h-full px-6">
            {/* Close button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="self-end flex items-center justify-center w-10 h-10 rounded-full hover:bg-brand-charcoal/5 transition-colors mb-8"
              aria-label="关闭菜单"
            >
              <X className="h-5 w-5 text-[#00263E]" strokeWidth={1.5} />
            </button>

            {/* Logo in panel */}
            <Link href="/" onClick={() => setMobileMenuOpen(false)} className="mb-10">
              <div className="relative h-[30px] w-[130px]">
                <Image
                  src="/images/NIHPLOD-logo.svg"
                  alt="NIHPLOD"
                  fill
                className="object-contain object-center md:object-left"
                />
              </div>
            </Link>

            {/* Nav links */}
            <div className="flex flex-col gap-2">
              <Link
                href="/terms"
                onClick={() => setMobileMenuOpen(false)}
                className="px-4 py-4 text-[15px] font-medium tracking-wider text-[#00263E] hover:bg-brand-charcoal/5 rounded-xl transition-colors"
              >
                服务条款
              </Link>
              <Link
                href="/privacy"
                onClick={() => setMobileMenuOpen(false)}
                className="px-4 py-4 text-[15px] font-medium tracking-wider text-[#00263E] hover:bg-brand-charcoal/5 rounded-xl transition-colors"
              >
                隐私政策
              </Link>
            </div>

            {/* Home link at bottom */}
            <Link
              href="/"
              onClick={() => setMobileMenuOpen(false)}
              className="mt-auto flex items-center gap-2 px-4 py-4 text-[15px] font-medium tracking-wider text-[#00263E] hover:bg-brand-charcoal/5 rounded-xl transition-colors"
            >
              <Home className="h-5 w-5" />
              返回首页
            </Link>
          </div>
        </div>
      </div>

      {/* Spacer */}
      <div className="h-[62px] md:h-[88px] shrink-0" />

      {/* Header */}
      <div className="text-center pt-12 md:pt-20 pb-8 md:pb-12">
        <h1 className="text-3xl md:text-4xl font-light text-[#00263E] tracking-wider mb-4">
          {title.zh}
        </h1>
        <p className="text-sm md:text-base text-brand-charcoal/60 max-w-md mx-auto">
          {description}
        </p>
      </div>

      {/* Contact Form */}
      <main className="flex-1 container mx-auto px-6 pb-16 pt-0 md:px-8 lg:px-12 xl:px-16">
        <div className="max-w-xl mx-auto">
          {status === "success" ? (
            <div className="text-center py-16">
              <CheckCircle className="mx-auto h-12 w-12 text-green-500 mb-4" />
              <h2 className="text-xl font-medium text-brand-charcoal mb-2">留言已提交</h2>
              <p className="text-brand-charcoal/60">感谢您的留言，我们会尽快回复</p>
              <Link href="/" className="inline-block mt-6 text-sm text-[#00263E] hover:underline">返回首页</Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Honeypot */}
              <input type="text" name="website" value={formData.website} onChange={handleChange} autoComplete="off" tabIndex={-1} className="absolute left-[-9999px] opacity-0" aria-hidden="true" />

              {/* Name + Phone */}
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label htmlFor="name" className="block text-sm md:text-base text-brand-charcoal/70 mb-1.5">称呼 <span className="text-red-400">*</span></label>
                  <input type="text" id="name" name="name" value={formData.name} onChange={handleChange} placeholder="您的称呼" autoComplete="name" maxLength={50}
                    className={cn("w-full rounded-lg border px-4 py-3.5 text-sm md:text-base outline-none transition-all placeholder:text-sm md:placeholder:text-base placeholder:text-brand-charcoal/40", errors.name ? "border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-100" : "border-brand-charcoal/20 focus:border-[#00263E]/40 focus:ring-4 focus:ring-[#00263E]/10")} />
                  {errors.name && <p className="mt-1.5 text-xs text-red-500">{errors.name}</p>}
                </div>
                <div>
                  <label htmlFor="phone" className="block text-sm md:text-base text-brand-charcoal/70 mb-1.5">手机号 <span className="text-red-400">*</span></label>
                  <input type="tel" id="phone" name="phone" value={formData.phone} onChange={handleChange} placeholder="您的手机号" autoComplete="tel" inputMode="tel" maxLength={11}
                    className={cn("w-full rounded-lg border px-4 py-3.5 text-sm md:text-base outline-none transition-all placeholder:text-sm md:placeholder:text-base placeholder:text-brand-charcoal/40", errors.phone ? "border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-100" : "border-brand-charcoal/20 focus:border-[#00263E]/40 focus:ring-4 focus:ring-[#00263E]/10")} />
                  {errors.phone && <p className="mt-1.5 text-xs text-red-500">{errors.phone}</p>}
                </div>
              </div>

              {/* Message Type Dropdown */}
              <div ref={typeDropdownRef} className="relative">
                <label className="block text-sm md:text-base text-brand-charcoal/70 mb-1.5">留言类型 <span className="text-red-400">*</span></label>
                <button type="button" onClick={() => setIsTypeDropdownOpen(!isTypeDropdownOpen)}
                  className={cn("flex w-full items-center justify-between rounded-lg border px-4 py-3.5 text-left text-sm md:text-base outline-none transition-all",
                    !formData.type && "text-brand-charcoal/40",
                    errors.type ? "border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-100" : "border-brand-charcoal/20 hover:border-[#00263E]/40 focus:border-[#00263E]/40 focus:ring-4 focus:ring-[#00263E]/10",
                    isTypeDropdownOpen && !errors.type && "border-[#00263E]/40 ring-4 ring-[#00263E]/10")}>
                  <span className="flex items-center gap-2.5">
                    {formData.type && (() => { const selected = messageTypes.find(t => t.value === formData.type); if (selected) return <selected.icon className="h-4 w-4 text-[#00263E]" />; return null; })()}
                    <span className={formData.type ? "text-brand-charcoal" : ""}>{messageTypes.find(t => t.value === formData.type)?.label || "请选择留言类型"}</span>
                  </span>
                  <ChevronDown className={cn("h-4 w-4 text-brand-charcoal/40 transition-transform duration-200", isTypeDropdownOpen && "rotate-180")} />
                </button>
                <AnimatePresence>
                  {isTypeDropdownOpen && (
                    <m.div initial={{ opacity: 0, y: -8, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.96 }} transition={{ duration: 0.15 }}
                      className="absolute left-0 right-0 top-full z-50 mt-1.5 overflow-hidden rounded-lg border border-brand-charcoal/20 bg-white shadow-lg">
                      {messageTypes.filter(t => t.value !== "").map((type, index) => {
                        const Icon = type.icon;
                        const isSelected = formData.type === type.value;
                        return (
                          <button key={type.value} type="button"
                            onClick={() => { setFormData(prev => ({ ...prev, type: type.value })); setIsTypeDropdownOpen(false); if (errors.type) setErrors(prev => ({ ...prev, type: "" })); }}
                            className={cn("flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm md:text-base transition-colors", isSelected ? "bg-[#00263E]/5 text-[#00263E]" : "text-brand-charcoal/70 hover:bg-brand-charcoal/5", index !== messageTypes.filter(t => t.value !== "").length - 1 && "border-b border-brand-charcoal/10")}
                          >
                            <Icon className={cn("h-4 w-4", isSelected ? "text-[#00263E]" : "text-brand-charcoal/40")} />
                            <span>{type.label}</span>
                            {isSelected && <CheckCircle className="ml-auto h-4 w-4 text-[#00263E]" />}
                          </button>
                        );
                      })}
                    </m.div>
                  )}
                </AnimatePresence>
                {errors.type && <p className="mt-1.5 text-xs text-red-500">{errors.type}</p>}
              </div>

              {/* Content */}
              <div>
                <label htmlFor="content" className="block text-sm md:text-base text-brand-charcoal/70 mb-1.5">留言内容 <span className="text-red-400">*</span></label>
                <textarea id="content" name="content" value={formData.content} onChange={handleChange} placeholder="请输入您的留言内容..." rows={4} maxLength={2000}
                  className={cn("w-full resize-none rounded-lg border px-4 py-3.5 text-sm md:text-base outline-none transition-all placeholder:text-sm md:placeholder:text-base placeholder:text-brand-charcoal/40", errors.content ? "border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-100" : "border-brand-charcoal/20 focus:border-[#00263E]/40 focus:ring-4 focus:ring-[#00263E]/10")} />
                {errors.content && <p className="mt-1.5 text-xs text-red-500">{errors.content}</p>}
              </div>

              {/* Submit */}
              <button type="submit" disabled={status === "loading"}
                className="w-full flex items-center justify-center gap-2 rounded-lg border border-[#00263E]/30 px-6 py-3.5 text-sm font-medium text-[#00263E] hover:border-[#00263E] hover:bg-[#00263E]/5 transition-colors disabled:opacity-50">
                {status === "loading" ? (<><Loader2 className="h-4 w-4 animate-spin" />提交中...</>) : (<><Send className="h-4 w-4" />提交留言</>)}
              </button>
            </form>
          )}
        </div>
      </main>

      {/* Page Footer */}
      <footer className="border-t border-brand-charcoal/10">
        <div className="container mx-auto px-6 md:px-8 lg:px-12 xl:px-16 py-6 text-center">
          <p className="text-xs text-brand-charcoal/50 tracking-wider">&copy; {new Date().getFullYear()} NIHPLOD. All Rights Reserved.</p>
        </div>
      </footer>
    </div>
  );
}

"use client";

import { useState, useRef, useEffect } from "react";
import { Link } from "next-view-transitions";
import { m, AnimatePresence } from "framer-motion";
import { Home, Send, CheckCircle, Loader2, MessageSquare, Briefcase, MessageCircle, AlertTriangle, HelpCircle, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ContactPageContent } from "@/types/page-content";
import { useToast } from "@/hooks";

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
  phone: string; // 将邮箱改为手机号
  type: string;
  content: string;
  website: string; // 蜜罐字段
}

interface ContactContentProps {
  content?: ContactPageContent;

}

/**
 * 联系我们页面内容组件
 * 样式参考 ServicesContent - 始终全屏显示，无展开/收起功能
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
      newErrors.name = "请输入您的称呼";
    } else if (formData.name.length < 2) {
      newErrors.name = "称呼至少2个字符";
    } else if (formData.name.length > 50) {
      newErrors.name = "称呼最多50个字符";
    }
    if (!formData.phone.trim()) {
      newErrors.phone = "请输入您的手机号";
    } else if (!/^1[3456789]\d{9}$/.test(formData.phone)) {
      newErrors.phone = "请输入有效的11位手机号";
    }
    if (!formData.type) {
      newErrors.type = "请选择留言类型";
    }
    if (!formData.content.trim()) {
      newErrors.content = "请输入留言内容";
    } else if (formData.content.length < 10) {
      newErrors.content = "留言内容至少10个字符";
    } else if (formData.content.length > 2000) {
      newErrors.content = "留言内容最多2000个字符";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // 提交表单
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setStatus("loading");
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          name: formData.name.trim(),
          phone: formData.phone.trim(),
          content: formData.content.trim(),
        }),
      });
      const data = await response.json();
      if (response.ok) {
        setStatus("success");
        toastSuccess(data.message || "留言已提交");
        setFormData({ name: "", phone: "", type: "", content: "", website: "" });
      } else {
        setStatus("error");
        toastError(data.error || "提交失败，请稍后重试");
      }
    } catch {
      setStatus("error");
      toastError("网络错误，请检查您的网络连接");
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
              <div className="mb-6 text-center sm:mb-8">
                <p className="text-xs uppercase tracking-widest text-brand-gold sm:text-sm md:text-base">
                  {title.en}
                </p>
                <h1 className="mt-1 font-serif text-2xl text-brand-charcoal sm:text-3xl md:text-4xl">
                  {title.zh}
                </h1>
                <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-brand-charcoal/70 sm:mt-3 sm:text-base">
                  {description}
                </p>
              </div>

              {/* 联系表单 */}
              <div className="mx-auto w-full max-w-xl">
                <form onSubmit={handleSubmit} className="space-y-5">
                  {/* 蜜罐字段 */}
                  <input type="text" name="website" value={formData.website} onChange={handleChange} autoComplete="off" tabIndex={-1} className="absolute left-[-9999px] top-0 h-0 w-0 opacity-0" aria-hidden="true" />

                  {/* 姓名和邮箱并排 */}
                  <div className="grid gap-5 sm:grid-cols-2">
                    <div>
                      <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-brand-charcoal">
                        称呼 <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        id="name"
                        name="name"
                        value={formData.name}
                        onChange={handleChange}
                        placeholder="请输入您的称呼"
                        autoComplete="name"
                        maxLength={50}
                        className={cn(
                          "w-full rounded-xl border bg-white/90 px-4 py-3 text-sm outline-none transition-all backdrop-blur-sm",
                          errors.name ? "border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-100" : "border-brand-beige/50 focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/10"
                        )}
                      />
                      {errors.name && <p className="mt-1.5 text-xs text-red-500">{errors.name}</p>}
                    </div>

                    <div>
                      <label htmlFor="phone" className="mb-1.5 block text-sm font-medium text-brand-charcoal">
                        手机号 <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="tel"
                        id="phone"
                        name="phone"
                        value={formData.phone}
                        onChange={handleChange}
                        placeholder="请输入您的手机号"
                        autoComplete="tel"
                        inputMode="tel"
                        maxLength={11}
                        className={cn(
                          "w-full rounded-xl border bg-white/90 px-4 py-3 text-sm outline-none transition-all backdrop-blur-sm",
                          errors.phone ? "border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-100" : "border-brand-beige/50 focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/10"
                        )}
                      />
                      {errors.phone && <p className="mt-1.5 text-xs text-red-500">{errors.phone}</p>}
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
                      maxLength={2000}
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
                      <><Send className="h-4 w-4" /><span>提交</span></>
                    )}
                  </button>
                </form>

                {/* 版权信息 */}
                <p className="mt-6 text-center text-xs text-brand-charcoal/40">
                  © {new Date().getFullYear()} {copyright}
                </p>
              </div>
            </div>
          </div>

          {/* 回到首页按钮 */}
          <Link
            href="/"
            className="group flex items-center justify-center gap-2 rounded-b-2xl bg-[#EBE8DB] px-10 py-2.5 shadow-sm lg:px-14 lg:py-3 pointer-events-auto"
          >
            <Home className="h-5 w-5 text-brand-gold transition-all duration-200 group-hover:scale-110 group-hover:text-brand-gold/80 lg:h-6 lg:w-6" />
            <span className="text-sm font-medium text-brand-charcoal transition-colors duration-200 group-hover:text-brand-charcoal/70 lg:text-base">返回首页</span>
          </Link>
        </div>
      </m.div>
    </>
  );
}


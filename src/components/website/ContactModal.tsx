"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { m, AnimatePresence } from "framer-motion";
import { X, Send, CheckCircle, Loader2, MessageSquare, Briefcase, MessageCircle, AlertTriangle, HelpCircle, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks";

// 图标映射
const iconMap: Record<string, typeof HelpCircle> = {
    spa_reservation: MessageSquare,
    application: Briefcase,
    consultation: MessageSquare,
    cooperation: Briefcase,
    feedback: MessageCircle,
    complaint: AlertTriangle,
    other: HelpCircle,
};

// 默认留言类型
const messageTypesData = [
    { value: "application", label: "申请入驻" },
    { value: "consultation", label: "产品咨询" },
    { value: "cooperation", label: "商务合作" },
    { value: "feedback", label: "使用反馈" },
    { value: "complaint", label: "投诉建议" },
    { value: "other", label: "其他问题" },
];

interface FormData {
    name: string;
    phone: string; // 将邮箱改为手机号
    type: string;
    content: string;
    location?: string;
    website: string; // 蜜罐字段
}

type FormStatus = "idle" | "loading" | "success" | "error";

export function ContactModal() {
    const { contactOpen, contactDefaultType, closeContact } = useAuth();
    const [mounted, setMounted] = useState(false);

    // 表单状态
    const [formData, setFormData] = useState<FormData>({
        name: "",
        phone: "",
        type: "",
        content: "",
        location: "",
        website: "",
    });
    const [status, setStatus] = useState<FormStatus>("idle");
    const [errors, setErrors] = useState<Record<string, string>>({});
    const { success: toastSuccess, error: toastError } = useToast();
    const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);
    const typeDropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setMounted(true);
    }, []);

    // 当打开弹窗时，如果有默认类型，设置它
    useEffect(() => {
        if (contactOpen && contactDefaultType) {
            setFormData(prev => ({ ...prev, type: contactDefaultType }));
        }
    }, [contactOpen, contactDefaultType]);

    // 禁止背景滚动
    useEffect(() => {
        if (contactOpen) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "unset";
        }
        return () => {
            document.body.style.overflow = "unset";
        };
    }, [contactOpen]);

    // ESC 关闭及重置
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === "Escape") closeContact();
        };
        window.addEventListener("keydown", handleEsc);
        return () => window.removeEventListener("keydown", handleEsc);
    }, [closeContact]);

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

    // 重置表单当关闭时
    useEffect(() => {
        if (!contactOpen) {
            setFormData({ name: "", phone: "", type: "", content: "", location: "", website: "" });
            setStatus("idle");
            setErrors({});
        }
    }, [contactOpen]);

    if (!mounted) return null;

    // 构建带图标的留言类型选项
    const messageTypes = [
        { value: "", label: "请选择留言类型", icon: HelpCircle },
        ...messageTypesData.map((t) => ({
            value: t.value,
            label: t.label,
            icon: iconMap[t.value] || HelpCircle,
        })),
    ];

    // 表单验证
    const validateForm = (): boolean => {
        const newErrors: Record<string, string> = {};
        if (!formData.name.trim()) {
            newErrors.name = "请输入您的姓名";
        } else if (formData.name.length < 2) {
            newErrors.name = "姓名至少2个字符";
        } else if (formData.name.length > 50) {
            newErrors.name = "姓名最多50个字符";
        }

        if (!formData.phone.trim()) {
            newErrors.phone = "请输入您的手机号";
        } else if (!/^1[3456789]\d{9}$/.test(formData.phone)) {
            newErrors.phone = "请输入有效的11位手机号";
        }

        if (!formData.type) {
            newErrors.type = "请选择留言类型";
        }

        if (formData.type === "application") {
            if (!formData.location?.trim()) {
                newErrors.location = "请输入您的所在地";
            } else if (formData.location.length > 100) {
                newErrors.location = "所在地最多100个字符";
            }
        } else {
            if (!formData.content.trim()) {
                newErrors.content = "请输入留言内容";
            } else if (formData.content.length < 10) {
                newErrors.content = "留言内容至少10个字符";
            } else if (formData.content.length > 2000) {
                newErrors.content = "留言内容最多2000个字符";
            }
        }
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    // 提交表单
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validateForm()) return;
        setStatus("loading");
        // 构造提交数据
        const submitData = { 
            ...formData,
            name: formData.name.trim(),
            phone: formData.phone.trim(),
            content: formData.content.trim(),
            location: formData.location?.trim(),
        };

        if (formData.type === "application") {
            submitData.content = `申请入驻\n所在地: ${submitData.location}\n联系电话: ${submitData.phone}`;
        }

        try {
            const response = await fetch("/api/contact", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(submitData),
            });
            const data = await response.json();
            if (response.ok) {
                setStatus("success");
                toastSuccess(data.message || "留言已提交");
                setFormData({ name: "", phone: "", type: "", content: "", location: "", website: "" });
                // 延迟关闭
                setTimeout(() => {
                    closeContact();
                }, 2000);
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

    const content = (
        <AnimatePresence>
            {contactOpen && (
                <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4">
                    {/* 遮罩 */}
                    <m.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={closeContact}
                        className="absolute inset-0 bg-black/60 backdrop-blur-md"
                    />

                    {/* 弹窗主体 - 双列布局 */}
                    <m.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        transition={{ type: "spring", damping: 25, stiffness: 300 }}
                        className="relative w-full max-w-4xl overflow-hidden rounded-3xl bg-white shadow-2xl flex flex-col md:flex-row h-auto max-h-[85vh] md:h-[600px]"
                    >
                        {/* 左侧：表单区域 */}
                        <div className="flex-1 overflow-y-auto p-6 md:p-10">
                            <div className="mb-8">
                                <h2 className="font-serif text-2xl text-brand-charcoal md:text-3xl">联系我们</h2>
                                <p className="mt-2 text-sm text-brand-charcoal/60">
                                    有任何问题？期待与您的每一次交流
                                </p>
                            </div>

                            <form onSubmit={handleSubmit} className="space-y-5">
                                {/* 蜜罐字段 */}
                                <input type="text" name="website" value={formData.website} onChange={handleChange} autoComplete="off" tabIndex={-1} className="absolute left-[-9999px] top-0 h-0 w-0 opacity-0" aria-hidden="true" />

                                {/* 留言类型 */}
                                <div ref={typeDropdownRef} className="relative">

                                    <button
                                        type="button"
                                        onClick={() => setIsTypeDropdownOpen(!isTypeDropdownOpen)}
                                        className={cn(
                                            "flex w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-5 py-4 text-left text-base outline-none transition-all",
                                            !formData.type && "text-gray-400",
                                            errors.type
                                                ? "border-red-300 focus:border-red-500 focus:ring-1 focus:ring-red-100"
                                                : "hover:border-brand-gold/50 focus:border-brand-gold focus:ring-1 focus:ring-brand-gold/10",
                                            isTypeDropdownOpen && "border-brand-gold ring-1 ring-brand-gold/10"
                                        )}
                                    >
                                        <span className="flex items-center gap-2">
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
                                            "h-4 w-4 text-gray-400 transition-transform duration-200",
                                            isTypeDropdownOpen && "rotate-180"
                                        )} />
                                    </button>

                                    <AnimatePresence>
                                        {isTypeDropdownOpen && (
                                            <m.div
                                                initial={{ opacity: 0, y: 5 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: 5 }}
                                                transition={{ duration: 0.15 }}
                                                className="absolute left-0 right-0 top-full z-50 mt-1.5 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-xl"
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
                                                                    ? "bg-brand-gold/5 text-brand-gold"
                                                                    : "text-brand-charcoal/70 hover:bg-gray-50",
                                                                index !== messageTypes.filter(t => t.value !== "").length - 1 && "border-b border-gray-50"
                                                            )}
                                                        >
                                                            <Icon className={cn(
                                                                "h-4 w-4 transition-colors",
                                                                isSelected ? "text-brand-gold" : "text-gray-400"
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
                                    {errors.type && <p className="mt-1 text-xs text-red-500">{errors.type}</p>}
                                </div>

                                <div className="grid gap-5 sm:grid-cols-2">
                                    {/* 姓名 */}
                                    <div>
                                        <label htmlFor="modal-name" className="sr-only">您的姓名</label>

                                        <input
                                            type="text"
                                            id="modal-name"
                                            name="name"
                                            value={formData.name}
                                            onChange={handleChange}
                                            maxLength={50}
                                            className={cn(
                                                "w-full rounded-xl border border-gray-200 bg-white px-5 py-4 text-base outline-none transition-all placeholder:text-gray-400",
                                                errors.name
                                                    ? "border-red-300 focus:border-red-500 focus:ring-1 focus:ring-red-100"
                                                    : "hover:border-brand-gold/50 focus:border-brand-gold focus:ring-1 focus:ring-brand-gold/10"
                                            )}
                                            placeholder="请输入您的姓名"
                                        />
                                        {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
                                    </div>

                                    {/* 手机号 */}
                                    <div>
                                        <label htmlFor="modal-phone" className="sr-only">手机号</label>
                                        <input
                                            type="tel"
                                            id="modal-phone"
                                            name="phone"
                                            value={formData.phone}
                                            onChange={handleChange}
                                            maxLength={11}
                                            className={cn(
                                                "w-full rounded-xl border border-gray-200 bg-white px-5 py-4 text-base outline-none transition-all placeholder:text-gray-400",
                                                errors.phone
                                                    ? "border-red-300 focus:border-red-500 focus:ring-1 focus:ring-red-100"
                                                    : "hover:border-brand-gold/50 focus:border-brand-gold focus:ring-1 focus:ring-brand-gold/10"
                                            )}
                                            placeholder="请输入手机号"
                                        />
                                        {errors.phone && <p className="mt-1 text-xs text-red-500">{errors.phone}</p>}
                                    </div>
                                </div>



                                {/* 留言内容 或 申请入驻地址 */}
                                {formData.type === "application" ? (
                                    <div className="space-y-4">
                                        {/* 所在地 */}
                                        <div>
                                            <label htmlFor="modal-location" className="sr-only">您的所在地</label>
                                            <input
                                                type="text"
                                                id="modal-location"
                                                name="location"
                                                value={formData.location || ""}
                                                onChange={handleChange}
                                                maxLength={100}
                                                className={cn(
                                                    "w-full rounded-xl border border-gray-200 bg-white px-5 py-4 text-base outline-none transition-all placeholder:text-gray-400",
                                                    errors.location
                                                        ? "border-red-300 focus:border-red-500 focus:ring-1 focus:ring-red-100"
                                                        : "hover:border-brand-gold/50 focus:border-brand-gold focus:ring-1 focus:ring-brand-gold/10"
                                                )}
                                                placeholder="您的所在城市（如：上海、北京）"
                                            />
                                            {errors.location && <p className="mt-1 text-xs text-red-500">{errors.location}</p>}
                                        </div>
                                    </div>
                                ) : (
                                    <div>
                                        <label htmlFor="modal-content" className="sr-only">留言内容</label>
                                        <textarea
                                            id="modal-content"
                                            name="content"
                                            value={formData.content}
                                            onChange={handleChange}
                                            placeholder="请输入您的具体需求或建议..."
                                            rows={6}
                                            maxLength={2000}
                                            className={cn(
                                                "w-full resize-none rounded-xl border border-gray-200 bg-white px-5 py-4 text-base outline-none transition-all placeholder:text-gray-400",
                                                errors.content
                                                    ? "border-red-300 focus:border-red-500 focus:ring-1 focus:ring-red-100"
                                                    : "hover:border-brand-gold/50 focus:border-brand-gold focus:ring-1 focus:ring-brand-gold/10"
                                            )}
                                        />
                                        {errors.content && <p className="mt-1 text-xs text-red-500">{errors.content}</p>}
                                    </div>
                                )}

                                <div className="pt-2">
                                    <button
                                        type="submit"
                                        disabled={status === "loading"}
                                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#8E8675] py-4 text-sm font-medium text-white shadow-lg shadow-[#8E8675]/20 transition-all hover:bg-[#7D7565] hover:shadow-xl hover:shadow-[#8E8675]/30 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {status === "loading" ? (
                                            <><Loader2 className="h-5 w-5 animate-spin" /><span>正在提交...</span></>
                                        ) : (
                                            <><span>提交</span><Send className="h-4 w-4" /></>
                                        )}
                                    </button>
                                </div>
                            </form>
                        </div>

                        {/* 右侧：图片区域 */}
                        <div className="hidden relative w-1/2 bg-[#F2F0EA] md:block overflow-hidden">
                            {/* 关闭按钮 - 悬浮在右上角 */}
                            <button
                                onClick={closeContact}
                                className="absolute top-6 right-6 z-20 rounded-full bg-white/20 p-2 text-brand-charcoal/60 backdrop-blur-md transition-colors hover:bg-white/40 hover:text-brand-charcoal"
                            >
                                <X className="h-5 w-5" />
                            </button>

                            <Image
                                src="/images/contact-modal-bg.webp"
                                alt="Contact Illustration"
                                fill
                                className="object-cover object-center opacity-90"
                                priority
                            />

                            {/* 装饰性文字 */}
                            {/* <div className="absolute bottom-10 left-10 z-10">
                                <p className="font-serif text-3xl italic text-brand-charcoal/80">Skincare Ritual</p>
                            </div> */}
                        </div>

                        {/* 移动端关闭按钮 */}
                        <button
                            onClick={closeContact}
                            className="absolute right-4 top-4 z-10 p-2 text-brand-charcoal/50 md:hidden"
                        >
                            <X className="h-6 w-6" />
                        </button>
                    </m.div>
                </div>
            )}
        </AnimatePresence>
    );

    return createPortal(content, document.body);
}

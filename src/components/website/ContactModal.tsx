"use client";

/**
 * 联系我们模态框组件
 * 自然纹理风格
 */
import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { m, AnimatePresence } from "framer-motion";
import { X, Send, CheckCircle, AlertCircle, Loader2, MessageSquare, Briefcase, MessageCircle, AlertTriangle, HelpCircle, ChevronDown, Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

// 图标映射
const iconMap: Record<string, typeof HelpCircle> = {
    consultation: MessageSquare,
    cooperation: Briefcase,
    feedback: MessageCircle,
    complaint: AlertTriangle,
    other: HelpCircle,
};

// 默认留言类型
const messageTypesData = [
    { value: "consultation", label: "产品咨询" },
    { value: "cooperation", label: "商务合作" },
    { value: "feedback", label: "使用反馈" },
    { value: "complaint", label: "投诉建议" },
    { value: "other", label: "其他问题" },
];

interface FormData {
    name: string;
    email: string;
    type: string;
    content: string;
    website: string; // 蜜罐字段
}

type FormStatus = "idle" | "loading" | "success" | "error";

// 自然纹理背景样式
const TEXTURE_BG = `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E")`;

export function ContactModal() {
    const { contactOpen, closeContact } = useAuth();
    const [mounted, setMounted] = useState(false);

    // 表单状态
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

    useEffect(() => {
        setMounted(true);
    }, []);

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

    // ESC 关闭
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
            setFormData({ name: "", email: "", type: "", content: "", website: "" });
            setStatus("idle");
            setErrors({});
            setMessage("");
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
                // 延迟关闭
                setTimeout(() => {
                    closeContact();
                }, 2000);
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

    const content = (
        <AnimatePresence>
            {contactOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    {/* 遮罩 */}
                    <m.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={closeContact}
                        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                    />

                    {/* 弹窗主体 */}
                    <m.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        transition={{ type: "spring", damping: 25, stiffness: 300 }}
                        className="relative w-full max-w-lg max-h-[85vh] bg-[#FAF8F5] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
                        style={{ backgroundImage: TEXTURE_BG }}
                    >
                        {/* 关闭按钮 */}
                        <button
                            onClick={closeContact}
                            className="absolute top-4 right-4 z-10 p-2 rounded-full text-[#8B8579] hover:text-[#5C5347] hover:bg-[#E8E3DC] transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        {/* 头部 */}
                        <div className="px-6 pt-6 pb-4 border-b border-[#E8E3DC]">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-[#A69374]/10 flex items-center justify-center">
                                    <Mail className="w-5 h-5 text-[#A69374]" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-medium text-[#5C5347]">联系我们</h2>
                                    <p className="text-xs text-[#A69B8C]">有任何问题？期待与您的交流</p>
                                </div>
                            </div>
                        </div>

                        {/* 内容区域 */}
                        <div className="flex-1 overflow-y-auto p-6">

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

                            <form onSubmit={handleSubmit} className="space-y-4">
                                {/* 蜜罐字段 */}
                                <input type="text" name="website" value={formData.website} onChange={handleChange} autoComplete="off" tabIndex={-1} className="absolute left-[-9999px] top-0 h-0 w-0 opacity-0" aria-hidden="true" />

                                <div className="grid gap-4 sm:grid-cols-2">
                                    {/* 姓名 */}
                                    <div>
                                        <label htmlFor="modal-name" className="mb-1.5 block text-sm font-medium text-[#5C5347]">
                                            姓名 <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            id="modal-name"
                                            name="name"
                                            value={formData.name}
                                            onChange={handleChange}
                                            className={cn(
                                                "w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition-all bg-white/60",
                                                errors.name
                                                    ? "border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-100"
                                                    : "border-[#E8E3DC] focus:border-[#A69374] focus:ring-2 focus:ring-[#A69374]/10"
                                            )}
                                            placeholder="请输入您的姓名"
                                        />
                                        {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
                                    </div>

                                    {/* 邮箱 */}
                                    <div>
                                        <label htmlFor="modal-email" className="mb-1.5 block text-sm font-medium text-[#5C5347]">
                                            邮箱 <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="email"
                                            id="modal-email"
                                            name="email"
                                            value={formData.email}
                                            onChange={handleChange}
                                            className={cn(
                                                "w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition-all bg-white/60",
                                                errors.email
                                                    ? "border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-100"
                                                    : "border-[#E8E3DC] focus:border-[#A69374] focus:ring-2 focus:ring-[#A69374]/10"
                                            )}
                                            placeholder="请输入您的邮箱"
                                        />
                                        {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email}</p>}
                                    </div>
                                </div>

                                {/* 留言类型 */}
                                <div ref={typeDropdownRef} className="relative">
                                    <label htmlFor="modal-type" className="mb-1.5 block text-sm font-medium text-[#5C5347]">
                                        留言类型 <span className="text-red-500">*</span>
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => setIsTypeDropdownOpen(!isTypeDropdownOpen)}
                                        className={cn(
                                            "flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm outline-none transition-all bg-white/60",
                                            !formData.type && "text-gray-400",
                                            errors.type
                                                ? "border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-100"
                                                : "border-[#E8E3DC] focus:border-[#A69374] focus:ring-2 focus:ring-[#A69374]/10",
                                        )}
                                    >
                                        <span className="flex items-center gap-2">
                                            {formData.type && (() => {
                                                const selected = messageTypes.find(t => t.value === formData.type);
                                                if (selected) {
                                                    const Icon = selected.icon;
                                                    return <Icon className="h-4 w-4 text-[#A69374]" />;
                                                }
                                                return null;
                                            })()}
                                            <span className={formData.type ? "text-[#5C5347]" : ""}>
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
                                                initial={{ opacity: 0, y: -8, scale: 0.96 }}
                                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                                exit={{ opacity: 0, y: -8, scale: 0.96 }}
                                                transition={{ duration: 0.15, ease: "easeOut" }}
                                                className="absolute left-0 right-0 top-full z-50 mt-1.5 overflow-hidden rounded-xl border border-[#E8E3DC] bg-white shadow-lg shadow-black/5"
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
                                                                    ? "bg-[#A69374]/10 text-[#5C5347]"
                                                                    : "text-[#5C5347]/70 hover:bg-[#F5F2ED] hover:text-[#5C5347]",
                                                                index !== messageTypes.filter(t => t.value !== "").length - 1 && "border-b border-[#E8E3DC]/30"
                                                            )}
                                                        >
                                                            <Icon className={cn(
                                                                "h-4 w-4 transition-colors",
                                                                isSelected ? "text-[#A69374]" : "text-gray-400"
                                                            )} />
                                                            <span>{type.label}</span>
                                                            {isSelected && (
                                                                <CheckCircle className="ml-auto h-4 w-4 text-[#A69374]" />
                                                            )}
                                                        </button>
                                                    );
                                                })}
                                            </m.div>
                                        )}
                                    </AnimatePresence>
                                    {errors.type && <p className="mt-1 text-xs text-red-500">{errors.type}</p>}
                                </div>

                                {/* 内容跟随 */}
                                <div>
                                    <label htmlFor="modal-content" className="mb-1.5 block text-sm font-medium text-[#5C5347]">
                                        留言内容 <span className="text-red-500">*</span>
                                    </label>
                                    <textarea
                                        id="modal-content"
                                        name="content"
                                        value={formData.content}
                                        onChange={handleChange}
                                        placeholder="请输入您的留言内容..."
                                        rows={4}
                                        className={cn(
                                            "w-full resize-none rounded-xl border bg-white/60 px-3 py-2.5 text-sm outline-none transition-all",
                                            errors.content
                                                ? "border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-100"
                                                : "border-[#E8E3DC] focus:border-[#A69374] focus:ring-2 focus:ring-[#A69374]/10"
                                        )}
                                    />
                                    {errors.content && <p className="mt-1 text-xs text-red-500">{errors.content}</p>}
                                </div>

                                <button
                                    type="submit"
                                    disabled={status === "loading"}
                                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#A69374] py-3 text-sm font-medium text-white shadow-lg shadow-[#A69374]/20 transition-all hover:bg-[#8B7355] disabled:cursor-not-allowed disabled:opacity-60 mt-4"
                                >
                                    {status === "loading" ? (
                                        <><Loader2 className="h-4 w-4 animate-spin" /><span>提交中...</span></>
                                    ) : (
                                        <><Send className="h-4 w-4" /><span>提交留言</span></>
                                    )}
                                </button>

                            </form>
                        </div>
                    </m.div>
                </div>
            )}
        </AnimatePresence>
    );

    return createPortal(content, document.body);
}

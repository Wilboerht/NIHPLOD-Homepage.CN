"use client";

import { useState } from "react";
import { m } from "framer-motion";
import { Mail, Phone, MapPin, Send, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { FloatingCardLayout } from "@/components/website";
import { fadeInUp, defaultTransition } from "@/lib/animations";
import { cn } from "@/lib/utils";

// 联系信息
const contactInfo = [
  {
    icon: Mail,
    label: "电子邮箱",
    value: "contact@nihplod.com",
    href: "mailto:contact@nihplod.com",
  },
  {
    icon: Phone,
    label: "客服热线",
    value: "+86 400-888-8888",
    href: "tel:+864008888888",
  },
  {
    icon: MapPin,
    label: "公司地址",
    value: "中国上海市静安区南京西路1788号",
    href: null,
  },
];

type FormStatus = "idle" | "loading" | "success" | "error";

interface FormData {
  name: string;
  email: string;
  content: string;
  website: string; // 蜜罐字段
}

/**
 * 联系我们页面内容组件
 */
export function ContactContent() {
  const [formData, setFormData] = useState<FormData>({
    name: "",
    email: "",
    content: "",
    website: "", // 蜜罐字段，正常用户不会填写
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
        // 清空表单
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
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    // 清除对应字段的错误
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  return (
    <FloatingCardLayout
      backgroundImage="/images/contact-bg.jpg"
      backgroundAlt="联系我们"
      initialState="minimized"
    >
      {/* 页面标题 */}
      <m.div
        className="mb-6 text-center"
        variants={fadeInUp}
        initial="initial"
        animate="animate"
        transition={defaultTransition}
      >
        <p className="text-xs uppercase tracking-widest text-brand-gold">
          CONTACT US
        </p>
        <h1 className="mt-1 font-serif text-2xl text-brand-charcoal md:text-3xl">
          联系我们
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-brand-charcoal/70">
          有任何问题或建议？我们期待与您的每一次交流。
        </p>
      </m.div>

      {/* 联系信息卡片 */}
      <m.div
        className="mb-8 grid gap-4 md:grid-cols-3"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        {contactInfo.map((item) => (
          <div
            key={item.label}
            className="rounded-xl border border-brand-beige bg-white p-4 text-center"
          >
            <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-brand-gold/10">
              <item.icon className="h-5 w-5 text-brand-gold" />
            </div>
            <p className="text-xs text-brand-charcoal/60">{item.label}</p>
            {item.href ? (
              <a
                href={item.href}
                className="mt-1 block text-sm font-medium text-brand-charcoal hover:text-brand-gold"
              >
                {item.value}
              </a>
            ) : (
              <p className="mt-1 text-sm font-medium text-brand-charcoal">
                {item.value}
              </p>
            )}
          </div>
        ))}
      </m.div>

      {/* 留言表单 */}
      <m.div
        className="rounded-xl border border-brand-beige bg-white p-6"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
      >
        <h2 className="mb-4 font-serif text-lg text-brand-charcoal">
          给我们留言
        </h2>

        {/* 成功/错误提示 */}
        {status === "success" && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-green-50 p-3 text-green-700">
            <CheckCircle className="h-5 w-5" />
            <span className="text-sm">{message}</span>
          </div>
        )}

        {status === "error" && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-red-700">
            <AlertCircle className="h-5 w-5" />
            <span className="text-sm">{message}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 蜜罐字段 - 对用户隐藏 */}
          <input
            type="text"
            name="website"
            value={formData.website}
            onChange={handleChange}
            autoComplete="off"
            tabIndex={-1}
            className="absolute left-[-9999px] top-0 h-0 w-0 opacity-0"
            aria-hidden="true"
          />

          {/* 姓名 */}
          <div>
            <label
              htmlFor="name"
              className="mb-1 block text-sm text-brand-charcoal"
            >
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
                "w-full rounded-lg border bg-white px-4 py-3 text-base outline-none transition-colors",
                "md:py-2.5 md:text-sm",
                errors.name
                  ? "border-red-300 focus:border-red-500"
                  : "border-brand-beige focus:border-brand-gold"
              )}
            />
            {errors.name && (
              <p className="mt-1 text-xs text-red-500">{errors.name}</p>
            )}
          </div>

          {/* 邮箱 */}
          <div>
            <label
              htmlFor="email"
              className="mb-1 block text-sm text-brand-charcoal"
            >
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
                "w-full rounded-lg border bg-white px-4 py-3 text-base outline-none transition-colors",
                "md:py-2.5 md:text-sm",
                errors.email
                  ? "border-red-300 focus:border-red-500"
                  : "border-brand-beige focus:border-brand-gold"
              )}
            />
            {errors.email && (
              <p className="mt-1 text-xs text-red-500">{errors.email}</p>
            )}
          </div>

          {/* 留言内容 */}
          <div>
            <label
              htmlFor="content"
              className="mb-1 block text-sm text-brand-charcoal"
            >
              留言内容 <span className="text-red-500">*</span>
            </label>
            <textarea
              id="content"
              name="content"
              value={formData.content}
              onChange={handleChange}
              placeholder="请输入您的留言内容..."
              rows={4}
              className={cn(
                "w-full resize-none rounded-lg border bg-white px-4 py-3 text-base outline-none transition-colors",
                "md:py-2.5 md:text-sm",
                errors.content
                  ? "border-red-300 focus:border-red-500"
                  : "border-brand-beige focus:border-brand-gold"
              )}
            />
            {errors.content && (
              <p className="mt-1 text-xs text-red-500">{errors.content}</p>
            )}
          </div>

          {/* 提交按钮 */}
          <button
            type="submit"
            disabled={status === "loading"}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-gold py-3 font-medium text-white transition-colors hover:bg-brand-gold/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status === "loading" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>提交中...</span>
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                <span>提交留言</span>
              </>
            )}
          </button>
        </form>
      </m.div>

      {/* 底部间距 */}
      <div className="h-20" />
    </FloatingCardLayout>
  );
}


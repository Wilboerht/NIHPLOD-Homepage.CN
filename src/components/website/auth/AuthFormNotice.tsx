"use client";

import { AnimatePresence, m, useReducedMotion } from "framer-motion";
import { AlertCircle, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 表单级内联提示条：服务端错误（error）/ 跨模式成功通知（success）。
 * 样式对齐登录页的 SessionExpiredNotice，替代浮动 toast。
 */
export function AuthFormNotice({
  message,
  tone = "error",
}: {
  message?: string;
  tone?: "error" | "success";
}) {
  const reduceMotion = useReducedMotion();
  const Icon = tone === "error" ? AlertCircle : CheckCircle;
  return (
    <AnimatePresence initial={false}>
      {message && (
        <m.div
          role="alert"
          initial={reduceMotion ? false : { opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? undefined : { opacity: 0 }}
          transition={{ duration: 0.2 }}
          className={cn(
            "flex items-start gap-2.5 rounded-lg border p-3",
            tone === "error"
              ? "border-red-200/70 bg-red-50/60"
              : "border-emerald-200/70 bg-emerald-50/60"
          )}
        >
          <Icon
            className={cn(
              "mt-0.5 h-4 w-4 shrink-0",
              tone === "error" ? "text-red-500" : "text-emerald-500"
            )}
          />
          <p
            className={cn(
              "text-sm leading-relaxed",
              tone === "error" ? "text-red-600" : "text-emerald-700"
            )}
          >
            {message}
          </p>
        </m.div>
      )}
    </AnimatePresence>
  );
}

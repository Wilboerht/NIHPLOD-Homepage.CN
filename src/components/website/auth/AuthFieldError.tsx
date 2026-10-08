"use client";

import { AnimatePresence, m, useReducedMotion } from "framer-motion";

/** 登录/注册/找回/绑定表单的字段级错误（同一时刻只有一个模式可见，故各模式共用同一结构） */
export interface AuthFieldErrors {
  phone?: string;
  code?: string;
  password?: string;
  confirmPassword?: string;
  agreement?: string;
}

/** 字段级内联错误：输入框下方的小字提示，随校验结果淡入淡出 */
export function AuthFieldError({ message }: { message?: string }) {
  const reduceMotion = useReducedMotion();
  return (
    <AnimatePresence initial={false}>
      {message && (
        <m.p
          role="alert"
          initial={reduceMotion ? false : { opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? undefined : { opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="mt-1.5 text-xs tracking-wide text-red-500/90"
        >
          {message}
        </m.p>
      )}
    </AnimatePresence>
  );
}

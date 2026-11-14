"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** 敏感信息默认展示时长：5 分钟 */
export const DEFAULT_SENSITIVE_REVEAL_SECONDS = 5 * 60;

interface UseSensitiveRevealOptions {
  /** 展示时长（秒），默认 5 分钟 */
  ttlSeconds?: number;
  /** 到期或手动隐藏后的回调，用于重新拉取脱敏数据 */
  onHide?: () => void;
}

/**
 * 敏感信息限时展示：
 * - reveal() 开始计时，到期自动隐藏并触发 onHide
 * - hide() 手动隐藏
 * - remainingSeconds 用于展示倒计时
 *
 * 页面组件负责把 reveal 与 TOTP 校验/接口调用串联；本 Hook 只负责展示状态与计时。
 */
export function useSensitiveReveal({
  ttlSeconds = DEFAULT_SENSITIVE_REVEAL_SECONDS,
  onHide,
}: UseSensitiveRevealOptions = {}) {
  const [revealed, setRevealed] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const timerRef = useRef<number | null>(null);
  const onHideRef = useRef(onHide);

  useEffect(() => {
    onHideRef.current = onHide;
  }, [onHide]);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const hide = useCallback(() => {
    clearTimer();
    setRevealed(false);
    setRemainingSeconds(0);
    onHideRef.current?.();
  }, [clearTimer]);

  const reveal = useCallback(
    (overrideTtlSeconds?: number) => {
      const ttl = Math.max(1, Math.floor(overrideTtlSeconds ?? ttlSeconds));
      clearTimer();
      setRevealed(true);
      setRemainingSeconds(ttl);
      const startedAt = Date.now();
      timerRef.current = window.setInterval(() => {
        const elapsed = Math.floor((Date.now() - startedAt) / 1000);
        const remaining = Math.max(0, ttl - elapsed);
        setRemainingSeconds(remaining);
        if (remaining <= 0) {
          clearTimer();
          setRevealed(false);
          onHideRef.current?.();
        }
      }, 1000);
    },
    [clearTimer, ttlSeconds]
  );

  useEffect(() => clearTimer, [clearTimer]);

  return { revealed, remainingSeconds, reveal, hide };
}

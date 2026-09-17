"use client";

/**
 * 资金类操作 TOTP 二次确认
 *
 * 使用方式：
 *   const { requireTotp, totpModal } = useTotpConfirm();
 *   try {
 *     await submit();               // 不带头部调用
 *   } catch (e) {
 *     if (isTotpRequired(e)) {
 *       const code = await requireTotp();   // 弹出验证码输入框
 *       if (code) await submit(code);       // 带验证码重试
 *     }
 *   }
 *   // JSX 中渲染 {totpModal}
 */
import { useCallback, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ApiError } from "@/lib/api-client";

/** 是否为"需要 TOTP 二次验证"错误 */
export function isTotpRequired(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.code === "TOTP_REQUIRED" || error.code === "TOTP_NOT_ENABLED")
  );
}

export function useTotpConfirm() {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [hint, setHint] = useState("");
  const resolverRef = useRef<((code: string | null) => void) | null>(null);

  const requireTotp = useCallback((reason?: string) => {
    setCode("");
    setHint(
      reason === "TOTP_NOT_ENABLED"
        ? "尚未启用二次验证：请先前往「安全设置」启用，或联系超级管理员。"
        : "该操作涉及资金/权益变动，请输入 Authenticator 动态验证码（或备用码）确认。"
    );
    setOpen(true);
    return new Promise<string | null>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const finish = (value: string | null) => {
    setOpen(false);
    resolverRef.current?.(value);
    resolverRef.current = null;
  };

  const totpModal = (
    <Modal
      open={open}
      onClose={() => finish(null)}
      title="二次验证"
      size="sm"
      closeOnBackdrop={false}
    >
      <div className="space-y-4">
        <p className="text-sm text-brand-charcoal/60">{hint}</p>
        <Input
          label="验证码"
          value={code}
          onChange={(e) => setCode(e.target.value.trim())}
          placeholder="6 位动态验证码或备用码"
          autoComplete="one-time-code"
          autoFocus
        />
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => finish(null)}>
            取消
          </Button>
          <Button size="sm" disabled={code.length < 6} onClick={() => finish(code)}>
            确认执行
          </Button>
        </div>
      </div>
    </Modal>
  );

  return { requireTotp, totpModal };
}

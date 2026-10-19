"use client";

/**
 * 敏感操作 TOTP 二次确认（step-up / sudo mode）。
 *
 * 使用方式：
 *   const { requireTotp, totpModal } = useTotpConfirm();
 *   try {
 *     await submit();               // 不带验证码调用
 *   } catch (e) {
 *     if (isTotpRequired(e)) {
 *       const verified = await requireTotp();
 *       if (verified) await submit(); // 服务端读取 step-up cookie
 *     }
 *   }
 *   // JSX 中渲染 {totpModal}
 */
import { useCallback, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { ApiError, apiPost } from "@/lib/api-client";

/** 是否属于“需要 TOTP 二次验证”错误 */
export function isTotpRequired(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.code === "TOTP_REQUIRED" || error.code === "TOTP_NOT_ENABLED")
  );
}

export function useTotpConfirm() {
  const { success } = useToast();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [hint, setHint] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const resolverRef = useRef<((verified: boolean) => void) | null>(null);

  const requireTotp = useCallback((reason?: string) => {
    setCode("");
    setError(null);
    setSubmitting(false);
    setHint(
      reason === "TOTP_NOT_ENABLED"
        ? "尚未启用二次验证：请先前往「安全设置」启用，或联系超级管理员。"
        : "该操作涉及敏感变更。验证成功后短时间内无需重复输入，之后的操作将直接执行。"
    );
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const finish = (verified: boolean) => {
    if (submitting) return;
    setOpen(false);
    setError(null);
    resolverRef.current?.(verified);
    resolverRef.current = null;
  };

  const submit = async () => {
    if (code.length < 6 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiPost("/api/admin/step-up", { totpCode: code });
      success("二次验证已通过，短时间内敏感操作无需重复输入");
      setOpen(false);
      resolverRef.current?.(true);
      resolverRef.current = null;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "验证失败，请重试");
    } finally {
      setSubmitting(false);
    }
  };

  const totpModal = (
    <Modal
      open={open}
      onClose={() => finish(false)}
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
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
          placeholder="6 位动态验证码或备用码"
          autoComplete="one-time-code"
          autoFocus
          disabled={submitting}
        />
        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => finish(false)} disabled={submitting}>
            取消
          </Button>
          <Button
            size="sm"
            disabled={code.length < 6}
            loading={submitting}
            onClick={() => void submit()}
          >
            确认执行
          </Button>
        </div>
      </div>
    </Modal>
  );

  return { requireTotp, totpModal };
}

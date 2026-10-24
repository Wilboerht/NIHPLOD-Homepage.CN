"use client";

import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";

export function useFreshTotpConfirm() {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [hint, setHint] = useState("");
  const resolverRef = useRef<((value: string | null) => void) | null>(null);

  const requireFreshTotp = useCallback((reason?: string) => {
    setCode("");
    setHint(reason || "该操作需要一次性二次验证码，验证后不会缓存。");
    setOpen(true);
    return new Promise<string | null>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const finish = (value: string | null) => {
    setOpen(false);
    setCode("");
    resolverRef.current?.(value);
    resolverRef.current = null;
  };

  const freshTotpModal = (
    <Modal
      open={open}
      onClose={() => finish(null)}
      title="二次验证"
      size="sm"
      closeOnBackdrop={false}
    >
      <div className="space-y-4">
        <p className="text-sm text-brand-charcoal/65">{hint}</p>
        <Input
          label="验证码"
          value={code}
          onChange={(event) => setCode(event.target.value.trim())}
          onKeyDown={(event) => {
            if (event.key === "Enter" && code.length >= 6) finish(code);
          }}
          placeholder="6 位动态验证码或备用码"
          autoComplete="one-time-code"
          autoFocus
        />
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => finish(null)}>
            取消
          </Button>
          <Button size="sm" disabled={code.length < 6} onClick={() => finish(code)}>
            确认
          </Button>
        </div>
      </div>
    </Modal>
  );

  return { requireFreshTotp, freshTotpModal };
}

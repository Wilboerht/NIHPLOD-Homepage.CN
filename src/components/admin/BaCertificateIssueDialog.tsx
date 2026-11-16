"use client";

import { useState } from "react";
import { getApiErrorMessage } from "@/lib/api-client";
import { BaCertificateSealField } from "@/components/admin/BaCertificateSealField";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import type { BaCertificateDraft, BaCertificateListItem } from "@/lib/ba-certificates";

export type BaCertificateIssueResult = "issued" | "cancelled";

export interface BaCertificateIssueDialogProps {
  open: boolean;
  certificate: BaCertificateListItem | null;
  onClose: () => void;
  onConfirm: (payload: {
    draft: BaCertificateDraft;
    idempotencyKey: string;
  }) => Promise<BaCertificateIssueResult>;
}

export function BaCertificateIssueDialog({
  open,
  certificate,
  onClose,
  onConfirm,
}: BaCertificateIssueDialogProps) {
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [sealImage, setSealImage] = useState("");
  const [sealTouched, setSealTouched] = useState(false);
  const [sealUploading, setSealUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!certificate) return null;

  const handleConfirm = async () => {
    if (submitting || sealUploading) return;
    setSubmitting(true);
    setError(null);
    try {
      const draft: BaCertificateDraft = {
        companyName: certificate.companyName,
        shopName: certificate.shopName,
        phone: certificate.phone ?? undefined,
        scopeText: certificate.scopeText,
        startDate: certificate.startDate,
        endDate: certificate.endDate,
        ...(sealTouched ? { sealImage } : {}),
      };
      await onConfirm({ draft, idempotencyKey });
    } catch (err) {
      setError(getApiErrorMessage(err, "核发失败，请重试"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="核发证书"
      size="lg"
      closeGuard={() => !submitting}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            取消
          </Button>
          <Button
            onClick={() => void handleConfirm()}
            loading={submitting}
            disabled={sealUploading}
          >
            确认核发
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-brand-charcoal/10 bg-surface-subtle p-3 text-sm">
          <p className="font-mono text-xs text-brand-charcoal/65">
            {certificate.certNumber}
          </p>
          <p className="mt-1 font-medium text-brand-charcoal">{certificate.companyName}</p>
          <p className="text-xs text-brand-charcoal/65">{certificate.shopName}</p>
          <p className="mt-2 text-xs text-brand-charcoal/65">
            {certificate.startDate} ~ {certificate.endDate}
          </p>
          <div className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-brand-charcoal/75">
            {certificate.scopeText}
          </div>
        </div>

        <BaCertificateSealField
          value={sealImage}
          onChange={(url) => {
            setSealImage(url);
            setSealTouched(true);
            setIdempotencyKey(crypto.randomUUID());
            setError(null);
          }}
          onUploadingChange={setSealUploading}
          disabled={submitting}
        />

        <p className="text-xs text-ink-muted">
          如需修改证书信息，请关闭弹窗后使用「编辑待审」。
        </p>

        {error && (
          <p className="text-sm text-status-danger-fg" role="alert">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

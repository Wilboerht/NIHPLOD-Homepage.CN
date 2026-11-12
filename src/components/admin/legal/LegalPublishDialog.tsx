"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import type { LegalDocumentContent } from "@/types/legal";

interface LegalPublishDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (note: string) => void | Promise<void>;
  loading: boolean;
  content: LegalDocumentContent;
  baseContent: LegalDocumentContent | null;
  nextVersion: number;
}

function countChangedSections(
  content: LegalDocumentContent,
  baseContent: LegalDocumentContent | null
): number {
  if (!baseContent) return content.sections.length;
  const baseMap = new Map(baseContent.sections.map((section) => [section.id, section]));
  const currentIds = new Set(content.sections.map((section) => section.id));
  const changed = content.sections.filter((section) => {
    const base = baseMap.get(section.id);
    return !base || base.title !== section.title || base.body !== section.body;
  }).length;
  const removed = baseContent.sections.filter((section) => !currentIds.has(section.id)).length;
  return changed + removed;
}

export function LegalPublishDialog({
  open,
  onClose,
  onConfirm,
  loading,
  content,
  baseContent,
  nextVersion,
}: LegalPublishDialogProps) {
  const [note, setNote] = useState("");
  const noteValid = note.trim().length >= 2;
  const changedSections = countChangedSections(content, baseContent);
  const orderChanged = baseContent
    ? content.sections.map((section) => section.id).join("|") !==
      baseContent.sections.map((section) => section.id).join("|")
    : false;

  return (
    <Modal open={open} onClose={onClose} title="发布新版本" size="lg" closeOnBackdrop={!loading}>
      <div className="space-y-5">
        <div className="rounded-xl border border-brand-charcoal/10 bg-brand-charcoal/[0.02] p-4 text-sm text-brand-charcoal/70">
          <ul className="space-y-1.5">
            <li>
              发布后版本：
              <strong className="font-semibold text-brand-charcoal">v{nextVersion}</strong>
            </li>
            <li>章节数量：{content.sections.length}</li>
            <li>
              变更章节：{changedSections}
              {orderChanged ? "（含章节顺序调整）" : ""}
            </li>
            <li>“最近更新”将自动更新为今天（UTC+8）。</li>
          </ul>
        </div>

        {baseContent ? (
          <p className="text-xs text-brand-charcoal/50">
            发布后可在版本历史中查看与当前线上内容的章节级/逐行差异。
          </p>
        ) : null}

        <Textarea
          label="发布说明"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={200}
          placeholder="例如：根据 2026 年新规更新个人信息处理说明"
          rows={3}
          required
          error={note.length > 0 && !noteValid ? "发布说明至少 2 个字符" : undefined}
          hint={noteValid ? undefined : "必填，用于审计记录与版本历史"}
        />

        <p className="text-xs text-brand-charcoal/50">
          发布属于高风险操作，确认后会要求输入动态验证码，并写入审计日志与版本历史。
        </p>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            取消
          </Button>
          <Button
            onClick={() => {
              if (!noteValid) return;
              void onConfirm(note.trim());
            }}
            disabled={loading || !noteValid}
          >
            {loading ? "发布中..." : `确认发布 v${nextVersion}`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

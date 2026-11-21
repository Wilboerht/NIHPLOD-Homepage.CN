"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { Badge } from "@/components/ui/Badge";
import type { LegalDocumentContent, LegalDocumentSlug, LegalMateriality } from "@/types/legal";

interface LegalPublishDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (note: string, materiality: LegalMateriality) => void | Promise<void>;
  loading: boolean;
  slug: LegalDocumentSlug;
  content: LegalDocumentContent;
  baseContent: LegalDocumentContent | null;
  nextVersion: number;
}

function getChangeSummary(
  content: LegalDocumentContent,
  baseContent: LegalDocumentContent | null
): { added: number; modified: number; removed: number } {
  if (!baseContent) return { added: content.sections.length, modified: 0, removed: 0 };
  const baseMap = new Map(baseContent.sections.map((section) => [section.id, section]));
  const currentIds = new Set(content.sections.map((section) => section.id));
  let added = 0;
  let modified = 0;
  for (const section of content.sections) {
    const base = baseMap.get(section.id);
    if (!base) added += 1;
    else if (base.title !== section.title || base.body !== section.body) modified += 1;
  }
  const removed = baseContent.sections.filter((section) => !currentIds.has(section.id)).length;
  return { added, modified, removed };
}

export function LegalPublishDialog({
  open,
  onClose,
  onConfirm,
  loading,
  slug,
  content,
  baseContent,
  nextVersion,
}: LegalPublishDialogProps) {
  const [note, setNote] = useState("");
  const noteValid = note.trim().length >= 2;
  const changes = getChangeSummary(content, baseContent);
  const changedSections = changes.added + changes.modified + changes.removed;
  const orderChanged = baseContent
    ? content.sections.map((section) => section.id).join("|") !==
      baseContent.sections.map((section) => section.id).join("|")
    : false;
  const contentChanged =
    !baseContent ||
    JSON.stringify({ ...content, lastUpdated: baseContent.lastUpdated }) !==
      JSON.stringify(baseContent);
  const defaultMateriality: LegalMateriality =
    slug === "privacy" && (contentChanged || changedSections > 0 || orderChanged)
      ? "MATERIAL"
      : "NON_MATERIAL";
  const [materiality, setMateriality] = useState<LegalMateriality>(defaultMateriality);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open && !wasOpen.current) {
      setMateriality(defaultMateriality);
    }
    wasOpen.current = open;
  }, [defaultMateriality, open]);

  return (
    <Modal open={open} onClose={onClose} title="发布新版本" size="lg" closeOnBackdrop={!loading}>
      <div className="space-y-5">
        <div className="rounded-xl border border-line bg-surface-subtle p-4 text-sm text-brand-charcoal/70">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-ink-muted">版本</span>
            <strong className="font-semibold text-brand-charcoal">
              {nextVersion > 1 ? `v${nextVersion - 1} → ` : "首次发布 → "}v{nextVersion}
            </strong>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Badge variant="success" size="sm">
              新增 {changes.added}
            </Badge>
            <Badge variant="warning" size="sm">
              修改 {changes.modified}
            </Badge>
            <Badge variant="danger" size="sm">
              删除 {changes.removed}
            </Badge>
            {orderChanged ? (
              <Badge variant="secondary" size="sm">
                章节顺序调整
              </Badge>
            ) : null}
          </div>
          <p className="mt-3 text-xs text-ink-muted">
            共 {content.sections.length} 章，变更 {changedSections}{" "}
            章；“最近更新”将自动更新为今天（UTC+8）。
          </p>
        </div>

        {baseContent ? (
          <p className="text-xs text-ink-muted">
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
          autoFocus
          error={note.length > 0 && !noteValid ? "发布说明至少 2 个字符" : undefined}
          hint={noteValid ? `${note.length}/200` : "必填，用于审计记录与版本历史"}
        />

        <label className="block text-sm text-brand-charcoal">
          本次变更性质
          <select
            value={materiality}
            onChange={(event) => setMateriality(event.target.value as LegalMateriality)}
            className="mt-1 block h-10 w-full rounded-lg border border-line-strong bg-white px-3 text-sm text-brand-charcoal focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
          >
            <option value="MATERIAL">重大变更：要求重新同意</option>
            <option value="NON_MATERIAL">普通修订：不重新同意</option>
            <option value="CORRECTION">文字更正：不重新同意</option>
          </select>
          <span className="mt-1 block text-xs text-ink-muted">
            重大变更会要求所有未同意本版本的用户重新同意；普通修订和文字更正不会触发。
          </span>
        </label>

        <p className="text-xs text-ink-muted">
          发布属于高风险操作，确认后需要输入动态验证码，并写入审计日志与版本历史。
        </p>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            取消
          </Button>
          <Button
            onClick={() => {
              if (!noteValid) return;
              void onConfirm(note.trim(), materiality);
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

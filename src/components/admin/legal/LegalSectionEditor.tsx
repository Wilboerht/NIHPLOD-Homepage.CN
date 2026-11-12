"use client";

import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/admin/IconButton";
import { Badge } from "@/components/ui/Badge";
import type { LegalSection } from "@/types/legal";

interface LegalSectionEditorProps {
  section: LegalSection;
  index: number;
  total: number;
  expanded: boolean;
  readOnly: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<Pick<LegalSection, "title" | "body">>) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}

export function LegalSectionEditor({
  section,
  index,
  total,
  expanded,
  readOnly,
  onToggle,
  onChange,
  onMove,
  onRemove,
}: LegalSectionEditorProps) {
  const hasEmptyBody = section.body.trim().length === 0;

  return (
    <section className="rounded-xl border border-brand-charcoal/10 bg-white">
      <div className="flex items-center gap-2 px-3 py-2 sm:px-4">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex min-h-[44px] flex-1 items-center gap-2 text-left sm:min-h-0"
        >
          <span className="w-7 shrink-0 text-xs tabular-nums text-brand-charcoal/45">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-brand-charcoal">
            {section.title.trim() || "未命名章节"}
          </span>
          {hasEmptyBody ? (
            <Badge variant="warning" size="sm" className="shrink-0">
              待填写正文
            </Badge>
          ) : null}
          {expanded ? (
            <ChevronUp className="h-4 w-4 shrink-0 text-brand-charcoal/45" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0 text-brand-charcoal/45" aria-hidden="true" />
          )}
        </button>

        <div className="flex shrink-0 items-center">
          <IconButton
            label={`上移第 ${index + 1} 章`}
            onClick={() => onMove(-1)}
            disabled={readOnly || index === 0}
          >
            <ChevronUp className="h-4 w-4" aria-hidden="true" />
          </IconButton>
          <IconButton
            label={`下移第 ${index + 1} 章`}
            onClick={() => onMove(1)}
            disabled={readOnly || index === total - 1}
          >
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          </IconButton>
          <IconButton
            label={`删除第 ${index + 1} 章`}
            variant="danger"
            onClick={onRemove}
            disabled={readOnly || total <= 1}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </IconButton>
        </div>
      </div>

      {expanded ? (
        <div className="space-y-4 border-t border-brand-charcoal/10 px-3 pb-4 pt-4 sm:px-4">
          <div>
            <label
              htmlFor={`legal-section-title-${section.id}`}
              className="mb-1 block text-xs font-medium text-brand-charcoal/65"
            >
              章节标题
            </label>
            <input
              id={`legal-section-title-${section.id}`}
              value={section.title}
              readOnly={readOnly}
              maxLength={200}
              onChange={(event) => onChange({ title: event.target.value })}
              className="w-full rounded-lg border border-brand-charcoal/20 bg-white px-3 py-2 text-sm text-brand-charcoal focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary disabled:cursor-not-allowed disabled:bg-brand-charcoal/[0.03]"
              placeholder="例如：一、个人信息处理者信息"
            />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <label
                htmlFor={`legal-section-body-${section.id}`}
                className="block text-xs font-medium text-brand-charcoal/65"
              >
                正文（空行分段，支持 **粗体** 与 [文字](链接)）
              </label>
              <span className="text-[11px] tabular-nums text-brand-charcoal/45">
                {section.body.length.toLocaleString("zh-CN")} 字
              </span>
            </div>
            <textarea
              id={`legal-section-body-${section.id}`}
              value={section.body}
              readOnly={readOnly}
              onChange={(event) => onChange({ body: event.target.value })}
              rows={12}
              spellCheck={false}
              className="w-full resize-y rounded-lg border border-brand-charcoal/20 bg-white px-3 py-2.5 font-sans text-[14px] leading-7 text-brand-charcoal focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary disabled:cursor-not-allowed disabled:bg-brand-charcoal/[0.03]"
              placeholder="请输入章节正文，段落之间用空行分隔"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] text-brand-charcoal/40">章节 ID：{section.id}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onToggle}
              className="text-brand-charcoal/60"
            >
              收起
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

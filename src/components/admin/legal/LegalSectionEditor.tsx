"use client";

import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/admin/IconButton";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import type { LegalSection } from "@/types/legal";

interface LegalSectionEditorProps {
  section: LegalSection;
  index: number;
  total: number;
  expanded: boolean;
  readOnly: boolean;
  changed?: boolean;
  invalidTitle?: boolean;
  invalidBody?: boolean;
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
  changed = false,
  invalidTitle,
  invalidBody,
  onToggle,
  onChange,
  onMove,
  onRemove,
}: LegalSectionEditorProps) {
  const titleInvalid = invalidTitle ?? !section.title.trim();
  const bodyInvalid = invalidBody ?? !section.body.trim();

  return (
    <section
      id={`legal-section-${section.id}`}
      className="group scroll-mt-24 rounded-xl border border-line bg-white"
    >
      <div className="flex items-center gap-2 px-3 py-2 sm:px-4">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex min-h-[44px] flex-1 items-center gap-2 text-left sm:min-h-0"
        >
          <span className="w-7 shrink-0 text-xs tabular-nums text-ink-faint">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-brand-charcoal">
            {section.title.trim() || "未命名章节"}
          </span>
          {titleInvalid || bodyInvalid ? (
            <Badge variant="warning" size="sm" className="shrink-0">
              {titleInvalid && bodyInvalid
                ? "待完善"
                : titleInvalid
                  ? "待填写标题"
                  : "待填写正文"}
            </Badge>
          ) : changed ? (
            <Badge variant="primary" size="sm" className="shrink-0">
              已修改
            </Badge>
          ) : null}
          {expanded ? (
            <ChevronUp className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden="true" />
          )}
        </button>

        <div className="flex shrink-0 items-center opacity-100 transition-opacity sm:opacity-60 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
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
        <div className="space-y-4 border-t border-line px-3 pb-4 pt-4 sm:px-4">
          <div>
            <label
              htmlFor={`legal-section-title-${section.id}`}
              className="mb-1 block text-xs font-medium text-ink-muted"
            >
              章节标题
            </label>
            <input
              id={`legal-section-title-${section.id}`}
              value={section.title}
              readOnly={readOnly}
              maxLength={200}
              onChange={(event) => onChange({ title: event.target.value })}
              aria-invalid={titleInvalid || undefined}
              className={cn(
                "w-full rounded-lg border bg-white px-3 py-2 text-sm text-brand-charcoal focus:outline-none focus:ring-1 disabled:cursor-not-allowed disabled:bg-surface-muted",
                titleInvalid
                  ? "border-status-warning-fg focus:border-status-warning-fg focus:ring-status-warning-fg"
                  : "border-line-strong focus:border-brand-primary focus:ring-brand-primary"
              )}
              placeholder="例如：一、个人信息处理者信息"
            />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <label
                htmlFor={`legal-section-body-${section.id}`}
                className="block text-xs font-medium text-ink-muted"
              >
                正文（空行分段，支持 **粗体** 与 [文字](链接)）
              </label>
              <span className="text-2xs tabular-nums text-ink-faint">
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
              aria-invalid={bodyInvalid || undefined}
              className={cn(
                "w-full resize-y rounded-lg border bg-white px-3 py-2.5 font-sans text-sm leading-7 text-brand-charcoal focus:outline-none focus:ring-1 disabled:cursor-not-allowed disabled:bg-surface-muted",
                bodyInvalid
                  ? "border-status-warning-fg focus:border-status-warning-fg focus:ring-status-warning-fg"
                  : "border-line-strong focus:border-brand-primary focus:ring-brand-primary"
              )}
              placeholder="请输入章节正文，段落之间用空行分隔"
            />
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onToggle}
              className="text-ink-muted"
            >
              收起
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

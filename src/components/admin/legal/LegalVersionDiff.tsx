"use client";

import { useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { diffLines } from "@/lib/text-diff";
import type { LegalDocumentContent, LegalVersionDetail } from "@/types/legal";

interface LegalVersionDiffProps {
  open: boolean;
  onClose: () => void;
  baseContent: LegalDocumentContent | null;
  targetContent: LegalDocumentContent | null;
  baseLabel: string;
  targetLabel: string;
  baseMeta?: LegalVersionDetail | null;
  targetMeta?: LegalVersionDetail | null;
  onSwap?: () => void;
}

type SectionChange = "added" | "removed" | "modified" | "unchanged";

interface SectionDiffItem {
  id: string;
  change: SectionChange;
  title: string;
  oldBody: string;
  newBody: string;
}

function buildSectionDiffs(
  target: LegalDocumentContent,
  base: LegalDocumentContent
): SectionDiffItem[] {
  const baseMap = new Map(base.sections.map((section) => [section.id, section]));
  const targetIds = new Set(target.sections.map((section) => section.id));
  const items: SectionDiffItem[] = [];

  for (const section of target.sections) {
    const old = baseMap.get(section.id);
    if (!old) {
      items.push({
        id: section.id,
        change: "added",
        title: section.title,
        oldBody: "",
        newBody: section.body,
      });
    } else if (old.title !== section.title || old.body !== section.body) {
      items.push({
        id: section.id,
        change: "modified",
        title: section.title,
        oldBody: old.body,
        newBody: section.body,
      });
    } else {
      items.push({
        id: section.id,
        change: "unchanged",
        title: section.title,
        oldBody: old.body,
        newBody: section.body,
      });
    }
  }

  for (const section of base.sections) {
    if (!targetIds.has(section.id)) {
      items.push({
        id: section.id,
        change: "removed",
        title: section.title,
        oldBody: section.body,
        newBody: "",
      });
    }
  }

  return items;
}

const CHANGE_LABEL: Record<SectionChange, string> = {
  added: "新增",
  removed: "删除",
  modified: "修改",
  unchanged: "未变",
};

const CHANGE_BADGE: Record<SectionChange, "success" | "danger" | "warning" | "secondary"> = {
  added: "success",
  removed: "danger",
  modified: "warning",
  unchanged: "secondary",
};

function formatVersionMeta(meta: LegalVersionDetail): string {
  const author = meta.createdBy ?? "系统导入";
  return `${new Date(meta.createdAt).toLocaleString("zh-CN")} · ${author}`;
}

function DiffBody({ oldBody, newBody }: { oldBody: string; newBody: string }) {
  const lines = useMemo(() => diffLines(oldBody, newBody), [oldBody, newBody]);
  if (!lines) {
    return (
      <p className="rounded-lg bg-surface-muted p-3 text-xs text-ink-muted">
        章节内容过长，已省略逐行对比。可分别查看版本内容。
      </p>
    );
  }
  return (
    <div className="max-h-80 overflow-auto rounded-lg border border-line bg-white p-3 font-mono text-xs leading-6">
      {lines.map((line, index) => (
        <div
          key={index}
          className={cn(
            "whitespace-pre-wrap break-words px-1",
            line.type === "add" && "bg-status-success-soft text-status-success-strong",
            line.type === "remove" && "bg-status-danger-soft text-status-danger-strong line-through decoration-red-300",
            line.type === "same" && "text-ink-muted"
          )}
        >
          <span className="mr-2 select-none text-ink-faint">
            {line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}
          </span>
          {line.text || "\u00a0"}
        </div>
      ))}
    </div>
  );
}

export function LegalVersionDiff({
  open,
  onClose,
  baseContent,
  targetContent,
  baseLabel,
  targetLabel,
  baseMeta,
  targetMeta,
  onSwap,
}: LegalVersionDiffProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [onlyChanged, setOnlyChanged] = useState(true);
  const items = useMemo(
    () => (baseContent && targetContent ? buildSectionDiffs(targetContent, baseContent) : []),
    [baseContent, targetContent]
  );
  const changedItems = useMemo(
    () => items.filter((item) => item.change !== "unchanged"),
    [items]
  );
  const changedCounts = useMemo(
    () => ({
      added: changedItems.filter((item) => item.change === "added").length,
      modified: changedItems.filter((item) => item.change === "modified").length,
      removed: changedItems.filter((item) => item.change === "removed").length,
    }),
    [changedItems]
  );
  const changedCount = changedItems.length;
  const visibleItems = onlyChanged ? changedItems : items;
  const orderChanged = useMemo(() => {
    if (!baseContent || !targetContent) return false;
    const baseIds = baseContent.sections.map((section) => section.id);
    const targetIds = targetContent.sections.map((section) => section.id);
    const baseCommon = baseIds.filter((id) => targetIds.includes(id));
    const targetCommon = targetIds.filter((id) => baseIds.includes(id));
    return baseCommon.join("|") !== targetCommon.join("|");
  }, [baseContent, targetContent]);

  const toggle = (id: string) => {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Modal open={open} onClose={onClose} title="版本对比" size="xl">
      {!baseContent || !targetContent ? null : (
        <div className="space-y-5">
          <div className="rounded-xl border border-line bg-surface-subtle p-4 text-sm text-brand-charcoal/70">
            <p>
              <span className="text-ink-muted">基准：</span>
              {baseLabel}
              {baseMeta ? ` · ${formatVersionMeta(baseMeta)}` : ""}
            </p>
            <p>
              <span className="text-ink-muted">对比：</span>
              {targetLabel}
              {targetMeta ? ` · ${formatVersionMeta(targetMeta)}` : ""}
            </p>
            {baseMeta?.note ? <p>基准发布说明：{baseMeta.note}</p> : null}
            {targetMeta?.note ? <p>对比发布说明：{targetMeta.note}</p> : null}
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="success" size="sm">
                新增 {changedCounts.added}
              </Badge>
              <Badge variant="warning" size="sm">
                修改 {changedCounts.modified}
              </Badge>
              <Badge variant="danger" size="sm">
                删除 {changedCounts.removed}
              </Badge>
              {orderChanged ? (
                <Badge variant="secondary" size="sm">
                  章节顺序有调整
                </Badge>
              ) : null}
            </div>
            <p className="mt-2 text-xs text-ink-muted">
              {changedCount > 0 ? `${changedCount} 个章节有变化` : "两个版本内容一致"}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                aria-pressed={onlyChanged}
                onClick={() => setOnlyChanged((value) => !value)}
              >
                {onlyChanged ? `显示全部 ${items.length} 章` : "只看变更"}
              </Button>
              {onSwap ? (
                <Button variant="ghost" size="sm" onClick={onSwap}>
                  交换基准与对比
                </Button>
              ) : null}
            </div>
          </div>

          <div className="space-y-2">
            {visibleItems.length === 0 ? (
              <p className="rounded-xl border border-line bg-white p-6 text-center text-sm text-ink-muted">
                两个版本没有章节变化
              </p>
            ) : null}
            {visibleItems.map((item) => {
              const isOpen = !collapsed.has(item.id);
              return (
                <div key={item.id} className="rounded-xl border border-line bg-white">
                  <div className="flex items-center gap-2 px-3 py-2">
                    <Badge variant={CHANGE_BADGE[item.change]} size="sm">
                      {CHANGE_LABEL[item.change]}
                    </Badge>
                    <span className="min-w-0 flex-1 truncate text-sm text-brand-charcoal">
                      {item.title}
                    </span>
                    {item.change !== "unchanged" ? (
                      <Button variant="ghost" size="sm" onClick={() => toggle(item.id)}>
                        {isOpen ? "收起" : "查看差异"}
                      </Button>
                    ) : null}
                  </div>
                  {isOpen && item.change !== "unchanged" ? (
                    <div className="border-t border-line p-3">
                      <DiffBody oldBody={item.oldBody} newBody={item.newBody} />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="flex justify-end">
            <Button variant="outline" onClick={onClose}>
              关闭
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

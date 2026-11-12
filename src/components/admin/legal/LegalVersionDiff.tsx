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
  version: LegalVersionDetail | null;
  currentContent: LegalDocumentContent;
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
  current: LegalDocumentContent,
  version: LegalDocumentContent
): SectionDiffItem[] {
  const versionMap = new Map(version.sections.map((section) => [section.id, section]));
  const currentIds = new Set(current.sections.map((section) => section.id));
  const items: SectionDiffItem[] = [];

  for (const section of current.sections) {
    const old = versionMap.get(section.id);
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

  for (const section of version.sections) {
    if (!currentIds.has(section.id)) {
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

function DiffBody({ oldBody, newBody }: { oldBody: string; newBody: string }) {
  const lines = useMemo(() => diffLines(oldBody, newBody), [oldBody, newBody]);
  if (!lines) {
    return (
      <p className="rounded-lg bg-brand-charcoal/[0.03] p-3 text-xs text-brand-charcoal/55">
        章节内容过长，已省略逐行对比。可分别查看版本内容与当前草稿。
      </p>
    );
  }
  return (
    <div className="max-h-80 overflow-auto rounded-lg border border-brand-charcoal/10 bg-white p-3 font-mono text-[12px] leading-6">
      {lines.map((line, index) => (
        <div
          key={index}
          className={cn(
            "whitespace-pre-wrap break-words px-1",
            line.type === "add" && "bg-emerald-50 text-emerald-800",
            line.type === "remove" && "bg-red-50 text-red-700 line-through decoration-red-300",
            line.type === "same" && "text-brand-charcoal/60"
          )}
        >
          <span className="mr-2 select-none text-brand-charcoal/30">
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
  version,
  currentContent,
}: LegalVersionDiffProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const items = useMemo(
    () => (version ? buildSectionDiffs(currentContent, version.content) : []),
    [currentContent, version]
  );
  const changedCount = items.filter((item) => item.change !== "unchanged").length;
  const orderChanged = useMemo(() => {
    if (!version) return false;
    const versionIds = version.content.sections.map((section) => section.id);
    const currentIds = currentContent.sections.map((section) => section.id);
    const currentCommon = currentIds.filter((id) => versionIds.includes(id));
    const versionCommon = versionIds.filter((id) => currentIds.includes(id));
    return currentCommon.join("|") !== versionCommon.join("|");
  }, [currentContent, version]);

  const toggle = (id: string) => {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Modal open={open} onClose={onClose} title={`版本对比 · v${version?.version ?? ""}`} size="xl">
      {!version ? null : (
        <div className="space-y-5">
          <div className="rounded-xl border border-brand-charcoal/10 bg-brand-charcoal/[0.02] p-4 text-sm text-brand-charcoal/70">
            <p>版本时间：{new Date(version.createdAt).toLocaleString("zh-CN")}</p>
            <p>发布人：{version.createdBy ?? "系统导入"}</p>
            {version.note ? <p>发布说明：{version.note}</p> : null}
            <p>
              对比结果：{changedCount} 个章节有变化
              {orderChanged ? "，章节顺序已调整" : ""}
              （颜色标记为相对历史版本的增删）
            </p>
          </div>

          <div className="space-y-2">
            {items.map((item) => {
              const isOpen = expanded.has(item.id);
              return (
                <div key={item.id} className="rounded-xl border border-brand-charcoal/10 bg-white">
                  <div className="flex items-center gap-2 px-3 py-2">
                    <Badge variant={CHANGE_BADGE[item.change]} size="sm">
                      {CHANGE_LABEL[item.change]}
                    </Badge>
                    <span className="min-w-0 flex-1 truncate text-sm text-brand-charcoal">
                      {item.title}
                    </span>
                    {item.change === "modified" ||
                    item.change === "added" ||
                    item.change === "removed" ? (
                      <Button variant="ghost" size="sm" onClick={() => toggle(item.id)}>
                        {isOpen ? "收起" : "查看差异"}
                      </Button>
                    ) : null}
                  </div>
                  {isOpen && item.change !== "unchanged" ? (
                    <div className="border-t border-brand-charcoal/10 p-3">
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

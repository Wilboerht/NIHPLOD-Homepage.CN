"use client";

import { ListTree } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LegalSection } from "@/types/legal";

export type LegalSectionOutlineState = {
  invalid: boolean;
  changed: boolean;
};

interface LegalSectionOutlineProps {
  sections: LegalSection[];
  stateById: Record<string, LegalSectionOutlineState>;
  onSelect: (id: string) => void;
}

export function LegalSectionOutline({
  sections,
  stateById,
  onSelect,
}: LegalSectionOutlineProps) {
  const invalidCount = sections.filter((section) => stateById[section.id]?.invalid).length;

  return (
    <section className="rounded-card border border-line bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-brand-charcoal">
          <ListTree className="h-4 w-4 text-ink-faint" aria-hidden="true" />
          章节目录
        </h2>
        <span className="text-2xs tabular-nums text-ink-faint">
          {sections.length} 章
        </span>
      </div>
      {invalidCount > 0 ? (
        <p className="mt-2 text-2xs text-status-warning-strong">{invalidCount} 个章节待完善</p>
      ) : null}
      <ol className="mt-2 max-h-64 space-y-0.5 overflow-y-auto pr-1">
        {sections.map((section, index) => {
          const state = stateById[section.id];
          return (
            <li key={section.id}>
              <button
                type="button"
                onClick={() => onSelect(section.id)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-ink-muted transition-colors hover:bg-surface-muted hover:text-brand-charcoal focus:outline-none focus:ring-2 focus:ring-brand-primary"
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 shrink-0 rounded-full",
                    state?.invalid
                      ? "bg-status-warning-fg"
                      : state?.changed
                        ? "bg-brand-primary"
                        : "bg-brand-charcoal/20"
                  )}
                  aria-hidden="true"
                />
                <span className="w-5 shrink-0 tabular-nums text-ink-faint">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {section.title.trim() || "未命名章节"}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

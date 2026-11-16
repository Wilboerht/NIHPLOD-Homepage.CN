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
    <section className="rounded-2xl border border-brand-charcoal/10 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-brand-charcoal">
          <ListTree className="h-4 w-4 text-brand-charcoal/45" aria-hidden="true" />
          章节目录
        </h2>
        <span className="text-[11px] tabular-nums text-brand-charcoal/45">
          {sections.length} 章
        </span>
      </div>
      {invalidCount > 0 ? (
        <p className="mt-2 text-[11px] text-amber-700">{invalidCount} 个章节待完善</p>
      ) : null}
      <ol className="mt-2 max-h-64 space-y-0.5 overflow-y-auto pr-1">
        {sections.map((section, index) => {
          const state = stateById[section.id];
          return (
            <li key={section.id}>
              <button
                type="button"
                onClick={() => onSelect(section.id)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-brand-charcoal/65 transition-colors hover:bg-brand-charcoal/[0.04] hover:text-brand-charcoal focus:outline-none focus:ring-2 focus:ring-brand-primary"
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 shrink-0 rounded-full",
                    state?.invalid
                      ? "bg-amber-500"
                      : state?.changed
                        ? "bg-brand-primary"
                        : "bg-brand-charcoal/20"
                  )}
                  aria-hidden="true"
                />
                <span className="w-5 shrink-0 tabular-nums text-brand-charcoal/35">
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

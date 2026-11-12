"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

export function MessagesSourceTabs({
  showMain,
  showBa,
}: {
  showMain: boolean;
  showBa: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const source = showMain && searchParams.get("source") !== "ba" ? "main" : "ba";

  if (!showMain || !showBa) return null;

  const switchTo = (next: "main" | "ba") => {
    if (next === source) return;
    router.push(next === "ba" ? `${pathname}?source=ba` : pathname, { scroll: false });
  };

  return (
    <div className="flex items-center gap-1 rounded-xl bg-brand-charcoal/[0.04] p-1">
      <button
        type="button"
        aria-pressed={source === "main"}
        onClick={() => switchTo("main")}
        className={cn(
          "rounded-lg px-3 py-1.5 text-sm transition-colors",
          source === "main"
            ? "bg-white font-medium text-brand-charcoal shadow-sm"
            : "text-brand-charcoal/65 hover:bg-white/70 hover:text-brand-charcoal"
        )}
      >
        主站留言
      </button>
      <button
        type="button"
        aria-pressed={source === "ba"}
        onClick={() => switchTo("ba")}
        className={cn(
          "rounded-lg px-3 py-1.5 text-sm transition-colors",
          source === "ba"
            ? "bg-white font-medium text-brand-charcoal shadow-sm"
            : "text-brand-charcoal/65 hover:bg-white/70 hover:text-brand-charcoal"
        )}
      >
        BA 举报
      </button>
    </div>
  );
}

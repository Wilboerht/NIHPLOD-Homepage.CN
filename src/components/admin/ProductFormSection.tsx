import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** 产品表单分区：统一更紧凑的标题与内边距，避免长表单过度松散 */
export function ProductFormSection({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn("rounded-2xl border border-brand-charcoal/10 bg-white p-4 sm:p-5", className)}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-brand-charcoal">{title}</h2>
          {description && <p className="mt-1 text-xs text-brand-charcoal/65">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface FormSectionProps {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** compact 用于长表单，标题与内边距更紧凑。 */
  density?: "default" | "compact";
}

export function FormSection({
  title,
  description,
  action,
  children,
  className,
  density = "default",
}: FormSectionProps) {
  const compact = density === "compact";
  return (
    <section
      className={cn(
        "rounded-2xl border border-brand-charcoal/10 bg-white",
        compact ? "p-4 sm:p-5" : "p-4 sm:p-6",
        className
      )}
    >
      {(title || description || action) && (
        <div
          className={cn(
            "flex flex-wrap items-start justify-between gap-2",
            compact ? "mb-4" : "mb-4 sm:mb-6"
          )}
        >
          <div className="min-w-0">
            {title && (
              <h2
                className={cn(
                  "text-brand-charcoal",
                  compact ? "text-sm font-semibold" : "text-base font-medium sm:text-lg"
                )}
              >
                {title}
              </h2>
            )}
            {description && (
              <p className={cn("mt-1 text-brand-charcoal/65", compact ? "text-xs" : "text-sm")}>
                {description}
              </p>
            )}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

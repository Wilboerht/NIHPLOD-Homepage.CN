import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface FormSectionProps {
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function FormSection({ title, description, children, className }: FormSectionProps) {
  return (
    <section
      className={cn("rounded-2xl border border-brand-charcoal/10 bg-white p-4 sm:p-6", className)}
    >
      {(title || description) && (
        <div className="mb-4 sm:mb-6">
          {title && (
            <h2 className="text-base font-medium text-brand-charcoal sm:text-lg">{title}</h2>
          )}
          {description && <p className="mt-1 text-sm text-brand-charcoal/65">{description}</p>}
        </div>
      )}
      {children}
    </section>
  );
}

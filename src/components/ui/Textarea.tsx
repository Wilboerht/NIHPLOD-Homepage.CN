"use client";

import { TextareaHTMLAttributes, forwardRef, useId } from "react";
import { cn } from "@/lib/utils";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, hint, id, disabled, required, ...props }, ref) => {
    // 未显式传 id 时自动生成，保证 label 与错误提示可正确关联
    const generatedId = useId();
    const textareaId = id ?? generatedId;
    const errorId = `${textareaId}-error`;
    const hintId = `${textareaId}-hint`;
    const describedBy = error ? errorId : hint ? hintId : undefined;
    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={textareaId}
            className="mb-1.5 block text-sm font-medium text-brand-charcoal/80"
          >
            {label}
            {required && (
              <span className="ml-0.5 text-status-danger-fg" aria-hidden="true">
                *
              </span>
            )}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          disabled={disabled}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            "w-full rounded-lg border bg-white px-4 py-2.5 text-brand-charcoal transition-colors",
            "placeholder:text-ink-muted",
            "focus:outline-none focus:ring-2",
            error
              ? "border-status-danger-fg focus:border-status-danger-fg focus:ring-status-danger-fg/25"
              : "border-line-strong focus:border-brand-primary focus:ring-brand-primary/20",
            disabled && "cursor-not-allowed bg-surface-muted opacity-50",
            className
          )}
          {...props}
        />
        {error ? (
          <p id={errorId} className="mt-1.5 text-sm text-status-danger-fg">
            {error}
          </p>
        ) : hint ? (
          <p id={hintId} className="mt-1.5 text-xs text-ink-muted">
            {hint}
          </p>
        ) : null}
      </div>
    );
  }
);

Textarea.displayName = "Textarea";

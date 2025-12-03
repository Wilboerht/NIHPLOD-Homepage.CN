"use client";

import { TextareaHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

/**
 * 多行文本输入组件
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, id, rows = 4, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={id}
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={id}
          rows={rows}
          className={cn(
            "w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900",
            "placeholder:text-gray-400",
            "focus:border-brand-gold focus:outline-none focus:ring-1 focus:ring-brand-gold",
            "disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500",
            "resize-y min-h-[100px]",
            error && "border-red-500 focus:border-red-500 focus:ring-red-500",
            className
          )}
          {...props}
        />
        {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
      </div>
    );
  }
);

Textarea.displayName = "Textarea";


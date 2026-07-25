"use client";

import { InputHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, disabled, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={id} className="mb-1 block text-sm font-medium text-brand-charcoal/80">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          disabled={disabled}
          className={cn(
            "w-full rounded-lg border bg-white px-4 py-2.5 text-brand-charcoal",
            "placeholder:text-brand-charcoal/40",
            "focus:outline-none focus:ring-1",
            error
              ? "border-red-500 focus:border-red-500 focus:ring-red-500"
              : "border-brand-charcoal/20 focus:border-brand-primary focus:ring-brand-primary",
            disabled && "cursor-not-allowed opacity-50 bg-brand-charcoal/[0.03]",
            className
          )}
          {...props}
        />
        {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
      </div>
    );
  }
);

Input.displayName = "Input";

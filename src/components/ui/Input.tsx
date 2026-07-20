"use client";

import { InputHTMLAttributes, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

/**
 * 通用输入框组件
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = "", label, error, id, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={id} className="mb-1 block text-sm font-medium text-brand-charcoal">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          className={`w-full rounded border border-brand-beige bg-white px-4 py-2 text-brand-charcoal placeholder:text-brand-charcoal/40 focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary ${error ? "border-red-500" : ""} ${className}`}
          {...props}
        />
        {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
      </div>
    );
  }
);

Input.displayName = "Input";

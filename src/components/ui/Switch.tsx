"use client";

import { forwardRef, InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> {
  label?: string;
  description?: string;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
}

/**
 * 开关切换组件
 */
export const Switch = forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, label, description, checked = false, onChange, disabled, id, ...props }, ref) => {
    const handleChange = () => {
      if (!disabled && onChange) {
        onChange(!checked);
      }
    };

    return (
      <div className={cn("flex items-start gap-3", className)}>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          disabled={disabled}
          onClick={handleChange}
          className={cn(
            "relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200",
            "focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2",
            "disabled:cursor-not-allowed disabled:opacity-50",
            checked ? "bg-brand-primary" : "bg-gray-200"
          )}
        >
          <span
            className={cn(
              "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200",
              checked ? "translate-x-5" : "translate-x-0"
            )}
          />
        </button>

        {/* 隐藏的原生 input 用于表单提交 */}
        <input
          ref={ref}
          type="checkbox"
          id={id}
          checked={checked}
          onChange={() => onChange?.(!checked)}
          disabled={disabled}
          className="sr-only"
          {...props}
        />

        {(label || description) && (
          <div className="flex-1">
            {label && (
              <label
                htmlFor={id}
                className={cn(
                  "text-sm font-medium text-gray-900",
                  disabled && "cursor-not-allowed opacity-50"
                )}
              >
                {label}
              </label>
            )}
            {description && <p className="text-sm text-gray-500">{description}</p>}
          </div>
        )}
      </div>
    );
  }
);

Switch.displayName = "Switch";

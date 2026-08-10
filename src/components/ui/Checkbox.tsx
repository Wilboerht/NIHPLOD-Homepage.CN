"use client";

/**
 * Checkbox 复选框组件
 *
 * 受控组件，支持 label、描述、禁用、错误态。
 *
 * @example
 * ```tsx
 * <Checkbox
 *   checked={checked}
 *   onChange={setChecked}
 *   label="同意协议"
 *   description="阅读并同意用户协议"
 * />
 * ```
 */
import { InputHTMLAttributes, ReactNode, forwardRef, useId } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> {
  label?: ReactNode;
  description?: string;
  error?: string;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, description, error, checked = false, onChange, disabled, id, ...props }, ref) => {
    const autoId = useId();
    const inputId = id || autoId;

    return (
      <div className="w-full">
        <label
          htmlFor={inputId}
          className={cn(
            "flex cursor-pointer items-start gap-2.5",
            disabled && "cursor-not-allowed opacity-60"
          )}
        >
          <span className="relative mt-0.5 inline-flex flex-shrink-0">
            <input
              ref={ref}
              type="checkbox"
              id={inputId}
              checked={checked}
              onChange={(e) => onChange?.(e.target.checked)}
              disabled={disabled}
              aria-invalid={error ? true : undefined}
              {...props}
              className="peer h-4 w-4 appearance-none rounded border border-brand-charcoal/25 bg-white transition-colors checked:border-brand-primary checked:bg-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-1 disabled:cursor-not-allowed"
            />
            <Check
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 text-white opacity-0 transition-opacity peer-checked:opacity-100"
              strokeWidth={3}
            />
          </span>
          {(label || description) && (
            <span className="flex-1">
              {label && (
                <span className="block text-sm font-medium text-brand-charcoal">{label}</span>
              )}
              {description && (
                <span className="block text-xs text-brand-charcoal/50">{description}</span>
              )}
            </span>
          )}
        </label>
        {error && <p className="mt-1 pl-6 text-sm text-red-500">{error}</p>}
      </div>
    );
  }
);

Checkbox.displayName = "Checkbox";

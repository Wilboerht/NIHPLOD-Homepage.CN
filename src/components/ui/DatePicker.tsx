"use client";

/**
 * DatePicker 日期选择组件
 *
 * 基于原生 date input 的封装：label、错误态、必填标识、范围限制。
 * 移动端自动使用系统原生日期选择器。
 *
 * @example
 * ```tsx
 * <DatePicker
 *   label="开始日期"
 *   value={startDate}
 *   onChange={setStartDate}
 *   min="2026-01-01"
 * />
 * ```
 */
import { forwardRef, InputHTMLAttributes } from "react";
import { Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

interface DatePickerProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> {
  label?: string;
  error?: string;
  value?: string;
  onChange?: (value: string) => void;
}

export const DatePicker = forwardRef<HTMLInputElement, DatePickerProps>(
  (
    { className, label, error, value, onChange, id, required, disabled, min, max, ...props },
    ref
  ) => {
    const errorId = id ? `${id}-error` : undefined;

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={id} className="mb-1 block text-sm font-medium text-brand-charcoal/80">
            {label}
            {required && (
              <span className="ml-0.5 text-red-500" aria-hidden="true">
                *
              </span>
            )}
          </label>
        )}
        <div className="relative">
          <input
            ref={ref}
            type="date"
            id={id}
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
            disabled={disabled}
            required={required}
            min={min}
            max={max}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className={cn(
              "w-full rounded-lg border bg-white px-4 py-2.5 pr-10 text-brand-charcoal transition-colors",
              "focus:outline-none focus:ring-1",
              error
                ? "border-red-500 focus:border-red-500 focus:ring-red-500"
                : "border-brand-charcoal/20 focus:border-brand-primary focus:ring-brand-primary",
              "disabled:cursor-not-allowed disabled:bg-brand-charcoal/[0.03] disabled:opacity-50",
              "dark:[color-scheme:light]",
              !value && "text-transparent", // 隐藏浏览器默认日期格式，显示自定义占位
              className
            )}
            {...props}
          />
          {/* 空值时的自定义占位文本（原生 date input 不支持 placeholder） */}
          {!value && !disabled && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-brand-charcoal/40"
            >
              {props.placeholder || "选择日期"}
            </span>
          )}
          <Calendar
            aria-hidden="true"
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-charcoal/40"
          />
        </div>
        {error && (
          <p id={errorId} className="mt-1 text-sm text-red-500">
            {error}
          </p>
        )}
      </div>
    );
  }
);

DatePicker.displayName = "DatePicker";

"use client";

/**
 * Dropdown 下拉菜单组件
 *
 * 支持键盘导航：↑↓ 移动、Enter/Space 选择、Esc 关闭、Tab 关闭。
 * 点击外部自动关闭。
 *
 * @example
 * ```tsx
 * <Dropdown
 *   trigger={<span className="...">更多操作</span>}
 *   items={[
 *     { label: "编辑", onClick: () => {} },
 *     { label: "删除", danger: true, onClick: () => {} },
 *   ]}
 * />
 * ```
 */
import { ReactNode, useEffect, useRef, useState, useCallback } from "react";
import { cn } from "@/lib/utils";

export interface DropdownItem {
  label?: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  /** 分隔线；传 label 时渲染为菜单头部信息块 + 分隔线 */
  divider?: boolean;
}

interface DropdownProps {
  trigger: ReactNode;
  items: DropdownItem[];
  align?: "start" | "end";
  className?: string;
}

/**
 * 下拉菜单（含键盘导航）
 */
export function Dropdown({ trigger, items, align = "end", className }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // 可用的菜单项索引（排除 disabled）
  const enabledIndices = items
    .map((item, i) => (item.disabled || item.divider ? -1 : i))
    .filter((i) => i !== -1);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  // 打开时移动焦点到第一个可用菜单项（roving focus）
  useEffect(() => {
    if (open) {
      const first = enabledIndices[0];
      setActiveIndex(first ?? -1);
      const firstEl = menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]');
      firstEl?.focus();
    }
  }, [open]);

  // 键盘导航
  const handleTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen(true);
    }
  };

  const handleMenuKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const pos = enabledIndices.indexOf(activeIndex);
      const next = enabledIndices[Math.min(pos + 1, enabledIndices.length - 1)];
      if (next !== undefined) {
        setActiveIndex(next);
        menuRef.current
          ?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')
          [next]?.focus();
      }
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const pos = enabledIndices.indexOf(activeIndex);
      const prev = enabledIndices[Math.max(pos - 1, 0)];
      if (prev !== undefined) {
        setActiveIndex(prev);
        menuRef.current
          ?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')
          [prev]?.focus();
      }
      return;
    }
    if (e.key === "Tab") {
      setOpen(false);
      setActiveIndex(-1);
    }
  };

  const handleItemClick = useCallback(
    (item: DropdownItem) => {
      if (item.disabled) return;
      item.onClick?.();
      setOpen(false);
      setActiveIndex(-1);
    },
    []
  );

  return (
    <div ref={containerRef} className={cn("relative inline-block", className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => !v);
          setActiveIndex(-1);
        }}
        onKeyDown={handleTriggerKeyDown}
        className="inline-flex"
      >
        {trigger}
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          onKeyDown={handleMenuKeyDown}
          className={cn(
            "absolute z-[9998] mt-1 min-w-[160px] overflow-hidden rounded-lg border border-brand-charcoal/10 bg-white py-1 shadow-xl",
            align === "end" ? "right-0" : "left-0"
          )}
        >
          {items.map((item, index) =>
            item.divider ? (
              <div key={`divider-${index}`}>
                {/* divider 带 label 时渲染为菜单头部信息块 */}
                {item.label !== undefined && item.label !== null && (
                  <div className="px-3 py-2 text-xs text-brand-charcoal/50">{item.label}</div>
                )}
                <div role="separator" className="my-1 border-t border-brand-charcoal/10" />
              </div>
            ) : (
              <button
                key={index}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => handleItemClick(item)}
                onMouseEnter={() => setActiveIndex(index)}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
                  activeIndex === index && "bg-brand-charcoal/[0.06]",
                  item.danger
                    ? "text-red-600 hover:bg-red-50"
                    : "text-brand-charcoal/80 hover:bg-brand-charcoal/[0.06]",
                  item.disabled && "cursor-not-allowed opacity-40"
                )}
              >
                {item.icon}
                {item.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

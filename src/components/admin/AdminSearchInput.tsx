"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";

interface SearchInputProps {
  /** 已生效的查询值（通常来自 URL） */
  value: string;
  /** 提交查询：防抖后或按 Enter 时触发 */
  onCommit: (value: string) => void;
  ariaLabel: string;
  placeholder?: string;
  debounceMs?: number;
  className?: string;
  disabled?: boolean;
}

/**
 * 管理端统一搜索框：
 * - 输入停止后自动提交（默认 300ms）
 * - Enter 立即提交
 * - 清除按钮立即提交空值
 * - URL 前进/后退时同步输入框
 */
export function AdminSearchInput({
  value,
  onCommit,
  ariaLabel,
  placeholder = "搜索...",
  debounceMs = 300,
  className,
  disabled,
}: SearchInputProps) {
  const [draft, setDraft] = useState(value);
  const [prevValue, setPrevValue] = useState(value);
  const lastCommittedRef = useRef(value);
  const onCommitRef = useRef(onCommit);

  useEffect(() => {
    onCommitRef.current = onCommit;
  }, [onCommit]);

  if (prevValue !== value) {
    setPrevValue(value);
    setDraft(value);
  }

  useEffect(() => {
    const trimmed = draft.trim();
    if (trimmed === value || trimmed === lastCommittedRef.current) return;
    const timer = window.setTimeout(() => {
      lastCommittedRef.current = trimmed;
      onCommitRef.current(trimmed);
    }, debounceMs);
    return () => window.clearTimeout(timer);
  }, [debounceMs, draft, value]);

  const submitImmediately = (next: string) => {
    const trimmed = next.trim();
    lastCommittedRef.current = trimmed;
    onCommitRef.current(trimmed);
  };

  return (
    <div className={cn("relative w-full", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-brand-charcoal/65" />
      <Input
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={draft}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            submitImmediately(draft);
          }
        }}
        className={draft ? "pl-10 pr-10" : "pl-10"}
      />
      {draft && (
        <button
          type="button"
          onClick={() => {
            setDraft("");
            submitImmediately("");
          }}
          aria-label="清除搜索"
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-brand-charcoal/65 transition-colors hover:bg-brand-charcoal/[0.06] hover:text-brand-charcoal"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

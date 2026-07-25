"use client";

import { useState, KeyboardEvent } from "react";
import { X, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  maxTags?: number;
  maxLength?: number;
  label?: string;
  error?: string;
  className?: string;
}

export function TagInput({
  value = [],
  onChange,
  placeholder = "输入后按回车添加",
  maxTags = 20,
  maxLength = 50,
  label,
  error,
  className,
}: TagInputProps) {
  const [input, setInput] = useState("");

  const addTag = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    if (value.includes(trimmed)) {
      setInput("");
      return;
    }
    if (value.length >= maxTags) return;

    onChange([...value, trimmed]);
    setInput("");
  };

  const removeTag = (index: number) => {
    const newTags = [...value];
    newTags.splice(index, 1);
    onChange(newTags);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addTag();
    } else if (e.key === "Backspace" && !input && value.length > 0) {
      removeTag(value.length - 1);
    }
  };

  return (
    <div className={className}>
      {label && <label className="mb-1.5 block text-sm font-medium text-brand-charcoal/80">{label}</label>}

      <div
        className={cn(
          "flex flex-wrap items-center gap-2 rounded-lg border bg-white px-3 py-2",
          "focus-within:border-brand-primary focus-within:ring-1 focus-within:ring-brand-primary",
          error ? "border-red-500" : "border-brand-charcoal/20"
        )}
      >
        {/* 已添加的标签 */}
        {value.map((tag, index) => (
          <span
            key={`${tag}-${index}`}
            className="inline-flex items-center gap-1 rounded-full bg-brand-primary/10 px-3 py-1 text-sm text-brand-primary"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(index)}
              className="rounded-full p-0.5 hover:bg-brand-primary/20"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}

        {/* 输入框 */}
        {value.length < maxTags && (
          <div className="flex flex-1 items-center gap-1">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value.slice(0, maxLength))}
              onKeyDown={handleKeyDown}
              onBlur={addTag}
              placeholder={value.length === 0 ? placeholder : ""}
              className="min-w-[120px] flex-1 border-0 bg-transparent p-0 text-sm focus:outline-none focus:ring-0"
            />
            {input && (
              <button
                type="button"
                onClick={addTag}
                className="rounded p-1 text-brand-charcoal/50 hover:bg-brand-charcoal/[0.06] hover:text-brand-charcoal"
              >
                <Plus className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* 提示信息 */}
      <div className="mt-1 flex items-center justify-between text-xs">
        {error ? (
          <span className="text-red-500">{error}</span>
        ) : (
          <span className="text-brand-charcoal/50">按回车添加标签</span>
        )}
        <span className="text-brand-charcoal/50">
          {value.length}/{maxTags}
        </span>
      </div>
    </div>
  );
}

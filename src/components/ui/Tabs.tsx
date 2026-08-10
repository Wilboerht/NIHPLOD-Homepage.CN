"use client";

/**
 * Tabs 标签页组件
 *
 * 支持受控/非受控模式，遵循 ARIA tabs 模式（左右键切换）。
 *
 * @example
 * ```tsx
 * <Tabs
 *   tabs={[
 *     { key: "overview", label: "概览", content: <div>...</div> },
 *     { key: "detail", label: "详情", content: <div>...</div> },
 *   ]}
 * />
 * ```
 */
import { useState, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";

export interface TabItem {
  key: string;
  label: React.ReactNode;
  content?: React.ReactNode;
  disabled?: boolean;
}

interface TabsProps {
  tabs: TabItem[];
  defaultKey?: string;
  value?: string;
  onChange?: (key: string) => void;
  className?: string;
}

/**
 * 标签页组件
 */
export function Tabs({ tabs, defaultKey, value, onChange, className }: TabsProps) {
  const [internalKey, setInternalKey] = useState(defaultKey || tabs[0]?.key || "");
  const activeKey = value ?? internalKey;
  const tabListRef = useRef<HTMLDivElement>(null);

  const activeIndex = tabs.findIndex((t) => t.key === activeKey);

  const selectTab = useCallback(
    (key: string) => {
      if (value === undefined) setInternalKey(key);
      onChange?.(key);
    },
    [value, onChange]
  );

  // 键盘导航（左右键切换，Home/End 首尾）
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const enabledTabs = tabs.map((t, i) => (t.disabled ? -1 : i)).filter((i) => i !== -1);
    if (enabledTabs.length === 0) return;

    let next = -1;
    if (e.key === "ArrowRight") {
      next = enabledTabs[Math.min(enabledTabs.indexOf(activeIndex) + 1, enabledTabs.length - 1)];
    } else if (e.key === "ArrowLeft") {
      next = enabledTabs[Math.max(enabledTabs.indexOf(activeIndex) - 1, 0)];
    } else if (e.key === "Home") {
      next = enabledTabs[0];
    } else if (e.key === "End") {
      next = enabledTabs[enabledTabs.length - 1];
    } else {
      return;
    }

    e.preventDefault();
    if (next >= 0) {
      selectTab(tabs[next].key);
      // 移动焦点到对应 tab
      const tabEl = tabListRef.current?.querySelector<HTMLButtonElement>(
        `[data-tab-key="${tabs[next].key}"]`
      );
      tabEl?.focus();
    }
  };

  const activeTab = tabs[activeIndex];

  return (
    <div className={cn("w-full", className)}>
      <div
        ref={tabListRef}
        role="tablist"
        aria-label="标签页"
        onKeyDown={handleKeyDown}
        className="flex border-b border-brand-charcoal/10"
      >
        {tabs.map((tab) => {
          const isActive = tab.key === activeKey;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              id={`tab-${tab.key}`}
              data-tab-key={tab.key}
              aria-selected={isActive}
              aria-controls={`tabpanel-${tab.key}`}
              aria-disabled={tab.disabled}
              disabled={tab.disabled}
              tabIndex={isActive ? 0 : -1}
              onClick={() => selectTab(tab.key)}
              className={cn(
                "-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "border-brand-primary text-brand-primary"
                  : "border-transparent text-brand-charcoal/50 hover:text-brand-charcoal",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-1",
                tab.disabled && "cursor-not-allowed opacity-40"
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {activeTab?.content && (
        <div
          role="tabpanel"
          id={`tabpanel-${activeTab.key}`}
          aria-labelledby={`tab-${activeTab.key}`}
          className="pt-4"
        >
          {activeTab.content}
        </div>
      )}
    </div>
  );
}

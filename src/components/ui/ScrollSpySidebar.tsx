"use client";

import { useEffect, useRef, useState } from "react";

interface Section {
  id: string;
  title: string;
}

interface ScrollSpySidebarProps {
  sections: Section[];
  /** 导航 aria-label */
  label?: string;
}

/**
 * 带 IntersectionObserver + rAF 防抖的滚动监听侧边栏
 * 移动端隐藏，仅 lg 以上显示
 */
export default function ScrollSpySidebar({
  sections,
  label = "目录导航",
}: ScrollSpySidebarProps) {
  const [activeId, setActiveId] = useState<string>("");
  const rafRef = useRef<number | null>(null);
  const navRef = useRef<HTMLDivElement>(null);
  const visibleSectionsRef = useRef<Set<string>>(new Set());

  // 活跃项变更时自动滚动到可视区域
  useEffect(() => {
    if (!activeId || !navRef.current) return;
    const activeBtn = navRef.current.querySelector(
      `[data-section-id="${activeId}"]`
    ) as HTMLElement | null;
    if (activeBtn) {
      activeBtn.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [activeId]);

  useEffect(() => {
    if (sections.length === 0) return;

    const visibleSet = visibleSectionsRef.current;
    visibleSet.clear();

    const selectActive = () => {
      if (visibleSet.size === 0) return;
      // 在 sections 顺序中找到第一个可见的（即页面位置最靠上的）
      const firstVisible = sections.find((s) => visibleSet.has(s.id));
      if (firstVisible) setActiveId(firstVisible.id);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            visibleSet.add(entry.target.id);
          } else {
            visibleSet.delete(entry.target.id);
          }
        });

        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(selectActive);
      },
      {
        // 顶部偏移 96px（sticky header），底部不设限制让末章节也能被检测
        rootMargin: "-96px 0px 0px 0px",
        threshold: 0,
      }
    );

    const els = sections
      .map((s) => document.getElementById(s.id))
      .filter(Boolean) as HTMLElement[];
    els.forEach((el) => observer.observe(el));

    return () => {
      observer.disconnect();
      visibleSet.clear();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [sections]);

  return (
    <aside className="hidden lg:block w-72 shrink-0">
      <div
        ref={navRef}
        className="sticky top-32 max-h-[calc(100vh-10rem)] overflow-y-auto overscroll-contain scrollbar-hide"
      >
        <nav
          className="flex flex-col space-y-1"
          aria-label={label}
        >
          {sections.map((section) => (
            <button
              key={section.id}
              type="button"
              data-section-id={section.id}
              onClick={() => {
                const el = document.getElementById(section.id);
                if (el) el.scrollIntoView({ behavior: "smooth" });
              }}
              aria-current={activeId === section.id ? "true" : undefined}
              className={`group flex flex-col py-3 px-4 border-l transition-all duration-200 text-left ${
                activeId === section.id
                  ? "border-[#00263E]"
                  : "border-zinc-200 hover:border-[#00263E]"
              }`}
            >
              <span
                className={`text-sm font-medium transition-colors ${
                  activeId === section.id
                    ? "text-zinc-900"
                    : "text-zinc-500 group-hover:text-zinc-900"
                }`}
              >
                {section.title}
              </span>
            </button>
          ))}
        </nav>
      </div>
    </aside>
  );
}

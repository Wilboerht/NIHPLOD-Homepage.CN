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
export default function ScrollSpySidebar({ sections, label = "目录导航" }: ScrollSpySidebarProps) {
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
      const firstVisible = sections.find((s) => visibleSet.has(s.id));
      if (firstVisible) setActiveId(firstVisible.id);
    };

    // 普通章节：底部留 40% 防止过早激活
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
        rootMargin: "-120px 0px -40% 0px",
        threshold: 0,
      }
    );

    // 最后一个章节：不设底部边距，确保能被检测到
    const lastObserver = new IntersectionObserver(
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
        rootMargin: "-120px 0px 0px 0px",
        threshold: 0,
      }
    );

    const allButLast = sections.slice(0, -1);
    const lastSection = sections[sections.length - 1];

    allButLast
      .map((s) => document.getElementById(s.id))
      .filter(Boolean)
      .forEach((el) => observer.observe(el!));

    const lastEl = document.getElementById(lastSection.id);
    if (lastEl) lastObserver.observe(lastEl);

    return () => {
      observer.disconnect();
      lastObserver.disconnect();
      visibleSet.clear();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [sections]);

  return (
    <aside className="hidden w-72 shrink-0 lg:block">
      <div
        ref={navRef}
        className="scrollbar-hide sticky top-[120px] md:top-32 max-h-[calc(100vh-8rem)] overflow-y-auto overscroll-contain"
      >
        <nav className="flex flex-col space-y-1" aria-label={label}>
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
              className={`group flex flex-col border-l px-4 py-3 text-left transition-all duration-200 ${
                activeId === section.id
                  ? "border-[#00263E]"
                  : "border-brand-charcoal/20 hover:border-brand-charcoal/40"
              }`}
            >
              <span
                className={`text-sm font-light tracking-[0.12em] transition-colors ${
                  activeId === section.id
                    ? "text-brand-charcoal"
                    : "text-brand-charcoal/50 group-hover:text-brand-charcoal"
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

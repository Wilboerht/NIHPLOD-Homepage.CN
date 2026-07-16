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

  useEffect(() => {
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // 收集所有进入视口的 section
        const visible = entries
          .filter((e) => e.isIntersecting)
          .map((e) => e.target.id);

        if (visible.length > 0) {
          // rAF 防抖：合并同一帧内的多次回调
          if (rafRef.current) cancelAnimationFrame(rafRef.current);
          rafRef.current = requestAnimationFrame(() => {
            // 取 sections 顺序中第一个可见的（即最靠上的）
            const firstVisible = sections.find((s) => visible.includes(s.id));
            if (firstVisible) setActiveId(firstVisible.id);
          });
        }
      },
      {
        // 顶部偏移 96px（sticky header + h2 margin），底部留 60% 确保足够内容可见才激活
        rootMargin: "-96px 0px -60% 0px",
        threshold: 0,
      }
    );

    // 观察所有 section
    const els = sections
      .map((s) => document.getElementById(s.id))
      .filter(Boolean) as HTMLElement[];
    els.forEach((el) => observer.observe(el));

    return () => {
      observer.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [sections]);

  return (
    <aside className="hidden lg:block w-72 shrink-0">
      <div className="sticky top-32 max-h-[calc(100vh-10rem)] overflow-y-auto overscroll-contain scrollbar-hide">
        <nav
          className="flex flex-col space-y-1"
          aria-label={label}
        >
          {sections.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => {
                const el = document.getElementById(section.id);
                if (el) el.scrollIntoView({ behavior: "smooth" });
              }}
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

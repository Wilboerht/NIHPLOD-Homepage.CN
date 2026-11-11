"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

interface Section {
  id: string;
  title: string;
}

interface ScrollSpySidebarProps {
  sections: Section[];
  label?: string;
  variant?: "desktop" | "mobile";
}

/** 政策/条款目录：桌面右侧粘性导航，移动端使用原生 details 折叠。 */
export default function ScrollSpySidebar({
  sections,
  label = "目录导航",
  variant = "desktop",
}: ScrollSpySidebarProps) {
  const [activeId, setActiveId] = useState<string>("");
  const rafRef = useRef<number | null>(null);
  const navRef = useRef<HTMLDivElement>(null);
  const visibleSectionsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (variant !== "desktop" || !activeId || !navRef.current) return;
    const activeLink = navRef.current.querySelector<HTMLElement>(`[data-section-id="${activeId}"]`);
    if (!activeLink) return;
    const nav = navRef.current;
    const navRect = nav.getBoundingClientRect();
    const linkRect = activeLink.getBoundingClientRect();
    const margin = 12;
    if (linkRect.top < navRect.top + margin) {
      nav.scrollTop -= navRect.top + margin - linkRect.top;
    } else if (linkRect.bottom > navRect.bottom - margin) {
      nav.scrollTop += linkRect.bottom - (navRect.bottom - margin);
    }
  }, [activeId, variant]);

  useEffect(() => {
    if (variant !== "desktop" || sections.length === 0) return;
    const visibleSet = visibleSectionsRef.current;
    visibleSet.clear();

    const selectActive = () => {
      if (visibleSet.size === 0) return;
      const firstVisible = sections.find((section) => visibleSet.has(section.id));
      if (firstVisible) setActiveId(firstVisible.id);
    };
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) visibleSet.add(entry.target.id);
          else visibleSet.delete(entry.target.id);
        });
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(selectActive);
      },
      { rootMargin: "-120px 0px -40% 0px", threshold: 0 }
    );
    const lastObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) visibleSet.add(entry.target.id);
          else visibleSet.delete(entry.target.id);
        });
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(selectActive);
      },
      { rootMargin: "-120px 0px 0px 0px", threshold: 0 }
    );

    sections.slice(0, -1).forEach((section) => {
      const element = document.getElementById(section.id);
      if (element) observer.observe(element);
    });
    const lastSection = sections[sections.length - 1];
    const lastElement = document.getElementById(lastSection.id);
    if (lastElement) lastObserver.observe(lastElement);

    return () => {
      observer.disconnect();
      lastObserver.disconnect();
      visibleSet.clear();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [sections, variant]);

  const list = (
    <ul className="flex flex-col space-y-1">
      {sections.map((section) => (
        <li key={section.id}>
          <a
            href={`#${section.id}`}
            data-section-id={section.id}
            aria-current={activeId === section.id ? "location" : undefined}
            className={`group flex flex-col border-l px-4 py-2.5 text-left transition-all duration-200 ${
              activeId === section.id
                ? "border-brand-primary"
                : "border-brand-charcoal/20 hover:border-brand-charcoal/40"
            }`}
          >
            <span
              className={`text-sm font-light tracking-[0.04em] transition-colors ${
                activeId === section.id
                  ? "text-brand-charcoal"
                  : "text-brand-charcoal/65 group-hover:text-brand-charcoal"
              }`}
            >
              {section.title}
            </span>
          </a>
        </li>
      ))}
    </ul>
  );

  if (variant === "mobile") {
    return (
      <details className="group mt-6 rounded-xl border border-brand-charcoal/10 bg-brand-charcoal/[0.02] px-4 py-3 xl:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-brand-charcoal">
          <span>章节目录</span>
          <ChevronDown
            className="h-4 w-4 text-brand-charcoal/65 transition-transform group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>
        <nav aria-label={label} className="mt-3 border-t border-brand-charcoal/10 pt-3">
          {list}
        </nav>
      </details>
    );
  }

  return (
    <aside className="hidden xl:col-start-3 xl:block xl:pl-10 2xl:pl-14">
      <div
        ref={navRef}
        className="scrollbar-hide sticky top-[120px] max-h-[calc(100vh-8rem)] overflow-y-auto overscroll-contain"
      >
        <p className="mb-3 px-4 text-xs font-medium tracking-[0.08em] text-brand-charcoal/65">
          目录
        </p>
        <nav aria-label={label}>{list}</nav>
      </div>
    </aside>
  );
}

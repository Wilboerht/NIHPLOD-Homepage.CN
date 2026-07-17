"use client";

import { useState, useEffect, useLayoutEffect, useRef, useId, type ReactNode } from "react";
import { m } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { useLayout } from "@/contexts/LayoutContext";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { cn } from "@/lib/utils";

interface DrawerPageContainerProps {
  children: ReactNode;
  defaultExpanded?: boolean;
  buttonWidth?: string;
  shadowOpacity?: number;
  wrapperClassName?: string;
  onCollapse?: () => void;
}

const TRANSITION = { duration: 0.8, ease: [0.22, 1, 0.36, 1] as const };
const SLIDE_TRANSITION = {
  duration: 1.2,
  ease: [0.22, 1, 0.36, 1] as const,
};

export function DrawerPageContainer({
  children,
  defaultExpanded = false,
  buttonWidth = "w-[140px] lg:w-[160px]",
  shadowOpacity = 0.2,
  wrapperClassName = "!-top-[1px] !pointer-events-none",
  onCollapse,
}: DrawerPageContainerProps) {
  const contentId = useId();
  const handleRef = useRef<HTMLButtonElement>(null);
  const [handleHeight, setHandleHeight] = useState(0);
  const { isDrawerOpen, setDrawerOpen, setDrawerAnimating } = useLayout();
  const prefersReducedMotion = useReducedMotion();

  useLayoutEffect(() => {
    if (!handleRef.current || typeof ResizeObserver === "undefined") return;

    const updateHandleHeight = () => {
      setHandleHeight(handleRef.current?.offsetHeight ?? 0);
    };

    updateHandleHeight();
    const observer = new ResizeObserver(updateHandleHeight);
    observer.observe(handleRef.current);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    // 入场动画由 framer-motion 的 initial（收起位置）→ animate（展开位置）在挂载时
    // 自动播放，这里只需保证挂载后全局状态为展开。
    // 减少动画偏好时 MotionConfig 已把动画时长降为 0.01s，等价于直接展开。
    if (prefersReducedMotion || !defaultExpanded) {
      setDrawerOpen(true);
      return;
    }

    // 首页：先重置为收起，等收起状态真正绘制一帧后再展开（双 rAF），
    // 从而重播内容淡入过渡，并在入场期间隐藏底部导航栏。
    setDrawerAnimating(true);
    setDrawerOpen(false);

    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        setDrawerOpen(true);
        setDrawerAnimating(false);
      });
    });

    return () => {
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
      setDrawerAnimating(false);
    };
  }, [defaultExpanded, prefersReducedMotion, setDrawerOpen, setDrawerAnimating]);

  const handleToggle = () => {
    const newState = !isDrawerOpen;
    setDrawerOpen(newState);
    if (!newState && onCollapse) {
      onCollapse();
    }
  };

  const collapsedTransform = handleHeight
    ? `translate3d(0, calc(-100% + ${handleHeight}px), 0)`
    : "translate3d(0, -100%, 0)";

  return (
    <m.div className={cn("safe-area-content", wrapperClassName)} transition={TRANSITION}>
      <m.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={TRANSITION}
        className="pointer-events-none h-full"
      >
        <div
          className="pointer-events-none flex h-full flex-col items-center"
          style={{
            filter: `drop-shadow(4px 2px 1px rgba(0, 38, 62, ${shadowOpacity}))`,
          }}
        >
          <m.div
            className="relative z-20 flex h-full w-full flex-col"
            initial={{
              transform: collapsedTransform,
            }}
            animate={{
              transform: isDrawerOpen ? "translate3d(0, 0, 0)" : collapsedTransform,
            }}
            transition={{
              ...SLIDE_TRANSITION,
              delay: isDrawerOpen ? 0.3 : 0,
            }}
          >
            <div
              id={contentId}
              inert={!isDrawerOpen}
              className="pointer-events-auto relative min-h-0 w-full flex-1 overflow-hidden rounded-b-2xl bg-[#FBF8F0] lg:rounded-b-3xl 2xl:max-w-[1600px] 2xl:mx-auto"
            >
              {children}
            </div>

            <button
              ref={handleRef}
              type="button"
              onClick={handleToggle}
              aria-expanded={isDrawerOpen}
              aria-controls={contentId}
              aria-label={isDrawerOpen ? "收起页面内容" : "展开页面内容"}
              className={cn(
                "group pointer-events-auto relative z-30 -mt-[1px] flex items-center justify-center self-center overflow-hidden rounded-b-2xl bg-[#FBF8F0] py-3 lg:py-3.5",
                buttonWidth
              )}
            >
              <div className="texture-overlay absolute inset-0 rounded-b-2xl" />
              <m.div
                className="relative z-10 flex flex-col items-center"
                animate={{ rotate: isDrawerOpen ? 180 : 0, scale: 1 }}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                transition={TRANSITION}
              >
                <ChevronDown className="h-7 w-7 text-brand-gold lg:h-8 lg:w-8" />
                <ChevronDown className="-mt-5 h-7 w-7 text-brand-gold lg:h-8 lg:w-8" />
              </m.div>
            </button>
          </m.div>
        </div>
      </m.div>
    </m.div>
  );
}

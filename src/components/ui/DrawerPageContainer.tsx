"use client";

import { useState, useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { m } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { useLayout } from "@/contexts/LayoutContext";
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
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const handleRef = useRef<HTMLButtonElement>(null);
  const [handleHeight, setHandleHeight] = useState(0);
  const { isDrawerOpen, setDrawerOpen } = useLayout();

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
    if (isDrawerOpen && !isExpanded) {
      setIsExpanded(true);
    } else if (!isDrawerOpen && isExpanded) {
      setIsExpanded(false);
    }
  }, [isDrawerOpen, isExpanded]);

  useEffect(() => {
    if (defaultExpanded) {
      setDrawerOpen(true);
      return;
    }
    const timer = setTimeout(() => {
      setIsExpanded(true);
      setDrawerOpen(true);
    }, 100);
    return () => clearTimeout(timer);
  }, [defaultExpanded, setDrawerOpen]);

  const handleToggle = () => {
    const newState = !isExpanded;
    setIsExpanded(newState);
    setDrawerOpen(newState);
    if (!newState && onCollapse) {
      onCollapse();
    }
  };

  const collapsedTransform = handleHeight
    ? `translate3d(0, calc(-100% + ${handleHeight}px), 0)`
    : "translate3d(0, -100%, 0)";

  return (
    <m.div
      className={cn("safe-area-content", wrapperClassName)}
      transition={TRANSITION}
    >
      <m.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={TRANSITION}
        className="h-full pointer-events-none"
      >
        <div
          className="flex h-full flex-col items-center pointer-events-none"
          style={{
            filter: `drop-shadow(4px 2px 1px rgba(0, 38, 62, ${shadowOpacity}))`,
          }}
        >
          <m.div
            className="relative z-20 flex h-full w-full flex-col"
            style={{ willChange: "transform" }}
            initial={{
              transform: defaultExpanded
                ? "translate3d(0, 0, 0)"
                : collapsedTransform,
            }}
            animate={{
              transform: isExpanded
                ? "translate3d(0, 0, 0)"
                : collapsedTransform,
            }}
            transition={{
              ...SLIDE_TRANSITION,
              delay: isExpanded ? 0.3 : 0,
            }}
          >
            <div className="relative w-full flex-1 min-h-0 overflow-hidden rounded-b-2xl bg-[#FAF5EA] lg:rounded-b-3xl pointer-events-auto">
              {children}
            </div>

            <button
              ref={handleRef}
              type="button"
              onClick={handleToggle}
              className={cn(
                "group -mt-[1px] relative z-30 flex self-center items-center justify-center rounded-b-2xl bg-[#FAF5EA] py-3 lg:py-3.5 overflow-hidden pointer-events-auto",
                buttonWidth
              )}
            >
              <div className="texture-overlay absolute inset-0 rounded-b-2xl" />
              <m.div
                className="relative z-10 flex flex-col items-center"
                animate={{ rotate: isExpanded ? 180 : 0, scale: 1 }}
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

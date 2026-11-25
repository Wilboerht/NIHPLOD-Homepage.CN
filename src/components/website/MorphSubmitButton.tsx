"use client";

import { useEffect, useRef, useState } from "react";
import { m, useReducedMotion } from "framer-motion";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type MorphButtonPhase = "idle" | "loading" | "done";

interface MorphSubmitButtonProps {
  phase: MorphButtonPhase;
  idleLabel?: string;
  doneLabel?: string;
}

const EASE: [number, number, number, number] = [0.4, 0, 0.2, 1];

export function MorphSubmitButton({
  phase,
  idleLabel = "提交留言",
  doneLabel = "已提交",
}: MorphSubmitButtonProps) {
  const hostRef = useRef<HTMLButtonElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const reduceMotion = useReducedMotion();
  const collapsed = phase === "loading";
  const done = phase === "done";

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const updateSize = () => {
      setSize({ width: host.clientWidth, height: host.clientHeight });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  return (
    <button
      ref={hostRef}
      type="submit"
      aria-busy={collapsed}
      aria-label={done ? doneLabel : idleLabel}
      className={cn(
        "group relative flex h-12 w-full items-center justify-center rounded-full text-brand-charcoal outline-none md:h-11",
        phase === "idle" &&
          "transition-transform duration-300 hover:-translate-y-px active:translate-y-0"
      )}
    >
      <m.span
        aria-hidden
        className="absolute left-1/2 top-0 h-full -translate-x-1/2 overflow-hidden rounded-full border border-brand-charcoal/15 bg-brand-ecru shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_1px_2px_rgba(0,38,62,0.08)] transition-colors duration-300 group-hover:bg-[#dcd0b2] group-focus-visible:ring-2 group-focus-visible:ring-brand-primary/25 group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-[#fefcf8]"
        initial={false}
        animate={{ width: size ? (collapsed ? size.height : size.width) : "100%" }}
        transition={
          reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 31, mass: 1 }
        }
      >
        <m.span
          className="absolute inset-0 flex items-center justify-center whitespace-nowrap text-[15px] font-normal tracking-[0.15em]"
          initial={false}
          animate={{ opacity: phase === "idle" ? 1 : 0, scale: phase === "idle" ? 1 : 0.82 }}
          transition={{ duration: reduceMotion ? 0 : 0.25, ease: EASE }}
        >
          {idleLabel}
        </m.span>

        <m.span
          className="absolute inset-0 flex items-center justify-center"
          initial={false}
          animate={{ opacity: collapsed ? 1 : 0, scale: collapsed ? 1 : 0.82 }}
          transition={{ duration: reduceMotion ? 0 : 0.25, ease: EASE }}
        >
          <Loader2 className="h-[18px] w-[18px] animate-spin" strokeWidth={1.75} />
        </m.span>

        <m.span
          className="absolute inset-0 flex items-center justify-center gap-2 whitespace-nowrap text-[15px] font-normal tracking-[0.15em]"
          initial={false}
          animate={{ opacity: done ? 1 : 0, scale: done ? 1 : 0.82 }}
          transition={{ duration: reduceMotion ? 0 : 0.25, ease: EASE }}
        >
          <Check className="h-4 w-4 text-brand-cocoa" strokeWidth={1.75} />
          {doneLabel}
        </m.span>
      </m.span>
      <span className="sr-only" role="status" aria-live="polite">
        {collapsed ? "正在提交" : done ? doneLabel : ""}
      </span>
    </button>
  );
}

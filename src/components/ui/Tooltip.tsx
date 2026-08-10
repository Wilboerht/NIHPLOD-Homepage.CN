"use client";

/**
 * Tooltip 提示组件
 *
 * 基于 hover / focus 显示提示文本，支持方向控制。
 * 使用 createPortal + fixed 定位，避免被父容器 overflow 裁剪。
 *
 * @example
 * ```tsx
 * <Tooltip content="删除产品">
 *   <button><Trash2 /></button>
 * </Tooltip>
 * ```
 */
import { ReactNode, useRef, useState, useCallback, useEffect } from "react";
import { useMounted } from "@/hooks/useMounted";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
}

const OFFSET = 8;

const transformBySide: Record<string, string> = {
  top: "-translate-x-1/2 -translate-y-full",
  bottom: "-translate-x-1/2 translate-y-0",
  left: "-translate-x-full -translate-y-1/2",
  right: "translate-x-0 -translate-y-1/2",
};

function getPosition(
  rect: DOMRect,
  side: string
): { left: number; top: number; arrowSide: "top" | "bottom" | "left" | "right" } {
  const { innerWidth, innerHeight } = window;
  let left = 0;
  let top = 0;
  let arrowSide: "top" | "bottom" | "left" | "right" = side as never;
  // 估算 tooltip 尺寸用于翻转判断
  const est = { width: 120, height: 36 };

  if (side === "top") {
    left = rect.left + rect.width / 2;
    top = rect.top - OFFSET;
  } else if (side === "bottom") {
    left = rect.left + rect.width / 2;
    top = rect.bottom + OFFSET;
  } else if (side === "left") {
    left = rect.left - OFFSET;
    top = rect.top + rect.height / 2;
  } else {
    left = rect.right + OFFSET;
    top = rect.top + rect.height / 2;
  }

  // 视口翻转
  if (side === "top" && top < est.height) {
    top = rect.bottom + OFFSET;
    arrowSide = "bottom";
  } else if (side === "bottom" && top + est.height > innerHeight) {
    top = rect.top - OFFSET;
    arrowSide = "top";
  } else if (side === "left" && left < est.width) {
    left = rect.right + OFFSET;
    arrowSide = "right";
  } else if (side === "right" && left + est.width > innerWidth) {
    left = rect.left - OFFSET;
    arrowSide = "left";
  }

  return { left, top, arrowSide };
}

const arrowStyles: Record<string, string> = {
  top: "left-1/2 -bottom-1 -translate-x-1/2 border-t-brand-charcoal/90",
  bottom: "left-1/2 -top-1 -translate-x-1/2 border-b-brand-charcoal/90",
  left: "top-1/2 -right-1 -translate-y-1/2 border-l-brand-charcoal/90",
  right: "top-1/2 -left-1 -translate-y-1/2 border-r-brand-charcoal/90",
};

/**
 * 提示组件（hover/focus 触发，Portal 渲染避免裁剪）
 */
export function Tooltip({ content, children, side = "top", className }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [arrowSide, setArrowSide] = useState<"top" | "bottom" | "left" | "right">(side);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const mounted = useMounted();

  const handleScroll = useCallback(
    function handleScroll() {
      const el = wrapRef.current?.firstElementChild as HTMLElement | null;
      if (!el) {
        setVisible(false);
        return;
      }
      const rect = el.getBoundingClientRect();
      // 简单检测：trigger 是否仍在视口内（完全滚出视口则隐藏并移除监听）
      if (
        rect.bottom < 0 ||
        rect.top > window.innerHeight ||
        rect.right < 0 ||
        rect.left > window.innerWidth
      ) {
        setVisible(false);
        window.removeEventListener("scroll", handleScroll, true);
        window.removeEventListener("resize", handleScroll);
        return;
      }
      // 仍在视口内则更新位置
      const result = getPosition(rect, side);
      setPos({ left: result.left, top: result.top });
      setArrowSide(result.arrowSide);
    },
    [side]
  );

  const show = useCallback(() => {
    const el = wrapRef.current?.firstElementChild as HTMLElement | null;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const result = getPosition(rect, side);
    setPos({ left: result.left, top: result.top });
    setArrowSide(result.arrowSide);
    setVisible(true);
    // 监听滚动/窗口变化：当 trigger 位置变化时重新计算或隐藏
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleScroll);
  }, [side, handleScroll]);

  const cleanupScroll = useCallback(() => {
    window.removeEventListener("scroll", handleScroll, true);
    window.removeEventListener("resize", handleScroll);
  }, [handleScroll]);

  const hide = useCallback(() => {
    setVisible(false);
    cleanupScroll();
  }, [cleanupScroll]);

  // 组件卸载时清理滚动监听
  useEffect(() => {
    return () => {
      setVisible(false);
      cleanupScroll();
    };
  }, []);

  if (!content) return <>{children}</>;

  return (
    <span
      ref={wrapRef}
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {mounted &&
        visible &&
        pos &&
        createPortal(
          <span
            role="tooltip"
            style={{ left: pos.left, top: pos.top }}
            className={cn(
              "pointer-events-none fixed z-[9998] max-w-xs whitespace-nowrap rounded-md bg-brand-charcoal/90 px-2.5 py-1.5 text-xs text-white opacity-100 shadow-lg",
              transformBySide[arrowSide],
              className
            )}
          >
            {content}
            <span
              aria-hidden="true"
              className={cn(
                "absolute h-2 w-2 rotate-45 border-4 border-transparent",
                arrowStyles[arrowSide]
              )}
            />
          </span>,
          document.body
        )}
    </span>
  );
}

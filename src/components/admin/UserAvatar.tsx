"use client";

import Image from "next/image";
import { useState } from "react";
import { isRenderableAvatarUrl } from "@/lib/avatar-url";
import { cn } from "@/lib/utils";

const SIZE_MAP = {
  sm: { className: "h-8 w-8 text-xs", px: 32 },
  md: { className: "h-10 w-10 text-sm", px: 40 },
  lg: { className: "h-16 w-16 text-xl", px: 64 },
} as const;

interface UserAvatarProps {
  src?: string | null;
  name?: string | null;
  size?: keyof typeof SIZE_MAP;
  className?: string;
}

/**
 * 管理员视角的用户头像：仅渲染站内路径 / 官网域 / 自有 OSS，拒绝任意外链。
 * 加载失败或无头像时回退为首字母，避免列表出现破图。
 */
export function UserAvatar({ src, name, size = "sm", className }: UserAvatarProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const dimension = SIZE_MAP[size];
  const initial = name?.trim().charAt(0).toUpperCase() || "U";

  return (
    <div
      className={cn(
        "flex flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-hover text-ink-muted",
        dimension.className,
        className
      )}
    >
      {isRenderableAvatarUrl(src) && failedSrc !== src ? (
        <Image
          src={src}
          alt=""
          width={dimension.px}
          height={dimension.px}
          className="h-full w-full object-cover"
          unoptimized
          onError={() => setFailedSrc(src)}
        />
      ) : (
        initial
      )}
    </div>
  );
}

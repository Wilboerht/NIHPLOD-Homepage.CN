"use client";

import Image from "next/image";
import { useState } from "react";
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

/** 头像只允许站内路径、官网域名或 OSS 域名；拒绝任意外链（防追踪像素/不可信内容） */
function isRenderableAvatar(src: string | null | undefined): src is string {
  if (!src) return false;
  if (src.startsWith("/") && !src.startsWith("//") && !src.includes("\\")) return true;
  try {
    const url = new URL(src);
    if (url.protocol !== "https:") return false;
    return (
      url.hostname === "nihplod.cn" ||
      url.hostname.endsWith(".nihplod.cn") ||
      url.hostname.endsWith(".aliyuncs.com")
    );
  } catch {
    return false;
  }
}

/**
 * 管理员视角的用户头像：支持站内上传路径与外部 http(s) 头像。
 * 加载失败或无头像时回退为首字母，避免列表出现破图。
 */
export function UserAvatar({ src, name, size = "sm", className }: UserAvatarProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const dimension = SIZE_MAP[size];
  const initial = name?.trim().charAt(0).toUpperCase() || "U";

  return (
    <div
      className={cn(
        "flex flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-charcoal/[0.06] text-brand-charcoal/65",
        dimension.className,
        className
      )}
    >
      {isRenderableAvatar(src) && failedSrc !== src ? (
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

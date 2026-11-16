"use client";

import Image from "next/image";
import { useState } from "react";
import { DEFAULT_AVATAR_PATH } from "@/lib/avatar-constants";
import { isRenderableAvatarUrl } from "@/lib/avatar-url";
import { cn } from "@/lib/utils";

interface AvatarImageProps {
  src?: string | null;
  alt?: string;
  className?: string;
  /** 图片尺寸提示（fill 布局下用于浏览器预加载优化） */
  sizes?: string;
  priority?: boolean;
}

/**
 * 统一头像渲染：
 * - 不可信/历史外链直接回退默认头像（不发起第三方请求）
 * - 加载失败（404、CSP 等）同样回退默认头像，避免裂图
 */
export function AvatarImage({ src, alt = "", className, sizes, priority }: AvatarImageProps) {
  const resolved = src && isRenderableAvatarUrl(src) ? src : DEFAULT_AVATAR_PATH;
  // 失败记录与当前 src 绑定：src 变化后自动重试新地址，无需 effect 同步状态
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const currentSrc = failedSrc === resolved ? DEFAULT_AVATAR_PATH : resolved;

  return (
    <Image
      src={currentSrc}
      alt={alt}
      fill
      unoptimized
      priority={priority}
      sizes={sizes}
      className={cn("object-cover", className)}
      onError={() => setFailedSrc(resolved)}
    />
  );
}

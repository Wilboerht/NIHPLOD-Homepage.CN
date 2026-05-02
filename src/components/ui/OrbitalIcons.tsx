"use client";

import { cn } from "@/lib/utils";
import { CATEGORY_ICONS } from "@/app/(website)/products/ProductsContent";

interface OrbitalRingProps {
  radius: number; // px
  duration: number; // seconds
  reverse?: boolean;
  items: { icon: React.ReactNode; angle: number }[];
  className?: string;
}

function OrbitalRing({ radius, duration, reverse, items, className }: OrbitalRingProps) {
  return (
    <div
      className={cn("absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2", className)}
      style={{
        width: radius * 2,
        height: radius * 2,
      }}
    >
      {/* 轨道线 */}
      <div
        className="absolute inset-0 rounded-full border border-brand-charcoal/[0.06]"
        style={{ animation: `none` }}
      />

      {/* 旋转容器 */}
      <div
        className="absolute inset-0"
        style={{
          animation: `orbit-spin ${duration}s linear infinite ${reverse ? "reverse" : ""}`,
        }}
      >
        {items.map((item, i) => {
          const rad = (item.angle * Math.PI) / 180;
          const x = Math.cos(rad) * radius;
          const y = Math.sin(rad) * radius;
          return (
            <div
              key={i}
              className="absolute left-1/2 top-1/2"
              style={{
                transform: `translate(${x}px, ${y}px) translate(-50%, -50%)`,
              }}
            >
              {/* 图标容器：反向旋转保持 upright */}
              <div
                className="flex h-10 w-10 items-center justify-center sm:h-11 sm:w-11"
                style={{
                  animation: `orbit-spin ${duration}s linear infinite ${reverse ? "" : "reverse"}`,
                }}
              >
                <div className="h-8 w-8 sm:h-9 sm:w-9">{item.icon}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface OrbitalIconsProps {
  className?: string;
  children?: React.ReactNode;
}

export function OrbitalIcons({ className, children }: OrbitalIconsProps) {
  const rings: OrbitalRingProps[] = [
    {
      radius: 260,
      duration: 28,
      items: [
        { icon: CATEGORY_ICONS["洁面"], angle: 0 },
        { icon: CATEGORY_ICONS["面霜"], angle: 90 },
        { icon: CATEGORY_ICONS["精华露"], angle: 180 },
        { icon: CATEGORY_ICONS["面膜"], angle: 270 },
      ],
    },
    {
      radius: 370,
      duration: 42,
      reverse: true,
      items: [
        { icon: CATEGORY_ICONS["护手霜"], angle: 0 },
        { icon: CATEGORY_ICONS["防晒"], angle: 72 },
        { icon: CATEGORY_ICONS["身体乳"], angle: 144 },
        { icon: CATEGORY_ICONS["磨砂膏"], angle: 216 },
        { icon: CATEGORY_ICONS["护理油"], angle: 288 },
      ],
    },
  ];

  return (
    <div className={cn("relative flex items-center justify-center", className)}>
      {/* 中心内容（登录卡片） */}
      {children && (
        <div className="relative z-10">
          {children}
        </div>
      )}

      {/* 轨道环 */}
      {rings.map((ring, i) => (
        <OrbitalRing key={i} {...ring} />
      ))}
    </div>
  );
}

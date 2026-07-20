"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";
import { CATEGORY_ICON_PATH } from "@/lib/product-icons";

interface OrbitalRingProps {
  radius: number;
  duration: number;
  reverse?: boolean;
  items: { src: string; alt: string; angle: number }[];
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
      <div
        className="absolute inset-0 rounded-full border border-brand-charcoal/[0.06]"
        style={{ animation: `none` }}
      />
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
              className="absolute"
              style={{
                left: "50%",
                top: "50%",
                transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`,
              }}
            >
              <div
                className="flex h-14 w-14 items-center justify-center sm:h-16 sm:w-16"
                style={{
                  animation: `orbit-spin ${duration}s linear infinite ${reverse ? "" : "reverse"}`,
                }}
              >
                <Image
                  src={item.src}
                  alt={item.alt}
                  width={56}
                  height={56}
                  className="h-12 w-12 sm:h-14 sm:w-14"
                />
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
        { src: CATEGORY_ICON_PATH["洁面"], alt: "洁面", angle: 0 },
        { src: CATEGORY_ICON_PATH["面霜"], alt: "面霜", angle: 90 },
        { src: CATEGORY_ICON_PATH["精华露"], alt: "精华露", angle: 180 },
        { src: CATEGORY_ICON_PATH["面膜"], alt: "面膜", angle: 270 },
      ],
    },
    {
      radius: 370,
      duration: 42,
      reverse: true,
      items: [
        { src: CATEGORY_ICON_PATH["护手霜"], alt: "护手霜", angle: 0 },
        { src: CATEGORY_ICON_PATH["防晒"], alt: "防晒", angle: 72 },
        { src: CATEGORY_ICON_PATH["身体乳"], alt: "身体乳", angle: 144 },
        { src: CATEGORY_ICON_PATH["磨砂膏"], alt: "磨砂膏", angle: 216 },
        { src: CATEGORY_ICON_PATH["护理油"], alt: "护理油", angle: 288 },
      ],
    },
  ];

  return (
    <div className={cn("relative flex items-center justify-center", className)}>
      {/* 中心内容（登录卡片） */}
      {children && <div className="relative z-10">{children}</div>}

      {/* 轨道环 */}
      {rings.map((ring, i) => (
        <OrbitalRing key={i} {...ring} />
      ))}
    </div>
  );
}

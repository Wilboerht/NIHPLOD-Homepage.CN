"use client";

import { cn } from "@/lib/utils";
import {
  Shield,
  User,
  Lock,
  KeyRound,
  Fingerprint,
  BadgeCheck,
  Sparkles,
} from "lucide-react";

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
          animation: `orbit-spin ${duration}s linear infinite ${reverse ? "reverse" : ""}`
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
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-brand-beige/60 bg-white/70 shadow-sm backdrop-blur-sm sm:h-11 sm:w-11"
                style={{
                  animation: `orbit-spin ${duration}s linear infinite ${reverse ? "" : "reverse"}`
                }}
              >
                <span className="text-brand-charcoal/50">{item.icon}</span>
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
  const iconSize = "h-4 w-4 sm:h-5 sm:w-5";

  const rings: OrbitalRingProps[] = [
    {
      radius: 220,
      duration: 28,
      items: [
        { icon: <Shield className={iconSize} />, angle: 0 },
        { icon: <User className={iconSize} />, angle: 120 },
        { icon: <Lock className={iconSize} />, angle: 240 },
      ],
    },
    {
      radius: 310,
      duration: 42,
      reverse: true,
      items: [
        { icon: <KeyRound className={iconSize} />, angle: 45 },
        { icon: <Fingerprint className={iconSize} />, angle: 135 },
        { icon: <BadgeCheck className={iconSize} />, angle: 225 },
        { icon: <Sparkles className={iconSize} />, angle: 315 },
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

"use client";

import { useEffect, useRef } from "react";
import { Link } from "next-view-transitions";
import Image from "next/image";
import { m } from "framer-motion";
import type { HomePageContent } from "@/types/page-content";
import { UserButton } from "./UserButton";

interface HomeClientProps {
  content?: HomePageContent;
}

export default function HomeClient({ content: _content }: HomeClientProps) {
  const wave1Ref = useRef<SVGSVGElement>(null);
  const wave2Ref = useRef<SVGSVGElement>(null);

  // 鼠标视差效果
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const moveX = (e.clientX - window.innerWidth / 2) * 0.01;
      const moveY = (e.clientY - window.innerHeight / 2) * 0.01;
      if (wave1Ref.current) {
        wave1Ref.current.style.transform = `translate(${moveX}px, ${moveY}px)`;
      }
      if (wave2Ref.current) {
        wave2Ref.current.style.transform = `translate(${-moveX}px, ${-moveY}px)`;
      }
    };

    document.addEventListener("mousemove", handleMouseMove);
    return () => document.removeEventListener("mousemove", handleMouseMove);
  }, []);

  return (
    <div className="home-container">
      {/* 矿物纹理覆盖层 - 使用 base64 SVG 噪点 */}
      <div
        className="mineral-texture"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`
        }}
      />

      {/* 波浪背景 */}
      <div className="wave-container">
        <svg ref={wave1Ref} className="wave wave-1" viewBox="0 0 1200 120" preserveAspectRatio="none">
          <path d="M0,60 C150,110 350,10 500,60 C650,110 850,10 1000,60 C1150,110 1350,10 1500,60" />
        </svg>
        <svg ref={wave2Ref} className="wave wave-2" viewBox="0 0 1200 120" preserveAspectRatio="none">
          <path d="M0,40 C200,90 400,0 600,40 C800,80 1000,0 1200,40" />
        </svg>
      </div>

      {/* 右上角登录按钮 */}
      <div className="user-button-container">
        <UserButton />
      </div>

      {/* 主内容 */}
      <main className="main-content">
        {/* Logo */}
        <m.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.2, delay: 0.2 }}
        >
          <Image
            src="/images/logo.png"
            alt="Dolphin Skin"
            width={220}
            height={80}
            className="logo"
            priority
          />
        </m.div>

        {/* 品牌文案 */}
        <m.div
          className="content-wrapper"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.2, delay: 0.5 }}
        >
          <h1 className="title">
            <span>海豚的肌肤，拥有每两小时</span><br />
            <span>自我更新的神奇能力。</span><br />
            <span>这种「逆转时光」的动物本能，</span><br />
            <span>是我们灵感的来源。</span>
          </h1>
        </m.div>

        {/* 按钮组 */}
        <m.div
          className="button-group"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.2, delay: 0.8 }}
        >
          <Link href="/products" className="btn btn-primary">
            探索更多
          </Link>
          <Link href="/advisor" className="btn btn-secondary">
            AI快速测肤
            <span className="badge-new">NEW</span>
          </Link>
        </m.div>
      </main>
    </div>
  );
}

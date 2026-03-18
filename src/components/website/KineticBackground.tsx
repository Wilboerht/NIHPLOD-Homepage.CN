"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "next-view-transitions";
import { BookUser, ChevronRight, LogOut } from "lucide-react";

/**
 * Graphite Kinetic Grid 全局背景组件
 * 
 * 特点：
 * - 深色背景 (#0a0a0a) + 微点阵图案
 * - 强调色 (#00263e 深蓝)
 * - Bento Grid 便当盒卡片布局（左侧大卡片 + 右侧3x2小卡片）
 * - 鼠标跟随的3D透视倾斜效果
 * - Neo-Brutalism 风格阴影
 */
export function KineticBackground() {
    const containerRef = useRef<HTMLDivElement>(null);
    const cellsRef = useRef<HTMLDivElement[]>([]);
    const { user, logout, switchToLogin, openUserCenter } = useAuth();

    useEffect(() => {
        const container = containerRef.current;
        const cells = cellsRef.current;
        if (!container || cells.length === 0) return;

        const handleMouseMove = (e: MouseEvent) => {
            const x = e.clientX / window.innerWidth - 0.5;
            const y = e.clientY / window.innerHeight - 0.5;

            cells.forEach((cell, index) => {
                if (!cell) return;
                const factor = (index + 1) * 1.5;
                cell.style.transform = `
          translate(${x * factor}px, ${y * factor}px) 
          rotateX(${-y * 4}deg) 
          rotateY(${x * 4}deg)
        `;
            });
        };

        const handleMouseLeave = () => {
            cells.forEach((cell) => {
                if (!cell) return;
                cell.style.transform = 'translate(0, 0) rotateX(0) rotateY(0)';
            });
        };

        const mediaQuery = window.matchMedia('(min-width: 768px) and (hover: hover)');

        if (mediaQuery.matches) {
            container.addEventListener('mousemove', handleMouseMove);
            container.addEventListener('mouseleave', handleMouseLeave);
        }

        return () => {
            container.removeEventListener('mousemove', handleMouseMove);
            container.removeEventListener('mouseleave', handleMouseLeave);
        };
    }, []);

    const addCellRef = (el: HTMLDivElement | null, index: number) => {
        if (el) {
            cellsRef.current[index] = el;
        }
    };

    const handleLoginClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        switchToLogin();
    };

    return (
        <div className="kinetic-background-wrapper">
            <div className="kinetic-bg-base" />
            <div className="kinetic-dot-pattern" />
            <div className="kinetic-watermark">
                <Image
                    src="/images/watermark.webp"
                    alt="Watermark"
                    width={2800}
                    height={800}
                    style={{ objectFit: 'contain' }}
                />
            </div>

            <div ref={containerRef} className="kinetic-container">
                {/* 左侧大卡片 - 跨两行 */}
                <div
                    ref={(el) => addCellRef(el, 0)}
                    className="kinetic-cell kinetic-cell-large kinetic-image-cell kinetic-cell-boxes group relative cursor-pointer"
                >
                    <Link href="/products" className="absolute inset-0 z-20" aria-label="了解产品" />
                    <Image
                        src="https://wp-cdn.4ce.cn/v2/vmQtAla.jpeg"
                        alt="Brand Story"
                        fill
                        className="kinetic-cell-image grayscale transition-all duration-500 group-hover:grayscale-0"
                        sizes="(max-width: 600px) 100vw, 30vw"
                        priority
                    />
                    <div className="absolute inset-0 z-10 hidden sm:flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-black/20 pointer-events-none">
                        <span className="text-white text-2xl font-bold tracking-[0.25em] border-b-2 border-white/60 pb-1.5">探索产品</span>
                    </div>
                </div>

                {/* Row 1, Col 2: 文字卡 */}
                <div
                    ref={(el) => addCellRef(el, 1)}
                    className="kinetic-cell kinetic-text-cell kinetic-cell-yellow kinetic-cell-steps no-hover-effect"
                >
                    <div className="kinetic-name" style={{ marginBottom: '12px', lineHeight: '1.3' }}>更少步骤<br />更多呵护</div>
                    <div className="kinetic-desc" style={{ fontSize: '13px', lineHeight: '1.5', letterSpacing: '0.05em', textTransform: 'none', fontWeight: 400, opacity: 0.8 }}>美丽不该复杂，<br />专注美好生活</div>
                </div>

                {/* Row 1, Col 3-4: 合并后的宽图片卡 */}
                <div
                    ref={(el) => addCellRef(el, 2)}
                    className="kinetic-cell kinetic-image-cell kinetic-cell-less group relative cursor-pointer"
                    style={{ gridColumn: "span 2", aspectRatio: "auto" }}
                >
                    <Link href="/guide" className="absolute inset-0 z-20" aria-label="官方指南" />
                    <Image
                        src="/images/kinetic-cat.webp"
                        alt="Cat Aesthetic"
                        fill
                        className="kinetic-cell-image grayscale transition-all duration-500 group-hover:grayscale-0"
                        sizes="(max-width: 600px) 100vw, 50vw"
                    />
                    <div className="absolute inset-0 z-10 hidden sm:flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-black/20 pointer-events-none">
                        <span className="text-white text-2xl font-bold tracking-[0.25em] border-b-2 border-white/60 pb-1.5">官方指南</span>
                    </div>
                </div>

                <div
                    ref={(el) => addCellRef(el, 3)}
                    className="kinetic-cell kinetic-image-cell kinetic-cell-skin group relative cursor-pointer"
                >
                    <Link href="/about" className="absolute inset-0 z-20" aria-label="关于旎柏" />
                    {/* Desktop Image */}
                    <Image
                        src="/images/kinetic-desktop.webp"
                        alt="Product Desktop"
                        fill
                        className="kinetic-cell-image !filter-none transition-all duration-500 hidden lg:block"
                        sizes="(max-width: 1024px) 100vw, 25vw"
                    />
                    {/* Mobile Image */}
                    <Image
                        src="/images/kinetic-mobile.webp"
                        alt="Product Mobile"
                        fill
                        className="kinetic-cell-image !filter-none transition-all duration-500 block lg:hidden"
                        sizes="100vw"
                    />
                </div>

                {/* Row 2, Col 3: 文字卡 */}
                <div
                    ref={(el) => addCellRef(el, 4)}
                    className="kinetic-cell kinetic-text-cell kinetic-cell-orange kinetic-cell-reverse no-hover-effect"
                >
                    <div className="kinetic-text-glow" />
                    <div className="kinetic-name">逆转时光</div>
                    <div className="kinetic-desc" style={{ fontSize: '13px', letterSpacing: '0.05em', textTransform: 'none', fontWeight: 400, opacity: 0.8 }}>REVERSE TIME</div>
                </div>

                {/* Row 2, Col 4: 登录/CTA卡 */}
                {/* Row 2, Col 4: 登录/CTA卡 */}
                <div
                    ref={(el) => addCellRef(el, 5)}
                    onClick={user ? () => openUserCenter() : handleLoginClick}
                    className="kinetic-cell kinetic-login-cell kinetic-cell-login no-hover-effect cursor-pointer"
                >
                    <div className="kinetic-login-bg" />
                    <div className="kinetic-btn-group">
                        {user ? (
                            <>
                                {/* 极简退出按钮 */}
                                <button
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        logout();
                                    }}
                                    className="absolute -top-6 -right-2 btn-logout-minimal z-30"
                                    title="退出登录"
                                >
                                    <LogOut className="h-4 w-4" strokeWidth={1.5} />
                                </button>

                                <div className="mb-0 sm:mb-2 flex flex-col items-center justify-center w-full group/avatar mt-0">
                                    <div className="relative h-16 w-16 sm:h-24 sm:w-24 flex items-center justify-center">
                                        {/* 装饰性极细圆环 - 模拟精密仪器的精致感 */}
                                        <div className="absolute inset-0 rounded-full border border-brand-charcoal/5 scale-[1.15] sm:scale-125 group-hover/avatar:scale-[1.2] sm:group-hover/avatar:scale-150 transition-transform duration-1000 ease-out" />
                                        <div className="absolute inset-[2px] sm:inset-4 rounded-full border border-brand-charcoal/10 transition-transform duration-700 group-hover/avatar:scale-95 sm:group-hover/avatar:scale-90" />

                                        {/* 主图标容器 - 极简白润质感 */}
                                        <div className="relative h-12 w-12 sm:h-20 sm:w-20 rounded-full bg-white/40 backdrop-blur-md flex items-center justify-center border border-white/60 transition-all duration-500 overflow-hidden cursor-pointer" onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            openUserCenter();
                                        }}>
                                            {user.avatar ? (
                                                <Image
                                                    src={user.avatar}
                                                    alt={user.nickname || "User"}
                                                    fill
                                                    className="object-cover"
                                                />
                                            ) : (
                                                <div className="relative h-6 w-6 sm:h-9 sm:w-9 opacity-50">
                                                    <Image
                                                        src="/images/profile-icon.svg"
                                                        alt="User Profile"
                                                        fill
                                                        className="object-contain"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        openUserCenter();
                                    }}
                                    className="w-full py-2 sm:py-3 rounded-xl bg-white/30 backdrop-blur-sm border border-white/50 text-brand-charcoal/90 text-xs sm:text-sm tracking-[0.2em] sm:tracking-[0.3em] font-medium transition-all duration-500 hover:bg-white/50 hover:border-white/80 hover:text-brand-charcoal hover:shadow-sm active:scale-[0.98]"
                                >
                                    进入会员中心
                                </button>
                            </>
                        ) : (
                            <>
                                <div className="mb-0 sm:mb-2 flex flex-col items-center justify-center w-full group/avatar mt-0">
                                    <div className="relative h-16 w-16 sm:h-24 sm:w-24 flex items-center justify-center">
                                        {/* 装饰性极细圆环 - 模拟精密仪器的精致感 */}
                                        <div className="absolute inset-0 rounded-full border border-brand-charcoal/5 scale-[1.15] sm:scale-125 group-hover/avatar:scale-[1.2] sm:group-hover/avatar:scale-150 transition-transform duration-1000 ease-out" />
                                        <div className="absolute inset-[2px] sm:inset-4 rounded-full border border-brand-charcoal/10 transition-transform duration-700 group-hover/avatar:scale-95 sm:group-hover/avatar:scale-90" />

                                        {/* 主图标容器 - 极简白润质感 */}
                                        <div className="relative h-12 w-12 sm:h-20 sm:w-20 rounded-full bg-white/40 backdrop-blur-md flex items-center justify-center border border-white/60 transition-all duration-500 overflow-hidden">
                                            <div className="relative h-6 w-6 sm:h-9 sm:w-9 opacity-50">
                                                <Image
                                                    src="/images/profile-icon.svg"
                                                    alt="User Profile"
                                                    fill
                                                    className="object-contain"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleLoginClick}
                                    className="w-full py-2 sm:py-3 rounded-xl bg-white/30 backdrop-blur-sm border border-white/50 text-brand-charcoal/90 text-xs sm:text-sm tracking-[0.2em] sm:tracking-[0.3em] font-medium transition-all duration-500 hover:bg-white/50 hover:border-white/80 hover:text-brand-charcoal hover:shadow-sm active:scale-[0.98]"
                                >
                                    立即登录
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div >
    );
}

export default KineticBackground;

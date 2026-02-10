"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { useAuth } from "@/contexts/AuthContext";

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
    const { switchToLogin, switchToRegister } = useAuth();

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

    const handleRegisterClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        switchToRegister();
    };

    return (
        <div className="kinetic-background-wrapper">
            <div className="kinetic-bg-base" />
            <div className="kinetic-dot-pattern" />
            <div className="kinetic-watermark">
                <Image
                    src="/images/watermark.png"
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
                    className="kinetic-cell kinetic-cell-large kinetic-image-cell no-hover-effect"
                >
                    <div className="kinetic-overlay" />
                    <Image
                        src="https://wp-cdn.4ce.cn/v2/vmQtAla.jpeg"
                        alt="Brand Story"
                        fill
                        className="kinetic-cell-image"
                        sizes="(max-width: 600px) 100vw, 30vw"
                        priority
                    />

                </div>

                {/* Row 1, Col 2: 文字卡 */}
                <div
                    ref={(el) => addCellRef(el, 1)}
                    className="kinetic-cell kinetic-text-cell kinetic-cell-yellow no-hover-effect"
                >
                    <div className="kinetic-text-glow" />
                    <div className="kinetic-name">更少步骤<br />更多呵护</div>
                    <div className="kinetic-name" style={{ fontSize: '0.8rem', letterSpacing: '0.05em', textTransform: 'none', fontWeight: 400 }}>美丽不该复杂，<br />专注美好生活</div>
                </div>

                {/* Row 1, Col 3-4: 合并后的宽图片卡 */}
                <div
                    ref={(el) => addCellRef(el, 2)}
                    className="kinetic-cell kinetic-image-cell no-hover-effect"
                    style={{ gridColumn: "span 2", aspectRatio: "auto" }}
                >
                    <div className="kinetic-overlay" />
                    <Image
                        src="/images/kinetic-cat.jpg"
                        alt="Cat Aesthetic"
                        fill
                        className="kinetic-cell-image"
                        sizes="(max-width: 600px) 100vw, 50vw"
                    />
                </div>

                {/* Row 2, Col 2: 图片卡 */}
                <div
                    ref={(el) => addCellRef(el, 3)}
                    className="kinetic-cell kinetic-image-cell no-hover-effect"
                >
                    <Image
                        src="/images/kinetic-face-mask.jpg"
                        alt="Product"
                        fill
                        className="kinetic-cell-image"
                        sizes="(max-width: 600px) 100vw, 25vw"
                    />
                </div>

                {/* Row 2, Col 3: 文字卡 */}
                <div
                    ref={(el) => addCellRef(el, 4)}
                    className="kinetic-cell kinetic-text-cell kinetic-cell-orange no-hover-effect"
                >
                    <div className="kinetic-text-glow" />
                    <div className="kinetic-name">逆转时光</div>
                    <div className="kinetic-name" style={{ fontSize: '0.95rem', letterSpacing: 'normal', textTransform: 'none', fontWeight: 400 }}>Reverse Time</div>
                </div>

                {/* Row 2, Col 4: 登录/CTA卡 */}
                <div
                    ref={(el) => addCellRef(el, 5)}
                    className="kinetic-cell kinetic-login-cell"
                >
                    <div className="kinetic-login-bg" />
                    <div className="kinetic-btn-group">
                        <button
                            type="button"
                            onClick={handleLoginClick}
                            className="kinetic-btn kinetic-btn-primary"
                        >
                            立即登录
                        </button>
                        <button
                            type="button"
                            onClick={handleRegisterClick}
                            className="kinetic-btn kinetic-btn-secondary"
                        >
                            注册
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default KineticBackground;

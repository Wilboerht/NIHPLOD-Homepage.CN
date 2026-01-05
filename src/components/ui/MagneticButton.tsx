"use client";

import { useRef, type ReactNode, type MouseEvent } from "react";
import { m, useSpring, useMotionValue } from "framer-motion";

interface MagneticButtonProps {
    children: ReactNode;
    className?: string;
    onClick?: () => void;
    magnetStrength?: number;
    triggerRadius?: number;
}

/**
 * MagneticButton - 磁性按钮组件
 * 
 * 当鼠标进入触发区域时，按钮会微微跟随鼠标移动，
 * 创造一种"被吸引"的高级交互感。
 */
export function MagneticButton({
    children,
    className = "",
    onClick,
    magnetStrength = 0.3,
    triggerRadius = 100,
}: MagneticButtonProps) {
    const ref = useRef<HTMLButtonElement>(null);

    // 用于平滑动画的 motion values
    const x = useMotionValue(0);
    const y = useMotionValue(0);

    // 使用弹簧动画使移动更自然
    const springConfig = { damping: 15, stiffness: 150, mass: 0.1 };
    const springX = useSpring(x, springConfig);
    const springY = useSpring(y, springConfig);

    const handleMouseMove = (e: MouseEvent<HTMLButtonElement>) => {
        if (!ref.current) return;

        const rect = ref.current.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        const distanceX = e.clientX - centerX;
        const distanceY = e.clientY - centerY;
        const distance = Math.sqrt(distanceX ** 2 + distanceY ** 2);

        // 只在触发半径内产生磁性效果
        if (distance < triggerRadius) {
            const factor = 1 - distance / triggerRadius;
            x.set(distanceX * magnetStrength * factor);
            y.set(distanceY * magnetStrength * factor);
        }
    };

    const handleMouseLeave = () => {
        x.set(0);
        y.set(0);
    };

    return (
        <m.button
            ref={ref}
            type="button"
            className={className}
            onClick={onClick}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            style={{
                x: springX,
                y: springY,
            }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
            {/* Shimmer effect overlay */}
            <span className="magnetic-shimmer" aria-hidden="true" />
            {children}
        </m.button>
    );
}

export default MagneticButton;

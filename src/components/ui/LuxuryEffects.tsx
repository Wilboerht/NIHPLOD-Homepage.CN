"use client";

import { useEffect, useState } from "react";
import { m, AnimatePresence } from "framer-motion";

interface Particle {
    id: number;
    x: number;
    y: number;
    size: number;
    duration: number;
    delay: number;
    opacity: number;
}

/**
 * FloatingParticles - 浮动金色粒子背景
 * 
 * 创造奢华、梦幻的视觉氛围
 */
export function FloatingParticles({ count = 40 }: { count?: number }) {
    const [particles, setParticles] = useState<Particle[]>([]);

    useEffect(() => {
        const newParticles: Particle[] = [];
        for (let i = 0; i < count; i++) {
            newParticles.push({
                id: i,
                x: Math.random() * 100,
                y: Math.random() * 100,
                size: Math.random() * 5 + 3, // Increased size: 3-8px
                duration: Math.random() * 15 + 20, // 20-35s
                delay: Math.random() * -20,
                opacity: Math.random() * 0.6 + 0.3, // Increased opacity: 0.3-0.9
            });
        }
        setParticles(newParticles);
    }, [count]);

    return (
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-[2]">
            {particles.map((particle) => (
                <m.div
                    key={particle.id}
                    className="absolute rounded-full"
                    style={{
                        left: `${particle.x}%`,
                        top: `${particle.y}%`,
                        width: particle.size,
                        height: particle.size,
                        // Enhanced gradient for more sparkle
                        background: `radial-gradient(circle, rgba(255, 223, 150, ${particle.opacity}) 0%, rgba(201, 168, 108, ${particle.opacity * 0.6}) 40%, transparent 100%)`,
                        // Stronger glow
                        boxShadow: `0 0 ${particle.size * 2}px rgba(201, 168, 108, ${particle.opacity * 0.8})`,
                    }}
                    animate={{
                        y: [0, -40, 0], // More movement
                        x: [0, Math.random() * 30 - 15, 0],
                        opacity: [particle.opacity * 0.4, particle.opacity, particle.opacity * 0.4],
                        scale: [1, 1.4, 1], // More breathing
                    }}
                    transition={{
                        duration: particle.duration,
                        delay: particle.delay,
                        repeat: Infinity,
                        ease: "easeInOut",
                    }}
                />
            ))}
        </div>
    );
}

/**
 * AmbientGlow - 鼠标跟随的环境光效
 */
export function AmbientGlow() {
    const [mousePos, setMousePos] = useState({ x: 50, y: 50 });

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            const x = (e.clientX / window.innerWidth) * 100;
            const y = (e.clientY / window.innerHeight) * 100;
            setMousePos({ x, y });
        };

        window.addEventListener("mousemove", handleMouseMove);
        return () => window.removeEventListener("mousemove", handleMouseMove);
    }, []);

    return (
        <div
            className="absolute inset-0 pointer-events-none z-[1] transition-all duration-700 ease-out"
            style={{
                // Brighter and larger glow
                background: `radial-gradient(circle 500px at ${mousePos.x}% ${mousePos.y}%, rgba(201, 168, 108, 0.06) 0%, transparent 70%)`,
            }}
        />
    );
}

export default FloatingParticles;

import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        brand: {
          gold: "#00263E", // 品牌主色 — Logo、按钮、强调（对齐 nihplod.net 深海蓝）
          "gold-light": "#1A3B52", // 浅色 — 高亮、hover 状态
          "gold-dark": "#001525", // 深色 — 按下状态
          cream: "#FAF5EA", // 浅奶油 — 内容板块背景
          "cream-dark": "#F0EBE0", // 深奶油 — 卡片背景
          charcoal: "#00263E", // 主文字色（对齐 navy）
          "charcoal-light": "#4A6272", // 次要文字
          blush: "#F5E6E0", // 柔粉 — 辅助背景
          beige: "#E4DFD9", // 暖米色 — 分隔、边框
          "beige-dark": "#D5CFC8", // 深米色 — 边框 hover
          blue: "#7a9fd4", // AI蓝 — AI护肤顾问专用
          bronze: "#8B6914", // 青铜色 — 高级装饰（保留）
          champagne: "#F7E7CE", // 香槟色 — 高光装饰（保留）
          warmgray: "#E2DEDC", // 暖灰 — 过渡/遮罩
        },
      },
      fontFamily: {
        serif: ["PingFang SC", "Source Han Sans", "Microsoft YaHei", "sans-serif"],
        sans: [
          "PingFang SC",
          "Source Han Sans",
          "Microsoft YaHei",
          "sans-serif",
        ],
        playfair: ["var(--font-playfair)", "serif"],
        songti: [
          "SimSun",
          "宋体",
          "Songti SC",
          "Noto Serif CJK SC",
          "Source Han Serif SC",
          "serif",
        ],
      },
      spacing: {
        xs: "8px",
        s: "16px",
        m: "24px",
        l: "48px",
        xl: "80px",
        xxl: "120px",
      },
      boxShadow: {
        "luxury": "0 4px 20px -2px rgba(0, 38, 62, 0.1)",
        "luxury-lg": "0 8px 30px -4px rgba(0, 38, 62, 0.15)",
        "card": "0 2px 12px -2px rgba(0, 38, 62, 0.04)",
        "card-hover": "0 8px 24px -4px rgba(0, 38, 62, 0.08)",
        "glow-navy": "0 0 20px rgba(0, 38, 62, 0.15)",
      },
      backgroundImage: {
        "gradient-luxury": "linear-gradient(135deg, #00263E 0%, #1A3B52 50%, #001525 100%)",
        "gradient-cream": "linear-gradient(180deg, #FAF5EA 0%, #FFFFFF 100%)",
        "gradient-radial-navy": "radial-gradient(circle, rgba(0, 38, 62, 0.06) 0%, transparent 70%)",
        "shimmer": "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)",
      },
      animation: {
        "fade-in": "fadeIn 0.5s ease-out",
        "slide-up": "slideUp 0.5s ease-out",
        "scale-in": "scaleIn 0.3s ease-out",
        "shimmer": "shimmer 2s infinite",
        "pulse-soft": "pulseSoft 2s ease-in-out infinite",
        "float": "float 3s ease-in-out infinite",
        "marquee": "marquee 40s linear infinite",
        "orbit-spin-slow": "orbitSpin 24s linear infinite",
        "orbit-spin-slower": "orbitSpin 36s linear infinite reverse",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        scaleIn: {
          "0%": { opacity: "0", transform: "scale(0.95)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        shimmer: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.7" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-5px)" },
        },
        marquee: {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(-50%)" },
        },
        orbitSpin: {
          from: { transform: "rotate(0deg)" },
          to: { transform: "rotate(360deg)" },
        },
      },
      transitionTimingFunction: {
        "luxury": "cubic-bezier(0.4, 0, 0.2, 1)",
        "bounce-soft": "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
    },
  },
  plugins: [],
};
export default config;

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
          gold: "#C9A86C", // 品牌金 - Logo、按钮、强调
          "gold-light": "#D4B77A", // 浅金色 - 高亮、hover状态
          "gold-dark": "#B8975B", // 深金色 - 按下状态
          cream: "#FAF8F5", // 暖白 - 主背景
          "cream-dark": "#F5F2ED", // 米色背景 - 卡片背景
          charcoal: "#2C2C2C", // 深炭灰 - 主文字
          "charcoal-light": "#4A4A4A", // 浅炭灰 - 次要文字
          blush: "#F5E6E0", // 柔粉 - 辅助背景
          beige: "#E8E2D9", // 米色 - 分隔、边框
          "beige-dark": "#D9D0C3", // 深米色 - 边框hover
          blue: "#7a9fd4", // AI蓝 - AI护肤顾问专用
          bronze: "#8B6914", // 青铜色 - 高级装饰
          champagne: "#F7E7CE", // 香槟色 - 高光装饰
        },
      },
      fontFamily: {
        serif: ["Playfair Display", "Source Serif Pro", "serif"],
        sans: [
          "Helvetica Neue",
          "Source Han Sans",
          "PingFang SC",
          "sans-serif",
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
        "luxury": "0 4px 20px -2px rgba(201, 168, 108, 0.15)",
        "luxury-lg": "0 8px 30px -4px rgba(201, 168, 108, 0.2)",
        "card": "0 2px 12px -2px rgba(44, 44, 44, 0.06)",
        "card-hover": "0 8px 24px -4px rgba(44, 44, 44, 0.1)",
        "glow-gold": "0 0 20px rgba(201, 168, 108, 0.3)",
      },
      backgroundImage: {
        "gradient-luxury": "linear-gradient(135deg, #C9A86C 0%, #D4B77A 50%, #B8975B 100%)",
        "gradient-cream": "linear-gradient(180deg, #FAF8F5 0%, #F5F2ED 100%)",
        "gradient-radial-gold": "radial-gradient(circle, rgba(201, 168, 108, 0.1) 0%, transparent 70%)",
        "shimmer": "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)",
      },
      animation: {
        "fade-in": "fadeIn 0.5s ease-out",
        "slide-up": "slideUp 0.5s ease-out",
        "scale-in": "scaleIn 0.3s ease-out",
        "shimmer": "shimmer 2s infinite",
        "pulse-soft": "pulseSoft 2s ease-in-out infinite",
        "float": "float 3s ease-in-out infinite",
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

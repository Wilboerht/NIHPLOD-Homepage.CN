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
          cream: "#FAF8F5", // 暖白 - 主背景
          charcoal: "#2C2C2C", // 深炭灰 - 主文字
          blush: "#F5E6E0", // 柔粉 - 辅助背景
          beige: "#E8E2D9", // 米色 - 分隔、边框
          blue: "#1d2d68", // AI蓝 - AI护肤顾问专用（与Logo一致）
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
    },
  },
  plugins: [],
};
export default config;

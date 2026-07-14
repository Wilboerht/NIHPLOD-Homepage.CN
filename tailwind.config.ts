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
          gold: "#00263E",
          "gold-dark": "#001525",
          cream: "#FAF5EA",
          charcoal: "#00263E",
          "charcoal-light": "#4A6272",
          beige: "#E4DFD9",
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

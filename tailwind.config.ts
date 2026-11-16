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
          primary: "#00263E",
          "primary-dark": "#001525",
          cream: "#FBF8F0",
          charcoal: "#00263E",
          "charcoal-light": "#4A6272",
          beige: "#E4DFD9",
          /* 护肤档案（子站同源）暖色系：打卡/重试等实心按钮与选中态 */
          cocoa: "#5c4937",
          "cocoa-dark": "#4a3a2c",
          gold: "#B8860B",
          "gold-dark": "#A0750A",
          "warm-light": "#FCF9F2",
          "warm-white": "#FFFDF9",
          buff: "#B8A47B",
          ecru: "#E6DCC3",
          sage: "#C3BC9F",
        },
        /* 管理端语义表面/线条/文字：替代页面内散落的透明度类 */
        surface: {
          DEFAULT: "#FFFFFF",
          subtle: "rgb(0 38 62 / 0.02)",
          muted: "rgb(0 38 62 / 0.04)",
          hover: "rgb(0 38 62 / 0.06)",
          active: "rgb(0 38 62 / 0.10)",
        },
        line: {
          DEFAULT: "rgb(0 38 62 / 0.10)",
          subtle: "rgb(0 38 62 / 0.06)",
          strong: "rgb(0 38 62 / 0.18)",
        },
        ink: {
          DEFAULT: "#00263E",
          secondary: "#4A6272",
          muted: "rgb(0 38 62 / 0.65)",
          faint: "rgb(0 38 62 / 0.45)",
        },
        /* 状态色统一放在 status 命名空间，避免覆盖 Tailwind 默认 neutral 色板 */
        status: {
          success: {
            soft: "#ECFDF5",
            fg: "#047857",
            strong: "#065F46",
            line: "#A7F3D0",
          },
          warning: {
            soft: "#FFFBEB",
            fg: "#B45309",
            strong: "#92400E",
            line: "#FDE68A",
          },
          danger: {
            soft: "#FEF2F2",
            fg: "#B91C1C",
            strong: "#991B1B",
            line: "#FECACA",
          },
          info: {
            soft: "#F0F9FF",
            fg: "#0369A1",
            strong: "#075985",
            line: "#BAE6FD",
          },
          neutral: {
            soft: "#F5F5F4",
            fg: "#57534E",
            strong: "#44403C",
            line: "#E7E5E4",
          },
        },
      },
      fontFamily: {
        serif: ["Futura LT", "Futura", "PingFang SC", "Source Han Sans", "Microsoft YaHei", "sans-serif"],
        /* 护肤档案数字（评分/统计/日号）：苹方无衬线，避免 Mac 上落到 Futura */
        num: [
          '"PingFang SC"',
          '"PingFang TC"',
          '"Hiragino Sans GB"',
          '"Source Han Sans SC"',
          '"Microsoft YaHei"',
          "system-ui",
          "sans-serif",
        ],
        sans: ["Futura LT", "Futura", "PingFang SC", "Source Han Sans", "Microsoft YaHei", "sans-serif"],
      },
      fontSize: {
        /* 管理端元信息字号；正文最小使用 text-xs，10px 仅图表轴保留 */
        "2xs": ["11px", { lineHeight: "16px", letterSpacing: "0.02em" }],
      },
      borderRadius: {
        control: "8px",
        surface: "12px",
        card: "16px",
      },
      boxShadow: {
        hairline: "0 1px 2px 0 rgb(0 38 62 / 0.04)",
        popover: "0 8px 24px -8px rgb(0 38 62 / 0.16)",
        modal: "0 24px 48px -12px rgb(0 38 62 / 0.22)",
      },
      zIndex: {
        nav: "40",
        "drawer-backdrop": "90",
        drawer: "95",
        dropdown: "100",
        modal: "110",
        tooltip: "120",
        toast: "130",
      },
      transitionDuration: {
        fast: "150ms",
        base: "200ms",
        slow: "300ms",
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
        shimmer: "shimmer 2s infinite",
        "pulse-soft": "pulseSoft 2s ease-in-out infinite",
        float: "float 3s ease-in-out infinite",
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
        orbitSpin: {
          from: { transform: "rotate(0deg)" },
          to: { transform: "rotate(360deg)" },
        },
      },
      transitionTimingFunction: {
        luxury: "cubic-bezier(0.4, 0, 0.2, 1)",
        "bounce-soft": "cubic-bezier(0.34, 1.56, 0.64, 1)",
        standard: "cubic-bezier(0.4, 0, 0.2, 1)",
        emphasized: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [],
};
export default config;

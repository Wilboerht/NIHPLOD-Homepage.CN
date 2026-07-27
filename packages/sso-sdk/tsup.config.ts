import { defineConfig } from "tsup";

export default defineConfig([
  // 主入口：核心引擎（无框架依赖）
  {
    entry: { "index": "src/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    clean: true,
    sourcemap: true,
    outDir: "dist",
    target: "es2020",
    splitting: false,
  },
  // React 绑定
  {
    entry: { "react/index": "src/react/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    clean: false,
    sourcemap: true,
    outDir: "dist",
    target: "es2020",
    external: ["react", "react/jsx-runtime"],
  },
  // Next.js 绑定
  {
    entry: { "next/index": "src/next/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    clean: false,
    sourcemap: true,
    outDir: "dist",
    target: "es2020",
    external: ["next/server", "react", "react/jsx-runtime"],
  },
]);

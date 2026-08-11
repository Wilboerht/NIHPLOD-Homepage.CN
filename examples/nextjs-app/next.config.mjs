import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // 仓库根目录也存在 lockfile，需显式指定本示例为构建根，
  // 否则 Next 会把根项目 src/ 下的文件（如 instrumentation.ts）纳入构建。
  turbopack: {
    root: __dirname,
  },
};
export default nextConfig;

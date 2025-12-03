// Prisma 配置文件
// 使用 dotenv 加载 .env.local 文件
import { config } from "dotenv";
import { defineConfig, env } from "prisma/config";

// 加载环境变量（优先使用 .env.local）
config({ path: ".env.local" });
config(); // 回退到 .env

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "npx tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});

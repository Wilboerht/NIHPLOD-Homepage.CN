import { config as dotenvConfig } from "dotenv";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, env } from "prisma/config";

// Prisma CLI 不像 Next.js 那样自动加载 .env.* 文件，这里手动补上。
// 优先级：.env.local（开发） > .env.production（生产） > .env
const envFiles = [".env.local", ".env.production", ".env"];
for (const file of envFiles) {
  const path = join(process.cwd(), file);
  if (existsSync(path)) {
    dotenvConfig({ path, override: true });
    break;
  }
}

export default defineConfig({
  schema: "./prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
});

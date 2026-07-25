import { config as dotenvConfig } from "dotenv";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, env } from "prisma/config";

// Prisma CLI 不像 Next.js 那样自动加载 .env.local，这里手动补上（覆盖 .env）。
if (existsSync(join(process.cwd(), ".env.local"))) {
  dotenvConfig({ path: join(process.cwd(), ".env.local"), override: true });
}

export default defineConfig({
  schema: "./prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
});

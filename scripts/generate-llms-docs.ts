/**
 * 生成 GEO 优化的 llms.txt 和 llms-full.txt
 * 运行方式: npm run geo:docs
 *
 * 品牌理念、护肤仪式、品牌 FAQ 沉淀在 scripts/llms/*.md 模板中由人工维护；
 * 产品目录与产品 FAQ 从数据库自动生成，重跑不会覆盖人工精修内容。
 */

import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { buildLlmsFullDoc, buildLlmsSummary, type LlmsProduct } from "../src/lib/llms-docs.js";
import pg from "pg";
import fs from "fs";
import path from "path";

// 与 prisma.config.ts 保持一致的 env 加载回退链
for (const file of [".env.local", ".env.production", ".env"]) {
  const envPath = path.join(process.cwd(), file);
  if (fs.existsSync(envPath)) {
    config({ path: envPath, override: true });
    break;
  }
}

const SITE_URL = (
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.NEXT_PUBLIC_BASE_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  "https://nihplod.cn"
).replace(/\/+$/, "");

const TEMPLATE_DIR = path.join(process.cwd(), "scripts", "llms");

function readTemplate(name: string): string {
  return fs.readFileSync(path.join(TEMPLATE_DIR, name), "utf-8").trim();
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🔄 正在生成 LLMS 文档...");

  try {
    const products = (await prisma.product.findMany({
      where: { published: true },
      include: { category: true },
      orderBy: { order: "asc" },
    })) as unknown as LlmsProduct[];

    const fullDoc = buildLlmsFullDoc({
      siteUrl: SITE_URL,
      products,
      brandSection: readTemplate("brand.md"),
      ritualsSection: readTemplate("rituals.md"),
      faqSection: readTemplate("faq.md"),
    });

    const fullPath = path.join(process.cwd(), "public", "llms-full.txt");
    fs.writeFileSync(fullPath, `${fullDoc}\n`);
    console.log(`✅ 已生成 llms-full.txt（${products.length} 个产品）: ${fullPath}`);

    const summary = buildLlmsSummary({ siteUrl: SITE_URL, products });
    const summaryPath = path.join(process.cwd(), "public", "llms.txt");
    fs.writeFileSync(summaryPath, `${summary}\n`);
    console.log(`✅ 已更新 llms.txt: ${summaryPath}`);
  } catch (error) {
    console.error("❌ 生成失败:", error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main();

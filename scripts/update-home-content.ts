/**
 * 更新首页内容为新格式
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

// 加载环境变量
config({ path: ".env.local" });

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function updateHomeContent() {
  const newContent = {
    brand: { chineseName: "旎柏", slogan: "逆转时光" },
    buttons: {
      advisorText: "AI 护肤顾问",
      advisorLink: "/advisor",
      productsText: "探索产品",
      productsLink: "/products",
    },
    copyright: "NIHPLOD All Rights Reserved.",
  };

  const result = await prisma.page.upsert({
    where: { slug: "home" },
    update: { content: newContent, published: true },
    create: {
      slug: "home",
      title: "首页",
      content: newContent,
      published: true,
    },
  });

  console.log("首页内容已更新:");
  console.log(JSON.stringify(result.content, null, 2));

  await pool.end();
}

updateHomeContent()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("错误:", e);
    process.exit(1);
  });


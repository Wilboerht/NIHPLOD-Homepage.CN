/**
 * 更新产品功效标签，使其与推荐算法匹配
 * 运行方式: npx tsx scripts/update-product-benefits.ts
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

/**
 * 产品功效标签 - 优化匹配算法关键词
 * 
 * 算法关键词参考：
 * - 关注点: 抗老、紧致、淡纹、胶原、弹力、补水、保湿、锁水、水润、收缩、毛孔、控油、净化、提亮、焕肤、光泽、亮白、舒缓、镇静、修护、温和、祛痘、调理
 * - 肤质: 滋润、保湿、修护、滋养、控油、清爽、净化、平衡、调理、舒缓、温和、镇静、防护、维稳
 * - 年龄: 控油、清爽、补水、净化、祛痘、抗氧化、防护、抗老、紧致、淡纹、抗皱、淡斑、滋养、胶原、弹力
 */
const PRODUCT_BENEFITS: Record<string, string[]> = {
  "云朵洁面慕斯": [
    "温和清洁",
    "保湿",
    "补水",
    "舒缓",
    "适合敏感肌",
    "净化",
  ],
  "匀衡磨砂膏": [
    "去角质",
    "收缩毛孔",
    "提亮",
    "控油",
    "净化",
    "焕肤",
  ],
  "臻萃修护面膜": [
    "修护",
    "补水",
    "保湿",
    "提亮",
    "舒缓",
    "深层滋养",
  ],
  "修护紧致精华": [
    "抗老",
    "紧致",
    "淡纹",
    "弹力",
    "修护",
    "提亮",
    "胶原",
  ],
  "逆龄面霜": [
    "抗老",
    "紧致",
    "保湿",
    "锁水",
    "滋养",
    "修护",
    "抗皱",
  ],
  "臻养护手霜": [
    "滋润",
    "保湿",
    "淡纹",
    "修护",
    "柔嫩",
  ],
  "奢润身体乳": [
    "滋养",
    "保湿",
    "补水",
    "柔滑",
    "修护",
  ],
  "轻透防晒霜": [
    "防护",
    "防晒",
    "抗氧化",
    "舒缓",
    "温和",
    "适合敏感肌",
  ],
  "臻萃护理油": [
    "滋养",
    "修护",
    "舒缓",
    "保湿",
    "锁水",
    "光泽",
  ],
  "臻享礼盒套装": [
    "抗老",
    "紧致",
    "修护",
    "滋养",
    "保湿",
    "提亮",
  ],
};

async function main() {
  console.log("🔄 正在更新产品功效标签...\n");

  try {
    for (const [name, benefits] of Object.entries(PRODUCT_BENEFITS)) {
      const result = await prisma.product.updateMany({
        where: { name },
        data: { benefits },
      });

      if (result.count > 0) {
        console.log(`✅ ${name}: ${benefits.join(", ")}`);
      } else {
        console.log(`⚠️ ${name}: 未找到该产品`);
      }
    }

    console.log("\n✅ 产品功效标签更新完成！");
    console.log("💡 新的标签将更好地匹配推荐算法的关键词。");
  } catch (error) {
    console.error("❌ 更新失败:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main();


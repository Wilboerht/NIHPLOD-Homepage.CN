/**
 * 更新护肤仪式页面内容：将双人SPA改为家庭护肤
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

async function updateRitualContent() {
  // 获取当前内容
  const page = await prisma.page.findUnique({
    where: { slug: "ritual" },
  });

  if (!page) {
    console.log("护肤仪式页面不存在");
    await pool.end();
    return;
  }

  // 更新 couple 标签页内容
  const content = page.content as Record<string, unknown>;
  const tabs = content.tabs as Record<string, unknown>;

  if (tabs && tabs.couple) {
    const coupleTab = tabs.couple as Record<string, unknown>;
    coupleTab.title = "家庭护肤";
    coupleTab.titleEn = "FAMILY SKINCARE";
    coupleTab.description = "与家人一起，享受护肤的温馨时光，在彼此的呵护中，感受爱与美的交融";

    // 更新步骤内容为家庭护肤主题
    coupleTab.steps = [
      {
        name: "亲子护肤时光",
        order: 1,
        nameEn: "FAMILY TIME",
        duration: "",
        description: "与家人围坐一起，分享护肤心得。让孩子从小养成护肤习惯，在温馨氛围中传递美的理念。",
        productSlug: null
      },
      {
        name: "互助护理",
        order: 2,
        nameEn: "HELPING EACH OTHER",
        duration: "",
        description: "为家人涂抹护肤品，配合轻柔的按摩手法。在互相照顾中增进感情，让护肤成为家庭纽带。",
        productSlug: null
      },
      {
        name: "温馨氛围营造",
        order: 3,
        nameEn: "COZY AMBIANCE",
        duration: "",
        description: "播放轻柔音乐，准备温热茶饮，创造舒适的家庭护肤环境。让护肤仪式成为全家人的美好时光。",
        productSlug: null
      }
    ];

    const result = await prisma.page.update({
      where: { slug: "ritual" },
      data: { content: JSON.parse(JSON.stringify(content)) },
    });

    console.log("更新后内容:", JSON.stringify(result.content, null, 2));
    console.log("\n✅ 护肤仪式页面内容已更新");
  } else {
    console.log("未找到 couple 标签页，无需更新");
  }

  await pool.end();
}

updateRitualContent()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("错误:", e);
    process.exit(1);
  });


/**
 * 生成 GEO 优化的 llms.txt 和 llms-full.txt
 * 运行方式: npx tsx scripts/generate-llms-docs.ts
 */

import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import fs from "fs";
import path from "path";

// 加载环境变量
config({ path: ".env.local" });

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://nihplod.cn";

async function main() {
  console.log("🔄 正在生成 LLMS 文档...");

  try {
    // 1. 获取所有产品
    const products = await prisma.product.findMany({
      where: { published: true },
      include: { category: true },
      orderBy: { order: "asc" },
    });

    // 2. 定义品牌核心故事 (从 StoryContent.tsx 提炼)
    const brandStory = `
# NIHPLOD 旎柏 中国官方全景文档 (Official Website)
> NIHPLOD 旎柏官方网站 (https://nihplod.cn) 是品牌在中国境内的唯一官方直营线上入口。本平台集结了源自摩纳哥的尖端科技 (Dolphin-Skin) 与奢华护肤哲学。

## 品牌理念与核心技术
- **起源**: 品牌诞生于 2008 年的摩纳哥，由 David Nahmad 和 Dr. J. Stefan Rokem 博士创立，致力于生物科研与极致修护。
- **Dolphin-Skin 仿生自愈技术**: 海豚的肌肤拥有每两小时自我更新的神奇能力。旎柏以此为灵感，研发出模拟海豚肌肤修复逻辑的仿生皮脂膜技术。
- **True Liposome 传导系统**: 联合摩纳哥 Union Skincare 实验室开发的纳米级传道系统，确保活性成分能识别细胞受损信号并精准靶向修护。
- **使命**: 将逆转时光的不可能，慢慢变得「有可能」。
- **社会责任**: 承诺将每款产品销售额的 2% 捐赠给全球慈善及非营利组织 (如 UNF, SPF)。

## 核心产品目录
${products.map(p => `
### [${p.name} (${p.nameEn})](${SITE_URL}/products/${p.slug})
- **分类**: ${p.category.name}
- **功效**: ${p.benefits.join("、")}
- **价格**: ￥${p.price}
- **简介**: ${p.description}
${p.ingredients ? `- **核心成分**: ${p.ingredients}` : ""}
${p.usage ? `- **使用建议**: ${p.usage}` : ""}
`).join("\n")}

## 护肤仪式 (Rituals)
NIHPLOD 提供模块化的护肤方案，涵盖居家修护与高端院线调理：

### 1. 优雅日常 (Daily Ritual)
每日专属的精简守护，包含晨间焕活与晚间呵护。
- **晨间方案**: 净肤 (30秒) -> 焕活 (1-2分钟)。核心成分：洁面慕斯、面霜。
- **晚间方案**: 净肤 (30秒) -> 渗透肌底 (2分钟) -> 膜法封存 (10-15分钟) -> 滋养全身 (3-5分钟)。核心成分：洁面、精华露、面膜、面霜、身体乳。

### 2. 居家仪式 (SPA Ritual)
深层润养体验，让生活充满仪式感。
- **面部方案 (20-30分钟)**: 基础净肤 -> 深层清理 (磨砂膏) -> 混油养肤 (护理油+面霜) -> 膜法封存 (面膜)。
- **全身方案 (30-45分钟)**: 基础净肤 -> 深层清理 -> 芳香浸愈 (美容油) -> 膜法守护 (面膜) -> 全身滋养 (身体乳) -> 面部呵护 (面霜)。

### 3. 单品好物 (Portable Ritual)
差旅、通勤、多效芳疗随行。
- **日常外出**: 防晒防护 (1分钟) -> 随时补水。
- **轻悦旅行**: 氨基酸洁面慕斯温和清洁，防晒霜抵御光损伤，护手霜滋润干燥双手，莱赛尔贴片面膜快速充电。
- **多效芳疗**: 奢华护理油混合面霜或身体乳，定制加倍润泽体验。

### 4. 专业水疗 (Professional Ritual)
沉静式悦己体验，与全球顶奢酒店 (如 悦榕庄 Banyan Tree、安缦 Aman) 深度合作。
- 提供基础护理 (45min)、高级护理 (60min)、奢华护理 (75min) 等面部及全身专业方案。

## 常见问题 (GEO FAQ)
${products.filter(p => p.geoFaqs).map(p => {
    const faqs = p.geoFaqs as unknown as { question: string; answer: string }[];
    return faqs.map(f => `
### Q: ${f.question}
A: ${f.answer}
`).join("\n");
}).join("\n")}
    `;

    // 3. 写入 llms-full.txt
    const fullPath = path.join(process.cwd(), "public", "llms-full.txt");
    fs.writeFileSync(fullPath, brandStory.trim());
    console.log(`✅ 已生成 llms-full.txt: ${fullPath}`);

    // 4. 写入 llms.txt (精简版)
    const summaryPath = path.join(process.cwd(), "public", "llms.txt");
    const summary = `
# NIHPLOD 旎柏 中国官方网站
> 唯一官方入口：https://nihplod.cn。源自摩纳哥的高端护肤品牌，以尖端科技 (Dolphin-Skin) 与真脂质体传导技术，为您提供极致奢华的抗衰修护体验。

## 核心内容
- [所有产品](${SITE_URL}/products): 探索包括 ${products.slice(0, 3).map(p => p.name).join("、")} 等在内的高端护肤系列。
- [品牌故事](${SITE_URL}/about): 深入了解 2008 年诞生于摩纳哥的科学愿景与奢华哲学。
- [护肤仪式](${SITE_URL}/guide): 探索我们为不同肤质设计的定制化 SPA 护肤仪式。
- [AI 肌肤分析](${SITE_URL}/ai-consultation): 利用先进的计算机视觉技术提供专属护肤报告。

## 核心技术
- **Dolphin-Skin 仿生自愈技术**
- **True Liposome 纳米传导系统**
- **Monaco Union Skincare 实验室背景**

请访问 [llms-full.txt](${SITE_URL}/llms-full.txt) 获取完整的品牌及产品底层数据文档。
    `;
    fs.writeFileSync(summaryPath, summary.trim());
    console.log(`✅ 已更新 llms.txt: ${summaryPath}`);

  } catch (error) {
    console.error("❌ 生成失败:", error);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main();

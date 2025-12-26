/**
 * 生产环境问题数据更新脚本
 * 更新 AdvisorQuestion 表的数据，添加 gender 字段
 *
 * 使用方法：
 * npx tsx scripts/update-prod-questions.ts
 */

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

// 生产环境数据库 URL
const PROD_DATABASE_URL = "postgresql://postgres.gggmklbpdhsdwmmbkgzg:Moidas123!@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true";

// 问题数据
const questions = [
  {
    fieldName: "skinType",
    question: "你的肌肤类型是？",
    order: 1,
    gender: "all",
    options: [
      { value: "dry", label: "干性肌肤", labelEn: "Dry", description: "常感紧绷、脱皮", emoji: "🏜️" },
      { value: "oily", label: "油性肌肤", labelEn: "Oily", description: "容易出油、有光泽", emoji: "✨" },
      { value: "combination", label: "混合性肌肤", labelEn: "Combination", description: "T区油、两颊干", emoji: "🔄" },
      { value: "sensitive", label: "敏感性肌肤", labelEn: "Sensitive", description: "易泛红、刺激", emoji: "🌸" },
      { value: "normal", label: "中性肌肤", labelEn: "Normal", description: "水油平衡、状态稳定", emoji: "💧" },
      { value: "unknown", label: "不太确定", labelEn: "Not Sure", description: "需要专业判断", emoji: "❓" },
    ],
  },
  {
    fieldName: "primaryConcern",
    question: "你最关注的肌肤问题是？",
    order: 2,
    gender: "all",
    options: [
      { value: "aging", label: "细纹抗老", labelEn: "Anti-aging", description: "淡化细纹、紧致提升", emoji: "⏰" },
      { value: "dull", label: "暗沉提亮", labelEn: "Brightening", description: "提亮肤色、焕发光彩", emoji: "💡" },
      { value: "hydration", label: "补水保湿", labelEn: "Hydration", description: "深层补水、持久锁水", emoji: "💦" },
      { value: "pores", label: "毛孔粗大", labelEn: "Pores", description: "收缩毛孔、细腻肌肤", emoji: "🔍" },
      { value: "sensitive", label: "敏感泛红", labelEn: "Sensitivity", description: "舒缓镇静、修护屏障", emoji: "🛡️" },
      { value: "acne", label: "痘痘粉刺", labelEn: "Acne", description: "清除痘痘、预防反复", emoji: "🎯" },
    ],
  },
  {
    fieldName: "ageRange",
    question: "你的年龄段是？",
    order: 3,
    gender: "all",
    options: [
      { value: "18-24", label: "18-24 岁", labelEn: "18-24", description: "肌肤年轻、预防为主", emoji: "🌱" },
      { value: "25-30", label: "25-30 岁", labelEn: "25-30", description: "初抗老阶段", emoji: "🌿" },
      { value: "31-40", label: "31-40 岁", labelEn: "31-40", description: "抗老保养关键期", emoji: "🌳" },
      { value: "41-50", label: "41-50 岁", labelEn: "41-50", description: "深度抗老需求", emoji: "🍂" },
      { value: "50+", label: "50 岁以上", labelEn: "50+", description: "修护滋养为主", emoji: "🍁" },
    ],
  },
  {
    fieldName: "currentRoutine",
    question: "你目前的护肤习惯是？",
    order: 4,
    gender: "all",
    options: [
      { value: "minimal", label: "极简护肤", labelEn: "Minimal", description: "洁面+保湿即可", emoji: "1️⃣" },
      { value: "basic", label: "基础护肤", labelEn: "Basic", description: "洁面、面霜基本步骤", emoji: "3️⃣" },
      { value: "complete", label: "完整护肤", labelEn: "Complete", description: "精华、面霜、防晒都用", emoji: "5️⃣" },
      { value: "advanced", label: "进阶护理", labelEn: "Advanced", description: "会用护理油、面膜等", emoji: "🔬" },
      { value: "none", label: "几乎不护肤", labelEn: "None", description: "想开始但不知如何", emoji: "🆕" },
    ],
  },
  {
    fieldName: "allergies",
    question: "你有以下过敏情况吗？",
    order: 5,
    gender: "all",
    options: [
      { value: "none", label: "没有过敏史", labelEn: "None", description: "大部分产品都能用", emoji: "✅" },
      { value: "fragrance", label: "香精过敏", labelEn: "Fragrance", description: "对香料成分敏感", emoji: "🌺" },
      { value: "alcohol", label: "酒精过敏", labelEn: "Alcohol", description: "对酒精成分敏感", emoji: "🚫" },
      { value: "acid", label: "酸类不耐受", labelEn: "Acid", description: "用果酸等会刺激", emoji: "⚠️" },
      { value: "multiple", label: "多种过敏", labelEn: "Multiple", description: "需要特别小心", emoji: "🔴" },
      { value: "unknown", label: "不太清楚", labelEn: "Unknown", description: "没有特别注意过", emoji: "❓" },
    ],
  },
  {
    fieldName: "budget",
    question: "你的护肤预算是？",
    order: 6,
    gender: "all",
    options: [
      { value: "budget", label: "追求性价比", labelEn: "Budget", description: "¥500 以内/月", emoji: "💰" },
      { value: "mid", label: "中等预算", labelEn: "Mid-range", description: "¥500-1500/月", emoji: "💎" },
      { value: "premium", label: "品质优先", labelEn: "Premium", description: "¥1500-3000/月", emoji: "👑" },
      { value: "luxury", label: "不设上限", labelEn: "Luxury", description: "只选最好的", emoji: "✨" },
    ],
  },
  {
    fieldName: "pregnancyStatus",
    question: "您目前是否处于备孕、孕期、产后或哺乳期？",
    order: 7,
    gender: "female",
    options: [
      { value: "yes", label: "是", labelEn: "Yes", description: "我们将提供特别关怀建议", emoji: "🤰" },
      { value: "no", label: "否", labelEn: "No", description: "无特殊时期", emoji: "✅" },
      { value: "private", label: "暂不透露", labelEn: "Prefer not to say", description: "跳过此问题", emoji: "🔒" },
    ],
  },
  {
    fieldName: "medicationHistory",
    question: "关于肌肤的护理与用药经历，以下哪项最符合？",
    order: 8,
    gender: "all",
    options: [
      { value: "routine", label: "常规护理", labelEn: "Routine Care", description: "仅使用护肤品，未长期使用药膏或口服药", emoji: "🧴" },
      { value: "occasional", label: "偶有用药", labelEn: "Occasional Medication", description: "仅在严重时短期使用过非处方药膏，非长期依赖", emoji: "💊" },
      { value: "ongoing", label: "持续治疗", labelEn: "Ongoing Treatment", description: "目前或近期（6个月内）正在医生指导下使用处方药", emoji: "🏥" },
      { value: "complex", label: "情况复杂", labelEn: "Complex History", description: "有明确皮肤病史或长期用药史，希望获得更谨慎的建议", emoji: "⚕️" },
    ],
  },
];

async function main() {
  console.log("🔗 连接到生产环境数据库...\n");

  const pool = new pg.Pool({ connectionString: PROD_DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    // 0. 检查并添加 gender 字段
    console.log("0. 检查 gender 字段...");
    const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'AdvisorQuestion';
    `;
    const hasGender = columns.some(c => c.column_name === "gender");

    if (!hasGender) {
      console.log("   添加 gender 字段...");
      await prisma.$executeRaw`ALTER TABLE "AdvisorQuestion" ADD COLUMN "gender" TEXT NOT NULL DEFAULT 'all';`;
      console.log("   ✓ gender 字段已添加\n");
    } else {
      console.log("   ✓ gender 字段已存在\n");
    }

    // 1. 删除旧问题
    console.log("1. 删除旧问题数据...");
    await prisma.advisorQuestion.deleteMany({});
    console.log("   ✓ 已清除旧数据\n");

    // 2. 创建新问题
    console.log("2. 创建新问题数据...");
    for (const q of questions) {
      await prisma.advisorQuestion.create({ data: q });
      console.log(`   ✓ ${q.fieldName} (gender: ${q.gender})`);
    }

    // 3. 验证
    console.log("\n3. 验证结果...");
    const count = await prisma.advisorQuestion.count();
    console.log(`   总计: ${count} 个问题`);

    const femaleOnly = await prisma.advisorQuestion.findMany({ where: { gender: "female" } });
    console.log(`   仅女性: ${femaleOnly.length} 个 (${femaleOnly.map(q => q.fieldName).join(", ")})`);

    console.log("\n✅ 生产环境问题数据更新完成！");
  } catch (error) {
    console.error("\n❌ 错误:", error);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main();


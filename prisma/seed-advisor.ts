
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

async function main() {
    console.log("🌱 开始更新 AI 顾问数据 (问题 & 规则)...");

    // 1. 更新 AI 问题
    console.log("正在更新问卷问题...");
    await prisma.advisorQuestion.deleteMany({});

    const questions = [
        {
            fieldName: "skinType",
            question: "您的肌肤类型更偏向？",
            order: 1,
            gender: "all",
            options: [
                { value: "sensitive", label: "敏感性肌肤", labelEn: "Sensitive", description: "易泛红、刺痛、发痒。", emoji: "🌸" },
                { value: "normal", label: "中性肌肤", labelEn: "Normal", description: "不油不干，状态稳定。", emoji: "💧" },
                { value: "combination", label: "混合型肌肤", labelEn: "Combination", description: "T区（额头、鼻、下巴）油，两颊干/中性。", emoji: "🔄" },
                { value: "dry", label: "干性肌肤", labelEn: "Dry", description: "全脸干燥，易起皮、紧绷。", emoji: "🏜️" },
                { value: "combination_dry", label: "混干性肌肤", labelEn: "Combination Dry", description: "T区中性或微油，两颊明显干燥。", emoji: "🍂" },
                { value: "oily", label: "油性肌肤", labelEn: "Oily", description: "全脸易出油、毛孔明显。", emoji: "✨" },
                { value: "combination_oily", label: "混油性肌肤", labelEn: "Combination Oily", description: "T区很油，两颊和眼周偏干燥。", emoji: "💫" },
                { value: "unknown", label: "我不太确定", labelEn: "Not Sure", description: "可根据日常感受猜测，或选此项由系统辅助判断。", emoji: "❓" },
            ],
        },
        {
            fieldName: "pregnancyStatus",
            question: "您目前是否处于备孕、孕期、产后或哺乳期？",
            order: 2,
            gender: "female",
            options: [
                { value: "yes", label: "是", labelEn: "Yes", description: "我们将提供特别关怀建议", emoji: "🤰" },
                { value: "no", label: "否", labelEn: "No", description: "无特殊时期", emoji: "✅" },
            ],
        },
        {
            fieldName: "medicalBeautyHistory",
            question: "您在近6个月内是否有过轻医美或手术型医美经历？",
            order: 3,
            gender: "female",
            options: [
                { value: "none", label: "没有", labelEn: "None", description: "不考虑任何医美方案", emoji: "❌" },
                { value: "planning", label: "暂时没有", labelEn: "Planning", description: "有计划轻医美/手术型医美的打算或可能", emoji: "📅" },
                { value: "light", label: "有过轻医美治疗", labelEn: "Light", description: "有过注射或仪器类治疗", emoji: "💉" },
                { value: "surgery", label: "有过手术类医美治疗", labelEn: "Surgery", description: "有过面部、眼部、鼻部创伤性调整", emoji: "🏥" },
            ],
        },
        {
            fieldName: "primaryConcern",
            question: "您最关注的肌肤问题是哪些？",
            order: 4,
            gender: "all",
            options: [
                { value: "anti_aging", label: "延衰抗老", labelEn: "Anti-aging", description: "改善松弛、皱纹、皮肤弹性。", emoji: "🕰️" },
                { value: "fine_lines", label: "淡化细纹", labelEn: "Fine Lines", description: "针对眼角、额头及颈部等已形成的细纹。", emoji: "〰️" },
                { value: "dullness", label: "暗沉提亮", labelEn: "Dullness", description: "改善肤色发黄、不透亮。", emoji: "🌟" },
                { value: "pigmentation", label: "色素不均", labelEn: "Pigmentation", description: "指色斑、痘印等局部颜色深浅不一。", emoji: "🌖" },
                { value: "hydration", label: "补水保湿", labelEn: "Hydration", description: "缓解干燥、起皮、紧绷感。", emoji: "💧" },
                { value: "pores", label: "毛孔粗大", labelEn: "Pores", description: "主要指鼻翼、脸颊的明显毛孔。", emoji: "🍊" },
                { value: "sensitivity", label: "敏感泛红", labelEn: "Sensitivity", description: "皮肤易受刺激出现发红、发热。", emoji: "🌸" },
                { value: "acne", label: "痘痘粉刺", labelEn: "Acne", description: "包括黑头、白头、红肿痘痘。", emoji: "🔴" },
            ],
        },
        {
            fieldName: "ageRange",
            question: "您的年龄段是？",
            order: 5,
            gender: "all",
            options: [
                { value: "under_23", label: "<23 岁", labelEn: "<23", description: "青春肌肤，以预防为主", emoji: "🌱" },
                { value: "23-30", label: "23-30 岁", labelEn: "23-30", description: "初抗老阶段，开启精致护理", emoji: "🌿" },
                { value: "31-40", label: "31-40 岁", labelEn: "31-40", description: "抗老黄金期，深度养护", emoji: "🌳" },
                { value: "41-50", label: "41-50 岁", labelEn: "41-50", description: "进阶抗老，焕活肌肤能量", emoji: "🍂" },
                { value: "above_50", label: ">50 岁", labelEn: ">50", description: "臻享修护，滋养呵护", emoji: "🍁" },
            ],
        },
        {
            fieldName: "currentRoutine",
            question: "您目前的护肤水平是？",
            order: 6,
            gender: "all",
            options: [
                { value: "beginner", label: "全新小白", labelEn: "Beginner", description: "不太了解护肤步骤和成分。", emoji: "🆕" },
                { value: "basic", label: "基础入门", labelEn: "Basic", description: "知道洁面、水乳、防晒等基础步骤。", emoji: "🧴" },
                { value: "intermediate", label: "略有心得", labelEn: "Intermediate", description: "会根据肤质挑选产品，关注部分功效成分。", emoji: "📖" },
                { value: "advanced", label: "资深达人", labelEn: "Advanced", description: "能看懂成分表，擅长搭配不同功效产品。", emoji: "🔬" },
                { value: "expert", label: "行业专家", labelEn: "Expert", description: "从事护肤、美容等相关专业工作。", emoji: "🎓" },
            ],
        },
        {
            fieldName: "skincareHabit",
            question: "您的护肤习惯是？",
            order: 7,
            gender: "all",
            options: [
                { value: "rarely", label: "几乎不护肤", labelEn: "Rarely", description: "很少护肤或随意护肤。", emoji: "❌" },
                { value: "simple", label: "简易打理", labelEn: "Simple", description: "仅进行 1-2 步基础护理（如只涂面霜）。", emoji: "🧴" },
                { value: "dedicated", label: "认真对待", labelEn: "Dedicated", description: "追求合适的产品、使用步骤和方法，偶尔使用居家美容仪器。", emoji: "✨" },
                { value: "professional", label: "专业护理", labelEn: "Professional", description: "定期或不定期的进行医美或专业院线级护理。", emoji: "💆‍♀️" },
            ],
        },
        {
            fieldName: "allergies",
            question: "你有以下过敏情况吗？",
            order: 8,
            gender: "all",
            options: [
                { value: "none", label: "没有过敏史", labelEn: "None", description: "从未对护肤品或成分过敏", emoji: "✅" },
                { value: "fragrance", label: "香精过敏", labelEn: "Fragrance", description: "对护肤品中的\"香精\"成分敏感", emoji: "🌺" },
                { value: "alcohol", label: "酒精过敏", labelEn: "Alcohol", description: "对\"乙醇\"、\"变性乙醇\"等成分敏感", emoji: "🚫" },
                { value: "acid", label: "酸类不耐受", labelEn: "Acid", description: "使用水杨酸、果酸等产品易刺痛泛红", emoji: "⚠️" },
                { value: "multiple", label: "多种过敏", labelEn: "Multiple", description: "对多种成分或产品类型有过过敏反应", emoji: "🔴" },
                { value: "unknown", label: "不太清楚", labelEn: "Unknown", description: "不确定自己对哪些成分过敏", emoji: "❓" },
            ],
        },
        {
            fieldName: "budget",
            question: "您的护肤预算是？",
            order: 9,
            gender: "all",
            options: [
                { value: "budget", label: "追求性价比", labelEn: "Budget", description: "", emoji: "💰" },
                { value: "mid", label: "中等预算", labelEn: "Mid-range", description: "", emoji: "💎" },
                { value: "premium", label: "品质优先", labelEn: "Premium", description: "", emoji: "👑" },
                { value: "luxury", label: "不设上限", labelEn: "Luxury", description: "", emoji: "✨" },
            ],
        },
        {
            fieldName: "medicationHistory",
            question: "关于肌肤的护理与用药经历，以下哪项最符合？",
            order: 10,
            gender: "all",
            options: [
                { value: "routine", label: "常规护理", labelEn: "Routine Care", description: "仅使用护肤品，未长期使用药膏或口服药", emoji: "🧴" },
                { value: "occasional", label: "偶有用药", labelEn: "Occasional Medication", description: "仅在严重时短期使用过非处方药膏，非长期依赖", emoji: "💊" },
                { value: "ongoing", label: "持续治疗", labelEn: "Ongoing Treatment", description: "目前或近期（6个月内）正在医生指导下使用处方药", emoji: "🏥" },
                { value: "complex", label: "情况复杂", labelEn: "Complex History", description: "有明确皮肤病史或长期用药史，希望获得更谨慎的建议", emoji: "⚕️" },
            ],
        },
    ];

    for (const q of questions) {
        await prisma.advisorQuestion.create({
            data: q,
        });
    }
    console.log("✅ AI 问题更新完成");

    // 2. 更新推荐规则
    console.log("正在更新推荐规则...");

    // 获取现有产品 ID
    const allProducts = await prisma.product.findMany({ select: { id: true, slug: true } });
    const productMap: Record<string, string> = {};
    for (const p of allProducts) {
        productMap[p.slug] = p.id;
    }

    await prisma.recommendationRule.deleteMany({});

    // 修正后的规则条件
    const rules = [
        {
            conditions: { skinType: ["dry"], primaryConcern: ["hydration"] },
            productIds: [productMap["serum"], productMap["face-cream"], productMap["face-mask"]].filter(Boolean),
            priority: 10,
            message: "针对您的干性肌肤和补水需求，我们推荐以修护紧致精华为核心的保湿方案。",
        },
        {
            conditions: { skinType: ["oily"], primaryConcern: ["pores"] },
            productIds: [productMap["foam-cleanser"], productMap["face-scrub"], productMap["sunscreen"]].filter(Boolean),
            priority: 10,
            message: "针对您的油性肌肤和毛孔问题，我们推荐控油清洁的护理方案。",
        },
        {
            conditions: { skinType: ["sensitive"], primaryConcern: ["sensitive"] },
            productIds: [productMap["foam-cleanser"], productMap["serum"], productMap["face-cream"]].filter(Boolean),
            priority: 15,
            message: "针对您的敏感肌肤，我们推荐温和修护的护理方案，所有产品均适合敏感肌使用。",
        },
        {
            // 这里的条件必须匹配 questions 中的 value
            conditions: { primaryConcern: ["anti_aging"], ageRange: ["31-40", "41-50", "above_50"] },
            productIds: [productMap["serum"], productMap["face-cream"], productMap["treatment-oil"], productMap["face-mask"]].filter(Boolean),
            priority: 20,
            message: "针对您的抗老需求，我们推荐以明星产品修护紧致精华为核心的抗衰方案。",
        },
        {
            conditions: { skinType: ["combination"] },
            productIds: [productMap["foam-cleanser"], productMap["serum"], productMap["sunscreen"]].filter(Boolean),
            priority: 5,
            message: "针对您的混合性肌肤，我们推荐平衡水油的护理方案。",
        },
    ];

    for (const rule of rules) {
        await prisma.recommendationRule.create({ data: rule });
    }
    console.log("✅ 推荐规则更新完成");

    console.log("\n🎉 AI 顾问数据（问题与规则）已从代码同步到数据库！");
}

main()
    .catch((e) => {
        console.error("❌ 失败:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

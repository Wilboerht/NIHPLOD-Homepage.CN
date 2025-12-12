/**
 * 数据库种子脚本
 * 运行: npx prisma db seed
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import bcrypt from "bcryptjs";

// 加载环境变量
config({ path: ".env.local" });

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 开始初始化种子数据...\n");

  // 1. 创建默认管理员
  const hashedPassword = await bcrypt.hash("admin123456", 12);
  await prisma.admin.upsert({
    where: { email: "admin@nihplod.cn" },
    update: {},
    create: {
      email: "admin@nihplod.cn",
      password: hashedPassword,
      name: "Admin",
    },
  });
  console.log("✅ 管理员账号已创建 (admin@nihplod.cn / admin123456)");

  // 2. 创建产品分类
  const categories = [
    { name: "洁面", nameEn: "Cleanser", slug: "cleanser", order: 1 },
    { name: "磨砂膏", nameEn: "Scrub", slug: "scrub", order: 2 },
    { name: "面膜", nameEn: "Mask", slug: "mask", order: 3 },
    { name: "精华", nameEn: "Serum", slug: "serum", order: 4 },
    { name: "面霜", nameEn: "Cream", slug: "cream", order: 5 },
    { name: "防晒", nameEn: "Sunscreen", slug: "sunscreen", order: 6 },
    { name: "护手霜", nameEn: "Hand Cream", slug: "hand-cream", order: 7 },
    { name: "身体护理", nameEn: "Body Care", slug: "body-care", order: 7 },
    { name: "护理油", nameEn: "Treatment", slug: "treatment", order: 8 },
    { name: "礼盒套装", nameEn: "Gift Box", slug: "gift-box", order: 9 },
  ];
  const categoryMap: Record<string, string> = {};
  for (const cat of categories) {
    const created = await prisma.category.upsert({
      where: { slug: cat.slug },
      update: cat,
      create: cat,
    });
    categoryMap[cat.slug] = created.id;
  }
  console.log("✅ 产品分类已创建 (10 个分类)");

  // 3. 创建 AI 问题（与 src/config/advisor-questions.ts 保持一致）
  const questions = [
    {
      fieldName: "skinType",
      question: "你的肌肤类型是？",
      order: 1,
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
      options: [
        { value: "routine", label: "常规护理", labelEn: "Routine Care", description: "仅使用护肤品，未长期使用药膏或口服药", emoji: "🧴" },
        { value: "occasional", label: "偶有用药", labelEn: "Occasional Medication", description: "仅在严重时短期使用过非处方药膏，非长期依赖", emoji: "💊" },
        { value: "ongoing", label: "持续治疗", labelEn: "Ongoing Treatment", description: "目前或近期（6个月内）正在医生指导下使用处方药", emoji: "🏥" },
        { value: "complex", label: "情况复杂", labelEn: "Complex History", description: "有明确皮肤病史或长期用药史，希望获得更谨慎的建议", emoji: "⚕️" },
      ],
    },
  ];

  // 先删除所有旧问题，确保数据一致性
  await prisma.advisorQuestion.deleteMany({});

  for (const q of questions) {
    await prisma.advisorQuestion.create({
      data: q,
    });
  }
  console.log("✅ AI 问题已创建 (8 个问题)");

  // 4. 创建默认设置
  const settings = [
    {
      key: "site",
      value: {
        name: "NIHPLOD 旎柏",
        description: "源自摩纳哥的高端护肤品牌",
        logo: "/images/logo.svg",
        favicon: "/favicon.ico",
      },
    },
    {
      key: "social",
      value: {
        wechat_qrcode: "",
        weibo: "",
        xiaohongshu: "",
        douyin: "",
        instagram: "",
      },
    },
    {
      key: "contact",
      value: {
        email: "contact@nihplod.cn",
        phone: "",
        address: "",
        workingHours: "周一至周五 9:00-18:00",
      },
    },
    {
      key: "seo",
      value: {
        title: "NIHPLOD 旎柏 | 高端护肤品牌",
        description: "源自摩纳哥的高端护肤品牌，为您带来奢华护肤体验。",
        keywords: "NIHPLOD,旎柏,护肤品,高端护肤,摩纳哥",
      },
    },
  ];
  for (const s of settings) {
    await prisma.setting.upsert({
      where: { key: s.key },
      update: { value: s.value },
      create: s,
    });
  }
  console.log("✅ 系统设置已创建 (4 个配置)");

  // 5. 创建 NIHPLOD 产品 (基于 nihplod.net 官网)
  const products = [
    {
      name: "云朵洁面慕斯",
      nameEn: "Foam Cleanser",
      slug: "foam-cleanser",
      description: "NIHPLOD 云朵洁面慕斯，采用新一代脂质体技术，温和清洁肌肤的同时保持肌肤天然屏障。绵密云朵泡沫，深层清洁毛孔污垢，洗后不紧绷，为后续护肤做好准备。",
      price: 680,
      capacity: "100ml / 3.4oz",
      categoryId: categoryMap["cleanser"],
      ingredients: "Water/Aqua/Eau, Glycerin, Cocamidopropyl Betaine, Sodium Lauroyl Sarcosinate, Sodium Hyaluronate, Liposome Complex, Vitamin E",
      usage: "取适量于掌心，加水揉搓起泡后轻柔按摩面部，用清水洗净。早晚各使用一次。",
      benefits: ["温和清洁", "保湿不紧绷", "深层洁净", "适合所有肤质"],
      order: 1,
      featured: true,
      published: true,
    },
    {
      name: "匀衡磨砂膏",
      nameEn: "Face Scrub",
      slug: "face-scrub",
      description: "NIHPLOD 匀衡磨砂膏，温和去除老废角质，改善毛孔粗大问题。平衡水油，细腻肤质，提亮肤色，令肌肤重焕光采。",
      price: 780,
      capacity: "50ml / 1.7oz",
      categoryId: categoryMap["scrub"],
      ingredients: "Water/Aqua/Eau, Glycerin, Vitamin C Derivatives, Niacinamide, Sodium Hyaluronate, Shea Butter",
      usage: "洁面后，取适量于掌心，轻柔按摩面部2-3分钟，避开眼周，用清水洗净。建议每周使用1-2次。",
      benefits: ["去角质", "收缩毛孔", "提亮肤色", "平衡水油"],
      order: 2,
      featured: false,
      published: true,
    },
    {
      name: "臻萃修护面膜",
      nameEn: "Face Mask",
      slug: "face-mask",
      description: "NIHPLOD 臻萃修护面膜，采用莱赛尔与生物纤维二合一膜布，轻薄透气，与肌肤完美贴合。富含 Alpha-Arbutin、泛醇、透明质酸钠等珍贵成分，密集修护滋养肌肤，重建肌肤屏障。",
      price: 1548,
      capacity: "6片装 (30g x 6)",
      categoryId: categoryMap["mask"],
      ingredients: "Water/Aqua/Eau, Lyocell & Bio-Cellulose, Alpha-Arbutin, Panthenol, Sodium Hyaluronate, Niacinamide, Ceramide, Collagen",
      usage: "洁面后，取出面膜敷于面部，15-20分钟后取下。轻拍多余精华至吸收，无需洗净。",
      benefits: ["密集修护", "修复屏障", "深层保湿", "提亮焕肤"],
      order: 3,
      featured: true,
      published: true,
    },
    {
      name: "修护紧致精华",
      nameEn: "Serum",
      slug: "serum",
      description: "NIHPLOD 修护紧致精华，品牌核心产品。精选多种珍贵天然萃取精华，运用先进脂质体技术，让真正的营养和修护因子深入肌底。",
      price: 4900,
      capacity: "30ml / 1oz",
      categoryId: categoryMap["serum"],
      ingredients: "Water/Aqua/Eau, Liposome Complex, Pro-Xylane, Hexapeptide, Vitamin C Derivatives, Sodium Hyaluronate, Squalane",
      usage: "早晚洁面爽肤后，取2-3滴于掌心，轻轻按压于面部及颈部，由下往上轻柔提拉按摩至吸收。",
      benefits: ["抗老紧致", "淡化细纹", "提升弹性", "修护肌底", "焕亮光采"],
      order: 4,
      featured: true,
      published: true,
    },
    {
      name: "逆龄面霜",
      nameEn: "Face Cream",
      slug: "face-cream",
      description: "NIHPLOD 逆龄面霜，高端抗衰面霜。奢华质地，日间焕亮保湿，夜间深层修护。使用前请保持面霜在肌肤上停留至少10分钟。",
      price: 2550,
      capacity: "50ml / 1.7oz",
      categoryId: categoryMap["cream"],
      ingredients: "Water/Aqua/Eau, Squalane, Shea Butter, Liposome Complex, Pro-Xylane, Niacinamide, Sodium Hyaluronate, Vitamin E, Ceramide",
      usage: "早晚护肤最后一步，取适量面霜于指尖，均匀涂抹于面部，轻柔按摩至完全吸收。建议停留至少10分钟。",
      benefits: ["抗衰老", "深层滋养", "紧致提升", "保湿锁水", "修护屏障"],
      order: 5,
      featured: true,
      published: true,
    },
    {
      name: "臻养护手霜",
      nameEn: "Hand Cream",
      slug: "hand-cream",
      description: "NIHPLOD 臻养护手霜，富含特制角鲨烷、玻色因和水解胶原蛋白。有效改善手部干燥、粗糙、细纹等问题，令双手柔嫩细滑。",
      price: 480,
      capacity: "50ml",
      categoryId: categoryMap["hand-cream"],
      ingredients: "Water/Aqua/Eau, Squalane, Pro-Xylane, Hydrolyzed Collagen, Shea Butter, Vitamin E",
      usage: "取适量于手背，均匀涂抹至双手完全吸收。可随时使用。",
      benefits: ["深层滋润", "淡化细纹", "柔嫩双手", "长效保湿"],
      order: 6,
      featured: false,
      published: true,
    },
    {
      name: "奢润身体乳",
      nameEn: "Body Lotion",
      slug: "body-lotion",
      description: "NIHPLOD 奢润身体乳，为全身肌肤带来奢华滋养体验。轻盈质地快速吸收，持久保湿不黏腻。",
      price: 880,
      capacity: "250ml / 8.5oz",
      categoryId: categoryMap["body-care"],
      ingredients: "Water/Aqua/Eau, Glycerin, Squalane, Sodium Hyaluronate, Shea Butter, Vitamin E, Ceramide",
      usage: "沐浴后，取适量于掌心，均匀涂抹于全身肌肤，轻柔按摩至吸收。",
      benefits: ["全身滋养", "持久保湿", "柔滑细腻", "快速吸收"],
      order: 7,
      featured: false,
      published: true,
    },
    {
      name: "轻透防晒霜",
      nameEn: "Sunscreen",
      slug: "sunscreen",
      description: "NIHPLOD 轻透防晒霜，不仅是防晒，更是养肤。经临床验证，有效抑制光损伤和外界污染物引起的炎症及不良皮肤反应。",
      price: 1448,
      capacity: "40ml / 1.35oz",
      categoryId: categoryMap["sunscreen"],
      ingredients: "Water/Aqua/Eau, Titanium Dioxide, Zinc Oxide, Sodium Hyaluronate, Vitamin E, Squalane, Liposome Complex, Ceramide",
      usage: "护肤最后一步，妆前使用。取适量均匀涂抹于面部及颈部。户外活动建议每2-3小时补涂。",
      benefits: ["防晒隔离", "抗光老化", "抗炎修护", "轻薄不闷", "敏感肌适用"],
      order: 8,
      featured: true,
      published: true,
    },
    {
      name: "臻萃护理油",
      nameEn: "Treatment Oil",
      slug: "treatment-oil",
      description: "NIHPLOD 臻萃护理油，蕴含多种珍贵植物精油，深层滋养修护肌肤。轻盈油质快速渗透，不油腻不闷肤。",
      price: 1680,
      capacity: "30ml",
      categoryId: categoryMap["treatment"],
      ingredients: "Squalane, Jojoba Oil, Rosehip Oil, Vitamin E, Essential Oil Complex",
      usage: "洁面后，取3-5滴于掌心温热，轻按于面部及颈部。可单独使用或混合面霜使用。",
      benefits: ["深层滋养", "修护屏障", "柔润光泽", "舒缓肌肤"],
      order: 9,
      featured: false,
      published: true,
    },
    {
      name: "臻享礼盒套装",
      nameEn: "Gift Box Series",
      slug: "gift-box",
      description: "NIHPLOD 臻享礼盒套装，包含品牌明星产品修护紧致精华与逆龄面霜。完美搭配，开启奢华护肤仪式。",
      price: 6350,
      capacity: "精华30ml + 面霜50ml",
      categoryId: categoryMap["gift-box"],
      ingredients: "详见单品成分说明",
      usage: "按照单品使用说明，先使用精华后使用面霜，早晚护肤。",
      benefits: ["明星组合", "抗老紧致", "深层修护", "奢华礼遇"],
      order: 10,
      featured: true,
      published: true,
    },
  ];

  // 先删除旧产品和图片
  await prisma.image.deleteMany({});
  await prisma.product.deleteMany({});
  console.log("🗑️ 已清理旧产品数据");

  for (const product of products) {
    await prisma.product.create({
      data: {
        ...product,
        images: {
          create: {
            url: `/images/products/${product.slug}.jpg`,
            alt: product.name,
            order: 0,
          },
        },
      },
    });
  }
  console.log("✅ NIHPLOD 产品已创建 (10 款产品)");

  // 6. 创建默认页面
  const pages = [
    {
      title: "首页",
      slug: "home",
      content: {
        hero: {
          title: "NIHPLOD",
          subtitle: "源自摩纳哥的高端护肤艺术",
          description: "每一滴精华，都是对美的极致追求",
        },
        sections: [],
      },
      seo: {
        title: "NIHPLOD 旎柏 | 首页",
        description: "源自摩纳哥的高端护肤品牌",
      },
      published: true,
    },
    {
      title: "关于旎柏",
      slug: "story",
      content: {
        pageTitle: { en: "ABOUT NIHPLOD", zh: "关于旎柏" },
        tabs: {
          story: {
            title: "品牌故事",
            sections: [
              {
                type: "hero",
                image: "/images/story/hero-products.jpg",
                imageAlt: "NIHPLOD 产品系列展示",
              },
              {
                type: "section",
                title: "「前沿科技」堪比医美的脂质体技术",
                subtitle: "2008年 | 摩纳哥 | 联合实验室公司",
                paragraphs: [
                  "Dr. Stefan 博士和他的团队\n潜心研发了特有的纳米乳液配方\n并通过与 Nexstar Pharmaceuticals 的合作\n加入了最先进的脂质体技术\n将真正能抵达真皮层的护肤体验展现于世",
                  "旎柏让每一个产品都无与伦比\n将逆转时光的不可能，慢慢变得「有可能」",
                ],
                image: "/images/story/lab-research.png",
                imageAlt: "实验室研发场景",
              },
              {
                type: "section",
                title: "「灵感来源」来自大自然的神奇修复力",
                subtitle: "REVERSE TIME 逆转时光",
                paragraphs: [
                  "海豚的肌肤拥有\n每两小时自我更新的神奇能力\n这种「逆转时光」的动物本能\n是旎柏成立的灵感来源",
                  "所以旎柏将「DOLPHIN」这个单词逆转\n于是就有了 NIHPLOD",
                ],
                image: "/images/story/dolphin-ocean.png",
                imageAlt: "海豚在海洋中游泳",
              },
            ],
          },
          mission: {
            title: "公司使命",
            subtitle: "OUR MISSION",
            layout: "mission-centered",
            sections: [
              {
                type: "mission-text",
                paragraphs: [
                  "NIHPLOD 将脂质体技术",
                  "与精选的天然活性成分相结合",
                  "通过大量临床实验和调研使日常护肤变得美好",
                  "通过最前沿的生物科技和配方",
                  "我们在护肤上将尽最大的可能",
                  "帮助人们「逆转时光」",
                  "这是我们一直继续前行的最大动力",
                ],
              },
            ],
          },
          philosophy: {
            title: "经营理念",
            subtitle: "OUR PHILOSOPHY",
            slogan: "「顶奢体验 · 护肤艺术」",
            layout: "philosophy",
            sections: [
              { type: "philosophy-item", title: "更珍贵的产品", paragraphs: ["我们通过采集这个世上最好的原材料", "结合最前沿及有效的科技力量", "不断更新和进步"] },
              { type: "philosophy-item", title: "更优越的体验", paragraphs: ["通过严选的供应渠道，极致的专员服务", "我们力求为你做到最满意、舒适及专业"] },
              { type: "philosophy-item", title: "更积极的方式", paragraphs: ["我们提倡以健康的心态", "去面对每一天", "通过适量的运动", "合理的膳食及平衡的心理"] },
              { type: "philosophy-item", title: "更艰巨的责任", paragraphs: ["我们将售出的每款产品的2%捐赠给", "全球的慈善组织和非营利组织", "包括 UNF、SPF 等"] },
            ],
          },
          media: {
            title: "媒体报道",
            subtitle: "PRESS",
            layout: "media-images",
            sections: [
              { type: "media-image", image: "/images/story/media-1.png", imageAlt: "媒体报道合作杂志", title: "NIHPLOD x SpaChina" },
              { type: "media-image", image: "/images/story/media-2.png", imageAlt: "媒体报道杂志封面", title: "国际时尚杂志报道" },
            ],
          },
          awards: {
            title: "荣获奖项",
            layout: "awards-images",
            sections: [
              { type: "media-image", image: "/images/story/award-2.png", imageAlt: "Robb Report 优中优选", title: "全球精英奢侈品杂志《Robb Report》入选「优中优选」", subtitle: "被评价为最有效的「护肤体验」" },
              { type: "media-image", image: "/images/story/award-1.png", imageAlt: "TimeOut 影响力高奢品牌", title: "TimeOut 2024年度", subtitle: "影响力高奢品牌" },
              { type: "media-image", image: "/images/story/award-3.png", imageAlt: "多项国际大奖", paragraphs: ["瑞士声望奖  ·  最佳创新化妆品奖", "LUX杂志评选  ·  消费者满意奖", "健康与水疗创新奖  ·  最佳治疗产品", "最佳新晋抗衰老产品  ·  全球美容大奖"] },
            ],
          },
        },
      },
      seo: {
        title: "关于旎柏 | NIHPLOD",
        description: "探索 NIHPLOD 旎柏的品牌故事、公司使命与经营理念",
      },
      published: true,
    },
    {
      title: "护肤仪式",
      slug: "ritual",
      content: {
        pageTitle: {
          en: "SKINCARE RITUAL",
          zh: "护肤仪式",
          description: "每一次护肤，都是与自己对话的珍贵时光",
        },
        tabs: {
          morning: {
            title: "晨间仪式",
            titleEn: "MORNING RITUAL",
            description: "清晨护肤，唤醒肌肤活力，为新的一天注入能量",
            steps: [
              {
                order: 1,
                name: "洁面",
                nameEn: "CLEANSE",
                description: "用温水轻柔唤醒肌肤，云朵洁面慕斯打出绵密泡沫，轻轻按摩全脸后冲洗干净。",
                duration: "1-2分钟",
                productSlug: "foam-cleanser",
              },
              {
                order: 2,
                name: "精华",
                nameEn: "SERUM",
                description: "取适量修护紧致精华于掌心温热，轻拍于面部，由内向外、由下向上轻柔按压至吸收。",
                duration: "30秒",
                productSlug: "serum",
              },
              {
                order: 3,
                name: "面霜",
                nameEn: "CREAM",
                description: "取黄豆大小逆龄面霜，均匀涂抹于面部，配合提拉手法按摩，锁住水分与营养。",
                duration: "1分钟",
                productSlug: "face-cream",
              },
              {
                order: 4,
                name: "防晒",
                nameEn: "SUNSCREEN",
                description: "最后一步，涂抹足量轻透防晒霜，为肌肤撑起保护伞，开启元气满满的一天。",
                duration: "30秒",
                productSlug: "sunscreen",
              },
            ],
          },
          evening: {
            title: "晚间仪式",
            titleEn: "EVENING RITUAL",
            description: "夜间护肤，修护一天的疲惫，让肌肤在睡眠中焕新",
            steps: [
              {
                order: 1,
                name: "洁面",
                nameEn: "CLEANSE",
                description: "云朵洁面慕斯温和清洁，洗去一天的疲惫与污垢，为后续护肤做好准备。",
                duration: "1-2分钟",
                productSlug: "foam-cleanser",
              },
              {
                order: 2,
                name: "精华",
                nameEn: "SERUM",
                description: "夜间是肌肤修护的黄金时段，修护紧致精华帮助深层滋养，修复日间损伤。",
                duration: "30秒",
                productSlug: "serum",
              },
              {
                order: 3,
                name: "护理油",
                nameEn: "OIL",
                description: "臻萃护理油加强滋养，轻柔按摩促进吸收，为肌肤注入奢润能量（可选步骤）。",
                duration: "30秒",
                productSlug: "treatment-oil",
              },
              {
                order: 4,
                name: "面霜",
                nameEn: "CREAM",
                description: "逆龄面霜质地滋润，配合轻柔按摩，让营养在睡眠中持续渗透，次日醒来容光焕发。",
                duration: "1分钟",
                productSlug: "face-cream",
              },
            ],
          },
          couple: {
            title: "双人SPA",
            titleEn: "COUPLE SPA",
            description: "与伴侣一起，享受护肤的亲密时光，在彼此的呵护中，感受爱与美的交融",
            steps: [
              {
                order: 1,
                name: "面对面护肤",
                nameEn: "FACE TO FACE",
                description: "相对而坐，为彼此涂抹护肤品。用指尖传递温柔，在每一次触碰中加深情感连接。",
                duration: "",
                productSlug: null,
              },
              {
                order: 2,
                name: "互相按摩",
                nameEn: "MASSAGE",
                description: "轮流为对方进行面部按摩，配合舒缓的音乐与香氛，创造属于你们的私密SPA时光。",
                duration: "",
                productSlug: null,
              },
              {
                order: 3,
                name: "仪式感布置",
                nameEn: "AMBIANCE",
                description: "点上香薰蜡烛，播放轻柔音乐，准备好柔软的毛巾和温热的花茶，让护肤成为一场浪漫约会。",
                duration: "",
                productSlug: null,
              },
            ],
          },
        },
      },
      seo: {
        title: "护肤仪式 | NIHPLOD 旎柏",
        description: "每一次护肤，都是与自己对话的珍贵时光。探索 NIHPLOD 旎柏专属晨间与晚间护肤仪式。",
      },
      published: true,
    },
    {
      title: "联系我们",
      slug: "contact",
      content: {
        hero: {
          title: "联系我们",
          subtitle: "Contact Us",
        },
        sections: [],
      },
      seo: {
        title: "联系我们 | NIHPLOD 旎柏",
        description: "联系 NIHPLOD 团队",
      },
      published: true,
    },
    {
      title: "加入我们",
      slug: "careers",
      content: {
        hero: {
          title: "加入我们",
          subtitle: "Join Us",
        },
        sections: [],
      },
      seo: {
        title: "加入我们 | NIHPLOD 旎柏",
        description: "加入 NIHPLOD 团队",
      },
      published: true,
    },
    {
      title: "隐私政策",
      slug: "privacy",
      content: {
        title: { en: "PRIVACY POLICY", zh: "隐私政策" },
        description: "我们重视并尊重您的隐私",
        lastUpdated: "2024年12月1日",
        tabs: {
          collect: {
            title: "信息收集",
            content: [
              "一、您主动提供的个人信息\n\n当您使用我们的服务时，我们可能会收集您主动提供的以下信息：\n\n• 身份信息：包括您的姓名、性别、出生日期等基本身份信息\n• 联系信息：包括您的电子邮箱地址、电话号码、收货地址等\n• 账户信息：包括您设置的用户名、密码（加密存储）、头像等\n• 护肤相关信息：包括您的肤质类型、肌肤问题、过敏史、护肤习惯等您在咨询过程中自愿提供的信息\n• 交易信息：包括您的订单详情、支付记录、物流信息等与购买相关的信息\n• 反馈信息：包括您提交的产品评价、投诉建议、问卷调查回复等",
              "二、我们自动收集的信息\n\n当您访问我们的网站或使用我们的服务时，我们会自动收集以下技术信息：\n\n• 设备信息：包括设备型号、操作系统及版本、设备设置、唯一设备标识符、设备环境等软硬件特征信息\n• 网络信息：包括 IP 地址、网络类型、运营商信息、网络环境等\n• 日志信息：包括访问时间、访问时长、浏览记录、搜索记录、点击记录、错误日志等\n• 位置信息：基于 IP 地址推断的大致地理位置（城市级别）",
              "三、Cookies 和类似技术\n\n我们使用 Cookies 和类似的跟踪技术来收集和存储您的相关信息。这些技术帮助我们：\n\n• 记住您的登录状态和偏好设置\n• 分析网站流量和使用情况\n• 提供个性化的内容和推荐\n• 防范欺诈和保障账户安全\n\n您可以通过浏览器设置管理或删除 Cookies，但这可能会影响您使用我们服务的部分功能。",
            ],
          },
          use: {
            title: "信息使用",
            content: [
              "一、提供产品和服务\n\n我们使用您的个人信息来：\n\n• 处理和完成您的订单，包括发货、支付处理和售后服务\n• 提供客户支持，响应您的咨询、投诉和建议\n• 根据您的肤质和需求提供个性化的护肤建议和产品推荐\n• 验证您的身份，保障您的账户和交易安全\n• 履行我们与您之间的合同义务",
              "二、改进和优化服务\n\n我们会将收集的信息用于：\n\n• 分析用户行为和偏好，了解产品和服务的使用情况\n• 开展内部审计、数据分析和研究，改进我们的产品和服务\n• 测试和开发新的产品功能\n• 优化网站性能和用户体验\n• 进行市场调研和数据统计分析",
              "三、营销和推广\n\n在获得您明确同意的情况下，我们可能会：\n\n• 向您发送产品资讯、促销活动、新品上市等营销信息\n• 向您推送个性化的广告和推荐内容\n• 邀请您参与调查问卷、用户访谈等市场研究活动\n\n您可以随时选择退订营销信息，这不会影响您使用我们的基本服务。",
              "四、法律合规\n\n我们可能会在以下情况下使用您的信息：\n\n• 遵守适用的法律法规、法规要求或政府命令\n• 执行我们的服务条款和其他协议\n• 保护我们、用户或公众的权利、财产或安全\n• 检测、预防或解决欺诈、安全或技术问题",
            ],
          },
          protect: {
            title: "信息保护",
            content: [
              "一、技术安全措施\n\n我们采用业界标准的安全技术来保护您的个人信息：\n\n• 数据传输加密：所有数据传输均采用 SSL/TLS 加密协议，确保传输过程中的数据安全\n• 数据存储加密：敏感个人信息在存储时采用加密处理\n• 访问控制：实施严格的访问权限管理，仅授权人员可访问个人信息\n• 安全审计：定期进行安全审计、渗透测试和漏洞扫描\n• 入侵检测：部署入侵检测和防护系统，实时监控异常行为\n• 数据备份：定期进行数据备份，确保数据的可恢复性",
              "二、组织管理措施\n\n我们建立了完善的数据保护管理体系：\n\n• 设立专门的数据保护负责人，负责监督个人信息保护工作\n• 对员工进行数据保护培训，签署保密协议\n• 建立数据分类分级制度，对不同敏感程度的数据采取不同的保护措施\n• 与第三方服务提供商签订数据保护协议，确保其遵守同等的保护标准\n• 制定数据泄露应急响应预案，确保及时有效地应对安全事件",
              "三、数据保留\n\n我们仅在实现本政策所述目的所必需的期限内保留您的个人信息：\n\n• 账户信息：在您的账户有效期内保留，账户注销后将在合理期限内删除\n• 交易记录：根据适用的财务和税务法规要求保留相应期限\n• 日志信息：通常保留不超过 12 个月\n\n超出保留期限后，我们将删除或匿名化处理您的个人信息。",
              "四、第三方共享\n\n我们承诺不会出售您的个人信息。在以下情况下，我们可能会与第三方共享您的信息：\n\n• 服务提供商：与帮助我们提供服务的合作伙伴共享（如物流公司、支付服务商）\n• 法律要求：根据法律法规要求或政府机关的强制性要求\n• 业务转让：在公司合并、收购或资产转让时，您的信息可能作为交易资产的一部分被转让\n\n我们会要求所有第三方遵守适用的数据保护法规，并采取适当的安全措施。",
            ],
          },
          rights: {
            title: "您的权利",
            content: [
              "根据《中华人民共和国个人信息保护法》及其他适用的数据保护法律，您对您的个人信息享有以下权利：",
              "一、知情权和决定权\n\n您有权了解我们如何收集、使用、共享和保护您的个人信息。您有权决定是否同意我们处理您的个人信息，并可随时撤回您的同意。撤回同意不影响撤回前基于您同意所进行的处理活动的合法性。",
              "二、查阅和复制权\n\n您有权查阅我们持有的关于您的个人信息，并有权获取该信息的副本。我们将在验证您的身份后，在合理期限内响应您的请求。对于超出合理范围的请求，我们可能会收取合理的费用。",
              "三、更正和补充权\n\n当您发现我们持有的个人信息不准确或不完整时，您有权要求我们进行更正或补充。我们将在核实后及时更新相关信息。",
              "四、删除权\n\n在以下情况下，您有权要求我们删除您的个人信息：\n\n• 处理目的已实现、无法实现或者为实现处理目的不再必要\n• 我们停止提供产品或者服务，或者保存期限已届满\n• 您撤回同意，且我们无其他合法处理依据\n• 我们违反法律法规或与您的约定处理个人信息\n\n法律法规规定的保存期限未届满，或删除技术上难以实现的，我们将停止除存储和采取必要安全保护措施之外的处理。",
              "五、限制或拒绝处理权\n\n在特定情况下，您有权要求我们限制对您个人信息的处理，或拒绝我们对您个人信息的处理，包括拒绝接收营销信息。",
              "六、数据可携带权\n\n您有权以结构化、通用的机器可读格式获取您的个人信息副本，并在技术可行的情况下，要求我们将您的个人信息直接传输给其他数据控制者。",
              "七、行使权利的方式\n\n如您需要行使上述权利，可通过本网站的「联系我们」页面提交请求。我们将在验证您的身份后，在 15 个工作日内响应您的请求。对于复杂或多次请求，我们可能需要延长响应时间，届时我们会告知您。",
            ],
          },
        },
      },
      seo: {
        title: "隐私政策 | NIHPLOD 旎柏",
        description: "了解 NIHPLOD 旎柏如何收集、使用和保护您的个人信息。",
      },
      published: true,
    },
    {
      title: "服务入口",
      slug: "services",
      content: {
        pageTitle: { en: "SERVICES", zh: "服务入口" },
        services: [
          {
            id: "vip",
            label: "会员系统",
            title: "旎柏会员系统",
            nameEn: "VIP System",
            description: "会员积分、权益管理与专属服务平台，为尊贵会员提供积分查询、等级权益、专属优惠等服务。",
            links: [
              { label: "用户端", url: "https://vip.nihplod.cn", isAdmin: false, description: "会员登录、积分查询、权益兑换" },
              { label: "管理端", url: "https://adminvip.nihplod.cn", isAdmin: true, description: "仅授权人员使用" },
            ],
          },
          {
            id: "website",
            label: "官方网站",
            title: "官方网站",
            nameEn: "Official Website",
            description: "NIHPLOD 旎柏品牌官方网站，展示品牌故事、产品系列、护肤仪式等内容。",
            links: [
              { label: "用户端", url: "https://nihplod.cn", isAdmin: false, description: "品牌展示、产品浏览、AI护肤顾问" },
              { label: "管理端", url: "https://nihplod.cn/admin", isAdmin: true, description: "仅授权人员使用" },
            ],
          },
          {
            id: "influencer",
            label: "达人平台",
            title: "达人合作平台",
            nameEn: "Influencer Platform",
            description: "KOL/KOC合作平台，提供达人招募、内容共创、合作管理等功能。",
            links: [
              { label: "用户端", url: "https://influencer.nihplod.cn", isAdmin: false, description: "达人注册、合作申请、任务领取" },
              { label: "管理端", url: "https://influencer.nihplod.cn/admin", isAdmin: true, description: "仅授权人员使用" },
            ],
          },
        ],
      },
      seo: {
        title: "服务入口 | NIHPLOD 旎柏",
        description: "NIHPLOD 旎柏各系统服务入口",
      },
      published: true,
    },
  ];
  for (const page of pages) {
    await prisma.page.upsert({
      where: { slug: page.slug },
      update: page,
      create: page,
    });
  }
  console.log("✅ 默认页面已创建 (7 个页面)");

  console.log("\n🎉 种子数据初始化完成！");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("管理员登录: admin@nihplod.cn / admin123456");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

main()
  .catch((e) => {
    console.error("❌ 种子数据初始化失败:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


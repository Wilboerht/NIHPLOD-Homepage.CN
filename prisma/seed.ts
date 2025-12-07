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
  console.log("✅ 产品分类已创建 (9 个分类)");

  // 3. 创建 AI 问题
  const questions = [
    {
      fieldName: "skinType",
      question: "你的肌肤类型是？",
      order: 1,
      options: [
        { value: "dry", label: "干性肌肤", labelEn: "Dry" },
        { value: "oily", label: "油性肌肤", labelEn: "Oily" },
        { value: "combination", label: "混合性肌肤", labelEn: "Combination" },
        { value: "sensitive", label: "敏感性肌肤", labelEn: "Sensitive" },
        { value: "unknown", label: "不太确定", labelEn: "Not Sure" },
      ],
    },
    {
      fieldName: "concern",
      question: "你最关注的肌肤问题是？",
      order: 2,
      options: [
        { value: "aging", label: "细纹抗老", labelEn: "Anti-aging" },
        { value: "dull", label: "暗沉提亮", labelEn: "Brightening" },
        { value: "hydration", label: "补水保湿", labelEn: "Hydration" },
        { value: "pores", label: "毛孔粗大", labelEn: "Pores" },
        { value: "sensitive", label: "敏感泛红", labelEn: "Sensitivity" },
      ],
    },
    {
      fieldName: "sleep",
      question: "你平均每天的睡眠时间是？",
      order: 3,
      options: [
        { value: "less6", label: "少于6小时", labelEn: "Less than 6 hours" },
        { value: "6to7", label: "6-7小时", labelEn: "6-7 hours" },
        { value: "7to8", label: "7-8小时", labelEn: "7-8 hours" },
        { value: "more8", label: "8小时以上", labelEn: "More than 8 hours" },
      ],
    },
    {
      fieldName: "environment",
      question: "你的日常工作环境是？",
      order: 4,
      options: [
        { value: "computer", label: "长时间面对电脑", labelEn: "Computer work" },
        { value: "outdoor", label: "经常户外活动", labelEn: "Outdoor activities" },
        { value: "aircon", label: "空调环境为主", labelEn: "Air-conditioned" },
        { value: "mixed", label: "混合环境", labelEn: "Mixed" },
      ],
    },
    {
      fieldName: "routine",
      question: "你目前的护肤步骤有几步？",
      order: 5,
      options: [
        { value: "1to2", label: "1-2步（简单洁面+保湿）", labelEn: "1-2 steps" },
        { value: "3to4", label: "3-4步（含精华或防晒）", labelEn: "3-4 steps" },
        { value: "5plus", label: "5步以上（完整护肤流程）", labelEn: "5+ steps" },
        { value: "irregular", label: "不固定", labelEn: "Irregular" },
      ],
    },
    {
      fieldName: "preference",
      question: "你期待的护肤体验是？",
      order: 6,
      options: [
        { value: "simple", label: "简单高效", labelEn: "Simple & Effective" },
        { value: "ritual", label: "享受护肤仪式感", labelEn: "Ritual Experience" },
        { value: "couple", label: "与伴侣一起护肤", labelEn: "Couple Skincare" },
      ],
    },
  ];
  for (const q of questions) {
    await prisma.advisorQuestion.upsert({
      where: { fieldName: q.fieldName },
      update: q,
      create: q,
    });
  }
  console.log("✅ AI 问题已创建 (6 个问题)");

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
      categoryId: categoryMap["body-care"],
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
      title: "品牌故事",
      slug: "story",
      content: {
        hero: {
          title: "品牌故事",
          subtitle: "Brand Story",
        },
        sections: [],
      },
      seo: {
        title: "品牌故事 | NIHPLOD 旎柏",
        description: "探索 NIHPLOD 的品牌故事",
      },
      published: true,
    },
    {
      title: "护肤仪式",
      slug: "ritual",
      content: {
        hero: {
          title: "护肤仪式",
          subtitle: "Skincare Ritual",
        },
        sections: [],
      },
      seo: {
        title: "护肤仪式 | NIHPLOD 旎柏",
        description: "体验 NIHPLOD 的护肤仪式",
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
        title: "隐私政策",
        content: "隐私政策内容待更新...",
      },
      seo: {
        title: "隐私政策 | NIHPLOD 旎柏",
        description: "NIHPLOD 隐私政策",
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
  console.log("✅ 默认页面已创建 (6 个页面)");

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


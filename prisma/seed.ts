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
    { name: "面霜", nameEn: "Cream", slug: "cream", order: 1 },
    { name: "精华", nameEn: "Serum", slug: "serum", order: 2 },
    { name: "面膜", nameEn: "Mask", slug: "mask", order: 3 },
    { name: "套装", nameEn: "Set", slug: "set", order: 4 },
  ];
  for (const cat of categories) {
    await prisma.category.upsert({
      where: { slug: cat.slug },
      update: cat,
      create: cat,
    });
  }
  console.log("✅ 产品分类已创建 (4 个分类)");

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

  // 5. 创建默认页面
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


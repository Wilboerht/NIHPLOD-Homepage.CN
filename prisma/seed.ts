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

  const hankPassword = await bcrypt.hash("whk35168", 12);
  await prisma.admin.upsert({
    where: { email: "hank.wang@nihplod.cn" },
    update: {},
    create: {
      email: "hank.wang@nihplod.cn",
      password: hankPassword,
      name: "Hank Wang",
    },
  });
  console.log("✅ 管理员账号已创建 (hank.wang@nihplod.cn / whk35168)");

  const kikiPassword = await bcrypt.hash("MOIDAS2026kiki", 12);
  await prisma.admin.upsert({
    where: { email: "kiki.wang@nihplod.cn" },
    update: {},
    create: {
      email: "kiki.wang@nihplod.cn",
      password: kikiPassword,
      name: "Kiki Wang",
    },
  });
  console.log("✅ 管理员账号已创建 (kiki.wang@nihplod.cn / MOIDAS2026kiki)");

  const walterPassword = await bcrypt.hash("walter", 12);
  await prisma.admin.upsert({
    where: { email: "walter@nihplod.cn" },
    update: {},
    create: {
      email: "walter@nihplod.cn",
      password: walterPassword,
      name: "Walter",
    },
  });
  console.log("✅ 管理员账号已创建 (walter@nihplod.cn / walter)");

  // 2. 创建产品分类（包含 SVG 图标）
  const categories = [
    {
      name: "洁面",
      nameEn: "Cleanser",
      slug: "cleanser",
      icon: `<svg viewBox="0 0 24 24" fill="none"><path d="M9.4 3C9.4 3 9.5 2.5 12 2.5C14.5 2.5 14.6 3 14.6 3L14.75 8.5C15 8.5 15 8.83333 15 9V10.5C15.25 10.5102 15.25 10.8333 15.25 11V20.5C15.25 21.0523 14.8033 21.5 14.251 21.5H12H9.74902C9.19674 21.5 8.75 21.0527 8.75 20.5004V11C8.75 10.6 8.83333 10.5 9 10.5V9C9 8.6 9.08333 8.5 9.25 8.5L9.4 3Z" fill="currentColor" stroke="currentColor" stroke-width="0.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M10.2067 8.49844C10.2067 8.49844 10.655 8.39844 12 8.39844C13.345 8.39844 13.7933 8.49844 13.7933 8.49844" stroke="currentColor" stroke-width="0.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.87634 10.55C9.87634 10.55 10.4073 10.5 12 10.5C13.5927 10.5 14.1237 10.55 14.1237 10.55" stroke="currentColor" stroke-width="0.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
      order: 1,
    },
    {
      name: "磨砂膏",
      nameEn: "Scrub",
      slug: "scrub",
      icon: `<svg viewBox="0 0 24 24" fill="none"><path d="M4.00167 7.02038C5.37524 6.86902 7.84265 6.69922 12 6.69922C16.1155 6.69922 18.5749 6.84977 19.9565 6.98565C20.8698 7.07548 21.5 7.84304 21.5 8.76077V15.6992C21.5 16.5276 20.8284 17.1992 20 17.1992H4C3.17157 17.1992 2.5 16.5276 2.5 15.6992V8.77417C2.5 7.87475 3.10766 7.1189 4.00167 7.02038Z" fill="currentColor" stroke="currentColor" stroke-width="0.8"/><path d="M4 10.9492C4 10.9492 7.27778 10.6992 12 10.6992C16.7222 10.6992 20 10.9492 20 10.9492" stroke="currentColor" stroke-width="0.6" stroke-linecap="round"/></svg>`,
      order: 2,
    },
    {
      name: "面膜",
      nameEn: "Mask",
      slug: "mask",
      icon: `<svg viewBox="0 0 24 24" fill="none"><path d="M5.5 3.5C5.5 2.94772 5.94772 2.5 6.5 2.5H17.5C18.0523 2.5 18.5 2.94772 18.5 3.5V4.66196C18.5 4.86063 18.3648 5.0338 18.172 5.08199C17.9971 5.12571 17.9971 5.37429 18.172 5.41801C18.3648 5.4662 18.5 5.63937 18.5 5.83804V20.5C18.5 21.0523 18.0523 21.5 17.5 21.5H6.5C5.94772 21.5 5.5 21.0523 5.5 20.5V5.79666C5.5 5.6195 5.61336 5.46221 5.78144 5.40619C5.93153 5.35616 5.93153 5.14385 5.78144 5.09381C5.61336 5.03779 5.5 4.8805 5.5 4.70334V3.5Z" fill="currentColor" stroke="currentColor" stroke-width="0.8"/><path d="M7 4.4C7 4.17909 7.17909 4 7.4 4H16.6C16.8209 4 17 4.17909 17 4.4V19.1C17 19.3209 16.8209 19.5 16.6 19.5H7.4C7.17909 19.5 7 19.3209 7 19.1V4.4Z" fill="currentColor" stroke="currentColor" stroke-width="0.6" stroke-linejoin="round"/></svg>`,
      order: 3,
    },
    {
      name: "精华",
      nameEn: "Serum",
      slug: "serum",
      icon: `<svg viewBox="0 0 24 24" fill="none"><path d="M9.84189 8.38604L10.8768 8.04105C10.9584 8.01386 11.0438 8 11.1298 8H12.8702C12.9562 8 13.0416 8.01386 13.1232 8.04105L14.1581 8.38604C14.3623 8.4541 14.5 8.64516 14.5 8.86038V21.2C14.5 21.6418 14.1418 22 13.7 22H10.3C9.85817 22 9.5 21.6418 9.5 21.2V8.86038C9.5 8.64516 9.63772 8.4541 9.84189 8.38604Z" fill="currentColor" stroke="currentColor" stroke-width="0.8" stroke-linecap="round"/><path d="M10.25 2.27892C10.25 2.0789 10.3703 1.90047 10.5645 1.85252C10.8494 1.78218 11.3279 1.69922 12 1.69922C12.6721 1.69922 13.1506 1.78218 13.4355 1.85252C13.6297 1.90047 13.75 2.0789 13.75 2.27892V7.44922C13.75 7.72536 13.5263 7.94922 13.2501 7.94922C12.8821 7.94922 12.3814 7.94922 12 7.94922C11.6186 7.94922 11.1179 7.94922 10.7499 7.94922C10.4737 7.94922 10.25 7.72536 10.25 7.44922V2.27892Z" fill="currentColor" stroke="currentColor" stroke-width="0.7"/><path d="M10.5 9H13.5" stroke="currentColor" stroke-width="0.6" stroke-linecap="round"/></svg>`,
      order: 4,
    },
    {
      name: "面霜",
      nameEn: "Cream",
      slug: "cream",
      icon: `<svg viewBox="0 0 24 24" fill="none"><path d="M4.71235 5.27496C5.84896 5.14222 8.00007 5 12 5C15.9999 5 18.151 5.14222 19.2876 5.27496C20.0401 5.36283 20.5 5.97852 20.5 6.73607V18C20.5 18.8284 19.8284 19.5 19 19.5H5C4.17157 19.5 3.5 18.8284 3.5 18V6.73607C3.5 5.97852 3.95992 5.36283 4.71235 5.27496Z" fill="currentColor" stroke="currentColor" stroke-width="0.8"/><path d="M5 10.25C5 10.25 6.86667 10 12 10C17.1333 10 19 10.25 19 10.25" stroke="currentColor" stroke-width="0.6" stroke-linecap="round"/></svg>`,
      order: 5,
    },
    {
      name: "防晒",
      nameEn: "Sunscreen",
      slug: "sunscreen",
      icon: `<svg viewBox="0 0 24 24" fill="none"><rect x="4.3999" y="2.10156" width="15.06" height="19.92" rx="7.2" fill="currentColor"/><path d="M6 9.5C6 9.5 7.6 9 12 9C16.4 9 18 9.5 18 9.5" stroke="currentColor" stroke-width="0.6" stroke-linecap="round"/><path d="M11.875 2C6.5 2 5.29578 5.31688 4.875 7C4.45422 8.68312 4.44498 15.2799 4.875 17C5.30502 18.7201 6.5 22 11.875 22" stroke="currentColor" stroke-width="0.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 2C17.375 2 18.5792 5.31688 19 7C19.4208 8.68312 19.43 15.2799 19 17C18.57 18.7201 17.375 22 12 22" stroke="currentColor" stroke-width="0.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
      order: 6,
    },
    {
      name: "护手霜",
      nameEn: "Hand Cream",
      slug: "hand-cream",
      icon: `<svg viewBox="0 0 24 24" fill="none"><path d="M14.7 3.5H9.7C9.58954 3.5 9.5 3.58954 9.5 3.7V4.4L9.95 4.85C10.3754 5.27537 10.3987 17.3615 10.3999 18.6831C10.4 18.7588 10.4428 18.8214 10.5106 18.8553L11.1894 19.1947C11.2572 19.2286 11.3 19.2979 11.3 19.3736V19.95C11.3 20.0605 11.2105 20.15 11.1 20.15H11.05C10.9395 20.15 10.85 20.2395 10.85 20.35V20.85C10.85 20.9605 10.9395 21.05 11.05 21.05H13.35C13.4605 21.05 13.55 20.9605 13.55 20.85V20.35C13.55 20.2395 13.4605 20.15 13.35 20.15H13.3C13.1895 20.15 13.1 20.0605 13.1 19.95V19.3736C13.1 19.2979 13.1428 19.2286 13.2106 19.1947L13.8894 18.8553C13.9572 18.8214 14 18.7588 14.0001 18.6831C14.0013 17.3615 14.0246 5.27537 14.45 4.85L14.7331 4.56694C14.8205 4.47955 14.9 4.2875 14.9 4.16391V3.7C14.9 3.58954 14.8105 3.5 14.7 3.5Z" fill="currentColor" stroke="currentColor" stroke-width="0.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M10.5708 4.5H13.8294" stroke="currentColor" stroke-width="0.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M11.269 18.5469L13.1311 18.5469" stroke="currentColor" stroke-width="0.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M11.9673 20.1406L12.4328 20.1406" stroke="currentColor" stroke-width="0.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
      order: 7,
    },
    {
      name: "身体护理",
      nameEn: "Body Care",
      slug: "body-care",
      icon: `<svg viewBox="0 0 24 24" fill="none"><path d="M9 1.91421C9 1.649 9.11699 1.40264 9.36653 1.31278C9.76074 1.17083 10.5387 1 12 1C13.4613 1 14.2393 1.17083 14.6335 1.31278C14.883 1.40264 15 1.649 15 1.91421V22C15 22.5523 14.5523 23 14 23H10C9.44772 23 9 22.5523 9 22V1.91421Z" fill="currentColor" stroke="currentColor" stroke-width="0.8" stroke-linejoin="round"/><path d="M10 4.9C10 4.9 10.5 4.75 12 4.75C13.5 4.75 14 4.9 14 4.9" stroke="currentColor" stroke-width="0.6" stroke-linecap="round"/><circle cx="12" cy="2.5" r="0.5" fill="currentColor" stroke="currentColor" stroke-width="0.5"/></svg>`,
      order: 7,
    },
    {
      name: "护理油",
      nameEn: "Treatment",
      slug: "treatment",
      icon: `<svg viewBox="0 0 24 24" fill="none"><path d="M7.97144 11.9934C7.97144 11.782 8.04988 11.5782 8.23354 11.4734C8.65975 11.2302 9.69906 10.8438 12 10.8438C14.3009 10.8438 15.3402 11.2302 15.7664 11.4734C15.9501 11.5782 16.0285 11.782 16.0285 11.9934V20.3331C16.0285 20.8399 15.6176 21.2508 15.1108 21.2508H8.88917C8.38232 21.2508 7.97144 20.8399 7.97144 20.3331V11.9934Z" fill="currentColor" stroke="currentColor" stroke-width="0.7998" stroke-linejoin="round"/><path d="M11.2842 4.34803C11.2842 4.34803 11.4989 4.29297 12 4.29297C12.5011 4.29297 12.7158 4.34803 12.7158 4.34803" stroke="currentColor" stroke-width="0.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.14062 12.139C9.14062 12.139 9.99843 12.084 12 12.084C14.0015 12.084 14.8593 12.139 14.8593 12.139" stroke="currentColor" stroke-width="0.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M10.5963 3.09543C10.8518 2.96797 11.4246 2.77734 11.9973 2.77734L12 10.8167H9.76721V10.0182L9.84981 9.85305C9.84787 8.27661 9.8452 5.26204 9.84891 4.63549C9.84929 4.57273 9.87044 4.51166 9.91704 4.46962C10.0556 4.3446 10.2531 4.26463 10.483 4.23654V3.29505C10.483 3.21142 10.5215 3.13277 10.5963 3.09543Z" fill="currentColor" stroke="currentColor" stroke-width="0.7998" stroke-linecap="round" stroke-linejoin="round"/><path d="M13.4037 3.09543C13.1482 2.96797 12.5754 2.77734 12.0027 2.77734L12 10.8167H14.2328V10.0182L14.1502 9.85305C14.1521 8.27661 14.1548 5.26204 14.1511 4.63549C14.1507 4.57273 14.1296 4.51166 14.083 4.46962C13.9444 4.3446 13.7469 4.26463 13.517 4.23654V3.29505C13.517 3.21142 13.4785 3.13277 13.4037 3.09543Z" fill="currentColor" stroke="currentColor" stroke-width="0.7998" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
      order: 8,
    },
    {
      name: "礼盒套装",
      nameEn: "Gift Box",
      slug: "gift-box",
      icon: `<svg viewBox="0 0 24 24" fill="none"><path d="M19.3931 20.6893V10.252H4.60693V20.6893H19.3931Z" fill="currentColor" stroke="currentColor" stroke-width="1.73955" stroke-linecap="round" stroke-linejoin="round"/><path d="M19.3931 20.6895H4.60693" stroke="currentColor" stroke-width="1.73955" stroke-linecap="round" stroke-linejoin="round"/><path d="M20.6978 6.77344H3.30225V10.2525H20.6978V6.77344Z" fill="currentColor" stroke="currentColor" stroke-width="1.73955" stroke-linejoin="round"/><path d="M11.737 6.13913C9.99054 5.95491 7.83731 4.17634 8.35979 3.2067C8.88227 2.23706 11.831 3.99026 11.737 6.13913Z" fill="currentColor" stroke="currentColor" stroke-width="0.62725" stroke-linecap="round"/><path d="M12.263 6.13913C14.0095 5.95491 16.1627 4.17634 15.6402 3.2067C15.1177 2.23706 12.169 3.99026 12.263 6.13913Z" fill="currentColor" stroke="currentColor" stroke-width="0.62725" stroke-linecap="round"/></svg>`,
      order: 9,
    },
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


  // 3. 创建默认设置
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
      name: "净透温和洁面慕斯",
      nameEn: "Foam Cleanser",
      slug: "foam-cleanser",
      description: "适合所有肤质的氨基酸洁面慕斯，能够温和去除污垢和化妆品残留，同时不会剥夺皮肤的天然油脂，提供强效抗氧化保护，对抗泛红和刺激，为后续护肤步骤打开通道。",
      price: 680,
      capacity: "100 ml",
      categoryId: categoryMap["cleanser"],
      ingredients: "椰油酰甘氨酸钾（氨基酸表活）、扁柏水、牡丹花水、泛醇、透明质酸钠。",
      usage: "取适量泡沫于湿润的面部，轻柔按摩后用温水洗净。",
      benefits: ["温和清洁", "保湿不紧绷", "深层洁净", "适合所有肤质"],
      order: 1,
      featured: true,
      published: true,
      stock: 100,
    },
    {
      name: "匀衡磨砂膏",
      nameEn: "Face Scrub",
      slug: "face-scrub",
      description: "一款可以为后续肌肤护理创造理想环境的深度清洁类产品。它可以有效排出堵塞毛孔的有害物质，恢复肌肤自然状态下的再生质感，并平衡肌肤的水油，改善肤质不均和表面脱皮，同时缩小毛孔。",
      price: 780,
      capacity: "50 ml",
      categoryId: categoryMap["scrub"],
      ingredients: "圆形胡桃壳粉微末、乳酸、壬二酸、葡萄柚籽提取物、迷迭香叶油",
      usage: "清洁皮肤可加少量水或不加水直接使用本品。 取适量大小的膏体于指尖，轻轻涂抹于面部。以打圈的方式轻柔按摩脸颊和额头后用清水彻底洗净。按摩眼周时请小心，避免接触眼睛。",
      benefits: ["去角质", "收缩毛孔", "提亮肤色", "平衡水油"],
      order: 2,
      featured: false,
      published: true,
      stock: 80,
    },
    {
      name: "臻奢赋活莱赛尔面膜",
      nameEn: "Face Mask",
      slug: "face-mask",
      description: "这款莱赛尔纤维面膜富含滋养和修护成分，能够深入肌肤，延缓初老迹象，强化肌肤天然屏障和免疫力，帮助肌肤更好地应对偶尔出现的失衡状态；尤其适合激光治疗后作为舒缓护理使用。",
      price: 1350,
      capacity: "30g × 4",
      categoryId: categoryMap["mask"],
      ingredients: "乙酰基六肽-8、α-熊果苷、烟酰胺、可溶性胶原、透明质酸钠",
      usage: "洁面后，取出面膜敷于面部，静享 10--15 分钟后取下，可适当按摩面部，将剩余精华液彻底吸收。",
      benefits: ["密集修护", "修复屏障", "深层保湿", "提亮焕肤"],
      order: 3,
      featured: true,
      published: true,
      stock: 200,
    },
    {
      name: "时光涅槃臻萃精华露",
      nameEn: "Serum",
      slug: "serum",
      description: "一款含多种珍贵成分及天然提取物的高品质精华。让真正的营养和修复因子进入皮肤，帮助皮肤保持紧致，恢复健康；可以有效延缓皮肤的自然衰老。让皮肤看起来更年轻、更紧致。",
      price: 4500,
      capacity: "30 ml",
      categoryId: categoryMap["serum"],
      ingredients: "羟丙基四氢吡喃三醇（玻色因）、富勒烯、棕榈酰三肽-5、双歧杆菌发酵溶胞物、α-熊果苷、曲克芦丁、烟酰胺",
      usage: "深层清洁皮肤后，在指尖涂抹精华液，轻轻涂抹在脸上。轻轻按摩你的脸颊、眼睛和脖子。按摩眼睛时请务必小心，避免与眼睛接触。请根据个人情况，使用后续产品前需确保精华液被完全吸收。",
      benefits: ["抗老紧致", "淡化细纹", "提升弹性", "修护肌底", "焕亮光采"],
      order: 4,
      featured: true,
      published: true,
      stock: 50,
    },
    {
      name: "恒采修护面霜",
      nameEn: "Face Cream",
      slug: "face-cream",
      description: "一款珍贵的面部霜，有助于让肌肤呈现出美丽、有弹性且光滑的质感。它有多种保湿和修复成分，能有效改善与皮肤长期不当维护导致的不良状况，以及术后红肿或变暗等问题。",
      price: 2800,
      capacity: "50 ml",
      categoryId: categoryMap["cream"],
      ingredients: "羟丙基四氢吡喃三醇（玻色因）、神经酰胺 NP、泛醇、红没药醇、燕麦仁油",
      usage: "深层清洁皮肤后，在指尖涂抹面霜，轻轻涂抹在脸上。轻轻按摩你的脸颊和眼睛。按摩眼睛时请务必小心，避免与眼睛接触。请根据个人情况，使用后续产品前需确保乳霜被完全吸收。",
      benefits: ["抗衰老", "深层滋养", "紧致提升", "保湿锁水", "修护屏障"],
      order: 5,
      featured: true,
      published: true,
      stock: 60,
    },
    {
      name: "抚纹紧致护手霜",
      nameEn: "Hand Cream",
      slug: "hand-cream",
      description: "一款将滋养与修护成分深入手部肌肤的奢华护手霜。不仅能即时滋润干燥、抚平细纹，更能持续强化手部屏障，改善松弛，促进恢复肌肤原有的弹性和质地。",
      price: 480,
      capacity: "25 ml",
      categoryId: categoryMap["hand-cream"],
      ingredients: "羟丙基四氢吡喃三醇（玻色因）、依克多因、乳酸杆菌、细小裸藻多糖、角鲨烷",
      usage: "取适量乳霜于手掌或手背上，然后均匀涂抹于整个手部。\n对于特别干燥或严重脱水的肌肤，建议使用较多的频率和用量，以达到更好的修复效果。",
      benefits: ["深层滋润", "淡化细纹", "柔嫩双手", "长效保湿"],
      order: 6,
      featured: false,
      published: true,
      stock: 150,
    },
    {
      name: "新生焕活身体乳",
      nameEn: "Body Lotion",
      slug: "body-lotion",
      description: "一款采用超过 20 种珍贵成分和提取物的身体乳。它能帮助你更好的增强皮肤的天然防御机制，有效滋养和保湿；并能改善皮肤密度和弹性，防止皮肤过早老化。",
      price: 1000,
      capacity: "250 ml",
      categoryId: categoryMap["body-care"],
      ingredients: "羟丙基四氢吡喃三醇（玻色因）、三叶鬼针草、光甘草定、烟酰胺、乳酸菌发酵产物、琉璃苣籽油，深海两节荠籽油，刺阿干树仁油",
      usage: "清洁全身后 ，取适量本产品涂抹于需要护理的部位，并以打圈的方式轻轻按摩至完全吸收。",
      benefits: ["全身滋养", "持久保湿", "柔滑细腻", "快速吸收"],
      order: 7,
      featured: false,
      published: true,
      stock: 120,
    },
    {
      name: "轻透长护防晒霜",
      nameEn: "Sunscreen",
      slug: "sunscreen",
      description: "一款日霜级轻薄防晒。SPF 30+ 及 PA +++ 结合物理及化学双重防护，能有效抵御紫外线和氧化作用，在皮肤上形成有效保护层。对于光损伤和外部污染物引起的炎症和不良皮肤反应能有效抑制，并有助于减少色素沉着。",
      price: 880,
      capacity: "40 ml",
      categoryId: categoryMap["sunscreen"],
      ingredients: "二裂酵母发酵产物溶胞产物、神经酰胺、生育酚、油橄榄果油、卵磷脂、燕麦仁油",
      usage: "在日晒前 1-5 分钟均匀涂抹于清洁并滋润的皮肤上。\n日常使用时，请待产品完全吸收后再进行后续上妆步骤。\n如需长时间户外活动，请适时补涂。",
      benefits: ["防晒隔离", "抗光老化", "抗炎修护", "轻薄不闷", "敏感肌适用"],
      order: 8,
      featured: true,
      published: true,
      stock: 90,
    },
    {
      name: "臻萃呵护美容油",
      nameEn: "Treatment Oil",
      slug: "treatment-oil",
      description: "一瓶融合多种天然植物精粹的护理油，提供深层滋养与感官愉悦，可单独使用或与其它护肤品叠加使用，打造个性化奢宠体验。",
      price: 1350,
      capacity: "30 ml",
      categoryId: categoryMap["treatment"],
      ingredients: "向日葵籽油 、 霍霍巴籽油 、 椰子油 、 月见草籽油 、 白花草籽油 、 生育酚 、​​柠檬籽油 、 杜松果油、药用生姜根油 、 肉豆蔻仁油",
      usage: "日常护肤：取数滴于掌心，温热后以向上打圈方式均匀涂抹于肌肤。亦可混合数滴至旎柏面霜、精华或身体乳中，增强滋养与修护效果。\n\n芳香泡浴：在放洗澡水时，取适量本品滴入水流中，可滋养全身肌肤并享受舒缓芳疗。",
      benefits: ["深层滋养", "修护屏障", "柔润光泽", "舒缓肌肤"],
      order: 9,
      featured: false,
      published: true,
      stock: 70,
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
      stock: 30,
    },
  ];

  // 先删除旧产品和图片
  await prisma.image.deleteMany({});
  await prisma.product.deleteMany({});
  console.log("🗑️ 已清理旧产品数据");

  // 产品图片映射 (使用已有资源作为占位)
  const productImages: Record<string, string> = {
    "foam-cleanser": "/images/ritual-step-cleanse.webp",
    "face-scrub": "/images/ritual-step-deep-cleanse.webp",
    "face-mask": "/images/ritual-step-seal.webp",
    "serum": "/images/ritual-step-penetrate.webp",
    "face-cream": "/images/ritual-step-revitalize.webp",
    "hand-cream": "/images/ritual-step-nourish.webp",
    "body-lotion": "/images/ritual-step-nourish.webp",
    "sunscreen": "/images/ritual-step-protect.webp",
    "treatment-oil": "/images/ritual-step-oil-nourish.webp",
    "gift-box": "/images/portable-travel-hero.webp",
  };

  for (const product of products) {
    await prisma.product.create({
      data: {
        ...product,
        images: {
          create: {
            url: productImages[product.slug] || "/images/logo.webp",
            alt: product.name,
            order: 0,
          },
        },
      },
    });
  }
  console.log("✅ NIHPLOD 产品已创建 (10 款产品)");

  // 5.1 获取产品ID映射（用于后续关联）
  const allProducts = await prisma.product.findMany({ select: { id: true, slug: true } });
  const productMap: Record<string, string> = {};
  for (const p of allProducts) {
    productMap[p.slug] = p.id;
  }

  // 5.2 创建购买链接
  const purchaseLinks = [
    { productSlug: "foam-cleanser", platform: "天猫国际", url: "https://nihplod.tmall.hk", order: 1 },
    { productSlug: "foam-cleanser", platform: "小红书", url: "https://xiaohongshu.com/nihplod", order: 2 },
    { productSlug: "foam-cleanser", platform: "抖音", url: "https://v.douyin.com/nihplod", order: 3 },
    { productSlug: "serum", platform: "天猫国际", url: "https://nihplod.tmall.hk", order: 1 },
    { productSlug: "serum", platform: "小红书", url: "https://xiaohongshu.com/nihplod", order: 2 },
    { productSlug: "serum", platform: "抖音", url: "https://v.douyin.com/nihplod", order: 3 },
    { productSlug: "face-cream", platform: "天猫国际", url: "https://nihplod.tmall.hk", order: 1 },
    { productSlug: "face-cream", platform: "小红书", url: "https://xiaohongshu.com/nihplod", order: 2 },
    { productSlug: "face-cream", platform: "抖音", url: "https://v.douyin.com/nihplod", order: 3 },
    { productSlug: "face-mask", platform: "天猫国际", url: "https://nihplod.tmall.hk", order: 1 },
    { productSlug: "face-mask", platform: "小红书", url: "https://xiaohongshu.com/nihplod", order: 2 },
    { productSlug: "face-mask", platform: "抖音", url: "https://v.douyin.com/nihplod", order: 3 },
    { productSlug: "body-lotion", platform: "天猫国际", url: "https://nihplod.tmall.hk", order: 1 },
    { productSlug: "body-lotion", platform: "小红书", url: "https://xiaohongshu.com/nihplod", order: 2 },
    { productSlug: "body-lotion", platform: "抖音", url: "https://v.douyin.com/nihplod", order: 3 },
    { productSlug: "sunscreen", platform: "天猫国际", url: "https://nihplod.tmall.hk", order: 1 },
    { productSlug: "sunscreen", platform: "小红书", url: "https://xiaohongshu.com/nihplod", order: 2 },
    { productSlug: "sunscreen", platform: "抖音", url: "https://v.douyin.com/nihplod", order: 3 },
    { productSlug: "face-scrub", platform: "天猫国际", url: "https://nihplod.tmall.hk", order: 1 },
    { productSlug: "face-scrub", platform: "小红书", url: "https://xiaohongshu.com/nihplod", order: 2 },
    { productSlug: "face-scrub", platform: "抖音", url: "https://v.douyin.com/nihplod", order: 3 },
    { productSlug: "hand-cream", platform: "天猫国际", url: "https://nihplod.tmall.hk", order: 1 },
    { productSlug: "hand-cream", platform: "小红书", url: "https://xiaohongshu.com/nihplod", order: 2 },
    { productSlug: "hand-cream", platform: "抖音", url: "https://v.douyin.com/nihplod", order: 3 },
    { productSlug: "treatment-oil", platform: "天猫国际", url: "https://nihplod.tmall.hk", order: 1 },
    { productSlug: "treatment-oil", platform: "小红书", url: "https://xiaohongshu.com/nihplod", order: 2 },
    { productSlug: "treatment-oil", platform: "抖音", url: "https://v.douyin.com/nihplod", order: 3 },
    { productSlug: "gift-box", platform: "官方商城", url: "https://nihplod.cn/products/gift-box", order: 1 },
  ];
  await prisma.purchaseLink.deleteMany({});
  for (const link of purchaseLinks) {
    if (productMap[link.productSlug]) {
      await prisma.purchaseLink.create({
        data: {
          productId: productMap[link.productSlug],
          platform: link.platform,
          url: link.url,
          order: link.order,
        },
      });
    }
  }
  console.log("✅ 购买链接已创建");

  // 6. 创建职位
  await prisma.job.deleteMany({});
  const jobs = [
    {
      title: "护肤顾问",
      titleEn: "Skincare Consultant",
      location: "上海",
      type: "fulltime",
      description: "1. 为客户提供专业的护肤咨询服务\n2. 了解客户肌肤状况，推荐适合的产品\n3. 维护客户关系，提供售后跟进服务\n4. 参与品牌活动和培训",
      requirements: "1. 大专及以上学历，护肤/美容相关专业优先\n2. 1年以上护肤品销售或咨询经验\n3. 热爱美妆护肤行业，形象气质佳\n4. 具备良好的沟通能力和服务意识",
      salary: "8K-15K",
      order: 1,
      published: true,
    },
    {
      title: "市场营销专员",
      titleEn: "Marketing Specialist",
      location: "上海",
      type: "fulltime",
      description: "1. 负责品牌社交媒体运营（小红书、微博、抖音等）\n2. 策划并执行线上线下营销活动\n3. 与KOL/KOC合作，推广品牌产品\n4. 分析市场数据，优化营销策略",
      requirements: "1. 本科及以上学历，市场营销相关专业\n2. 2年以上美妆/护肤品牌营销经验\n3. 熟悉社交媒体运营，有成功案例优先\n4. 具备数据分析能力和创意思维",
      salary: "12K-20K",
      order: 2,
      published: true,
    },
    {
      title: "前端开发工程师",
      titleEn: "Frontend Developer",
      location: "上海 / 远程",
      type: "fulltime",
      description: "1. 负责官网及电商平台前端开发\n2. 使用 React/Next.js 构建用户界面\n3. 优化网站性能和用户体验\n4. 与设计师和后端工程师协作",
      requirements: "1. 本科及以上学历，计算机相关专业\n2. 3年以上前端开发经验\n3. 精通 React、TypeScript、Tailwind CSS\n4. 有电商项目经验优先",
      salary: "20K-35K",
      order: 3,
      published: true,
    },
  ];
  for (const job of jobs) {
    await prisma.job.create({ data: job });
  }
  console.log("✅ 职位已创建 (3 个职位)");

  // 7. 创建申请分类夹
  await prisma.applicationFolder.deleteMany({});
  const folders = [
    { name: "待筛选", description: "新收到的简历，等待初筛", order: 1 },
    { name: "初筛通过", description: "通过初筛，等待面试安排", order: 2 },
    { name: "面试中", description: "正在面试流程中", order: 3 },
    { name: "待录用", description: "面试通过，等待发放offer", order: 4 },
    { name: "已录用", description: "已发放offer并入职", order: 5 },
    { name: "已拒绝", description: "未通过筛选或面试", order: 6 },
    { name: "人才库", description: "暂不合适但有潜力的候选人", order: 7 },
  ];
  for (const folder of folders) {
    await prisma.applicationFolder.create({ data: folder });
  }
  console.log("✅ 申请分类夹已创建 (7 个分类)");



  // 9. 创建测试用户

  await prisma.address.deleteMany({});
  await prisma.user.deleteMany({});
  const testUserPassword = await bcrypt.hash("123456", 10);
  const testUser = await prisma.user.create({
    data: {
      phone: "13800138000",
      phoneVerified: true,
      password: testUserPassword,
      nickname: "测试用户",
    },
  });
  console.log("✅ 测试用户已创建 (13800138000 / 123456)");

  // 9.1 创建测试用户收货地址
  const addresses = [
    {
      userId: testUser.id,
      name: "张三",
      phone: "13800138000",
      province: "上海市",
      city: "上海市",
      district: "浦东新区",
      detail: "陆家嘴环路1000号 恒生银行大厦 28楼",
      postalCode: "200120",
      isDefault: true,
    },
    {
      userId: testUser.id,
      name: "李四",
      phone: "13900139000",
      province: "北京市",
      city: "北京市",
      district: "朝阳区",
      detail: "建国门外大街1号 国贸大厦A座 15层",
      postalCode: "100004",
      isDefault: false,
    },
    {
      userId: testUser.id,
      name: "王五",
      phone: "13700137000",
      province: "广东省",
      city: "深圳市",
      district: "南山区",
      detail: "科技园南区 腾讯大厦 10楼",
      postalCode: "518057",
      isDefault: false,
    },
  ];
  for (const addr of addresses) {
    await prisma.address.create({ data: addr });
  }
  console.log("✅ 测试用户收货地址已创建 (3 个地址)");


  // 9.3 创建测试联系留言
  await prisma.contactMessage.deleteMany({});
  const contactMessages = [
    {
      name: "刘女士",
      phone: "13812345678",
      content: "您好，我想咨询一下修护紧致精华是否适合敏感肌使用？我皮肤比较容易过敏，之前用过一些精华会刺痛，请问这款产品成分温和吗？",
      read: false,
    },
    {
      name: "陈先生",
      phone: "13987654321",
      content: "请问你们的产品在北京有线下体验店吗？我想实际试用后再决定购买，希望能提供一下门店地址，谢谢！",
      read: true,
    },
    {
      name: "王小姐",
      phone: "13711112222",
      content: "我之前在你们天猫旗舰店购买了逆龄面霜，使用了一周感觉非常好，皮肤明显变得更有光泽了。想问一下这个面霜和精华搭配使用效果会更好吗？",
      read: true,
    },
    {
      name: "张先生",
      phone: "13633334444",
      content: "你好，我是一家高端美容院的采购负责人，想咨询一下是否可以批量采购你们的产品？希望能获取批发价格和合作方式，期待回复。",
      read: false,
    },
    {
      name: "赵女士",
      phone: "13555556666",
      content: "我在官网购买的臻萃修护面膜，收到后发现包装有点变形，虽然产品本身没问题，但作为送礼用途有点担心，请问可以换货吗？订单号是 NP20241225001。",
      read: false,
    },
  ];
  for (const msg of contactMessages) {
    await prisma.contactMessage.create({ data: msg });
  }
  console.log("✅ 测试联系留言已创建 (5 条留言)");

  // 10. 创建电商相关设置
  const ecommerceSettings = [
    {
      key: "shipping",
      value: {
        freeShippingThreshold: 299,  // 满299包邮
        baseShippingFee: 15,         // 基础运费
        expressCompanies: ["顺丰速运", "京东物流", "圆通速递", "中通快递"],
      },
    },

    {
      key: "order",
      value: {
        autoCancelMinutes: 30,       // 未支付自动取消时间（分钟）
        autoReceiveDays: 15,         // 自动确认收货天数
        returnDays: 7,               // 可申请退货天数
      },
    },
  ];
  for (const s of ecommerceSettings) {
    await prisma.setting.upsert({
      where: { key: s.key },
      update: { value: s.value },
      create: s,
    });
  }
  console.log("✅ 电商设置已创建 (运费/积分/订单规则)");

  // 11. 创建默认页面逻辑已移除（页面内容现在统一在代码中管理）

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


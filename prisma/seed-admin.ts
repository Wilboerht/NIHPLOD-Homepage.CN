/**
 * 管理员账号种子脚本
 * 运行: npx tsx prisma/seed-admin.ts
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import bcrypt from "bcryptjs";

// 加载环境变量（优先 .env.local，回退到 .env）
config({ path: ".env.local" });
if (!process.env.DATABASE_URL) {
  config({ path: ".env" });
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const admins = [
  {
    email: "hank.wang@nihplod.cn",
    password: "whk35168",
    name: "Hank Wang",
    role: "owner" as const,
  },
  {
    email: "kiki.wang@nihplod.cn",
    password: "MOIDAS2026kiki",
    name: "Kiki Wang",
    role: "admin" as const,
  },
  {
    email: "walter@nihplod.cn",
    password: "walter",
    name: "Walter",
    role: "admin" as const,
  },
  {
    email: "grace.zhang@nihplod.cn",
    password: "grace2026",
    name: "Grace Zhang",
    role: "admin" as const,
  },
  {
    email: "skye.cao@nihplod.cn",
    password: "315426",
    name: "Skye Cao",
    role: "admin" as const,
  },
  {
    email: "rosy.zhang@nihplod.cn",
    password: "rosy2026",
    name: "Rosy Zhang",
    role: "admin" as const,
  },
];

async function main() {
  console.log("🌱 开始初始化管理员账号...\n");

  for (const admin of admins) {
    const hashedPassword = await bcrypt.hash(admin.password, 12);
    await prisma.admin.upsert({
      where: { email: admin.email },
      update: {},
      create: {
        email: admin.email,
        password: hashedPassword,
        name: admin.name,
        role: admin.role,
      },
    });
    console.log(`✅ ${admin.name} (${admin.email})`);
  }

  console.log("\n🎉 管理员账号初始化完成！");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("登录信息:");
  for (const admin of admins) {
    console.log(` - ${admin.email} / ${admin.password} (${admin.role})`);
  }
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

main()
  .catch((e) => {
    console.error("❌ 管理员账号初始化失败:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

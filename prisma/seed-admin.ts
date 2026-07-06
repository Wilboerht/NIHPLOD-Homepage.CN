/**
 * 管理员账号种子脚本
 * 运行: npx tsx prisma/seed-admin.ts
 *
 * 安全说明：
 * - 本脚本不再硬编码任何密码，所有凭证必须从环境变量读取。
 * - 支持通过 SEED_ADMINS 环境变量配置多个管理员（JSON 数组）。
 * - 也支持通过 SEED_ADMIN_EMAIL + SEED_ADMIN_PASSWORD 配置单个管理员。
 * - 密码会经过强度校验（至少 12 位，包含大小写字母和数字）。
 * - 运行后不会输出任何明文密码。
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import bcrypt from "bcryptjs";
import { parseSeedAdmins, validatePassword } from "./seed-admin-utils";

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

async function main() {
  const admins = parseSeedAdmins();

  console.log("🌱 开始初始化管理员账号...\n");

  for (const admin of admins) {
    validatePassword(admin.password);
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

    console.log(`✅ ${admin.name} (${admin.email}) - role: ${admin.role}`);
  }

  console.log("\n🎉 管理员账号初始化完成！");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`共初始化 ${admins.length} 个管理员账号。`);
  console.log("密码已加密存储，不会在此输出。");
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

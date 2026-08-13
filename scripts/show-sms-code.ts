/**
 * 运维调试：反推指定手机号最新的短信验证码
 *
 * 背景：未接入真实短信服务商（SMS_PROVIDER=mock）时，验证码只以
 * HMAC-SHA256(phone:code:type) 落库，不明文存储、不写日志。
 * 由于验证码是 6 位数字（仅 10^6 空间），可在服务器上用
 * SMS_CODE_HMAC_KEY 秒级枚举反推，用于测试环境登录验证。
 *
 * 用法（在官网项目目录下）：
 *   npx tsx scripts/show-sms-code.ts <手机号> [type]
 *   type 缺省为 login，可选 bind | reset
 *
 * 注意：本脚本会明文输出验证码，仅限测试/运维使用，勿提交到对外文档。
 */

import crypto from "crypto";
import dotenv from "dotenv";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

// 服务器上用 .env，本地开发用 .env.local（先加载的优先）
dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local" });

async function main() {
  const [phone, type = "login"] = process.argv.slice(2);
  if (!phone) {
    console.error("用法: npx tsx scripts/show-sms-code.ts <手机号> [type=login|bind|reset]");
    process.exit(1);
  }

  const hmacKey = process.env.SMS_CODE_HMAC_KEY;
  if (!hmacKey) {
    console.error("❌ 未找到 SMS_CODE_HMAC_KEY 环境变量");
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("❌ 未找到 DATABASE_URL 环境变量");
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const record = await prisma.smsCode.findFirst({
      where: { phone, type, used: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });

    if (!record) {
      console.error(`❌ 没有 ${phone}（type=${type}）未使用且未过期的验证码，请先在页面上点击发送`);
      process.exit(1);
    }

    console.log(`🔍 最新验证码记录：${record.createdAt.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })} 生成，枚举中…`);

    for (let i = 0; i < 1_000_000; i++) {
      const candidate = i.toString().padStart(6, "0");
      const hash = crypto.createHmac("sha256", hmacKey).update(`${phone}:${candidate}:${type}`).digest("hex");
      if (hash === record.codeHash) {
        console.log(`✅ ${phone} 的${type === "login" ? "登录" : type}验证码：${candidate}`);
        return;
      }
    }

    console.error("❌ 枚举完成未命中（hashVerifyCode 逻辑可能已变更）");
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main();

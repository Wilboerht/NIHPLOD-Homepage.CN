/**
 * 运维调试：向数据库直接写入一条指定手机号的短信验证码记录（不走短信通道）
 *
 * 背景：生产环境未接入真实短信服务商时，send-code 走 mock 会被 503 拦截、
 * 走 aliyun/tencent 占位配置会发送失败并把验证码标记 used，导致无法通过
 * 页面发码 + show-sms-code 反推的正常链路拿到验证码。
 * 本脚本跳过短信通道，用服务器上的 SMS_CODE_HMAC_KEY 计算与登录接口完全一致的
 * 哈希后直接入库，页面即可用该验证码完成登录/注册/重置等流程。
 *
 * 用法（在官网项目目录下）：
 *   npx tsx scripts/mint-sms-code.ts <手机号> <6位验证码> [type]
 *   type 缺省为 login，可选 register | reset | bind
 *
 * 注意：本脚本会向生产数据库写入数据，仅限测试/运维使用，用完即焚（5 分钟过期），
 * 勿提交到对外文档，测试结束后请删除或保留在 scripts/ 内并加访问限制。
 */

import crypto from "crypto";
import dotenv from "dotenv";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

// 服务器上用 .env，本地开发用 .env.local（先加载的优先）
dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local" });

const VALID_TYPES = ["login", "register", "reset", "bind"] as const;

async function main() {
  const [phone, code, type = "login"] = process.argv.slice(2);
  if (!phone || !code || !/^1[3-9]\d{9}$/.test(phone) || !/^\d{6}$/.test(code)) {
    console.error("用法: npx tsx scripts/mint-sms-code.ts <手机号> <6位验证码> [type=login|register|reset|bind]");
    process.exit(1);
  }
  if (!VALID_TYPES.includes(type as (typeof VALID_TYPES)[number])) {
    console.error(`type 仅支持 ${VALID_TYPES.join(" | ")}`);
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
    // 先将同 phone+type 的未使用旧码作废（满足 partial unique index 约束）
    await prisma.smsCode.updateMany({
      where: { phone, type, used: false },
      data: { used: true },
    });

    const codeHash = crypto
      .createHmac("sha256", hmacKey)
      .update(`${phone}:${code}:${type}`)
      .digest("hex");

    await prisma.smsCode.create({
      data: {
        phone,
        codeHash,
        type,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        ipAddress: null,
      },
    });

    console.log(
      `✅ 已写入验证码记录：phone=${phone} type=${type} code=${code}（5 分钟内有效，用完即焚）`
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main();

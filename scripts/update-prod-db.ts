/**
 * 生产环境数据库更新脚本
 * 添加 province 和 city 字段到 AdvisorSession 表
 *
 * 使用方法：
 * npx tsx scripts/update-prod-db.ts
 */

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

// 生产环境数据库 URL
const PROD_DATABASE_URL = "postgresql://postgres.gggmklbpdhsdwmmbkgzg:Moidas123!@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true";

async function main() {
  console.log("连接到生产环境数据库...");

  // 创建连接池
  const pool = new pg.Pool({
    connectionString: PROD_DATABASE_URL,
  });

  // 创建 adapter
  const adapter = new PrismaPg(pool);

  const prisma = new PrismaClient({
    adapter,
  });

  try {
    // 1. 检查表是否存在
    console.log("\n1. 检查 AdvisorSession 表...");
    const tableExists = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'AdvisorSession'
      );
    `;
    
    if (!tableExists[0]?.exists) {
      console.log("❌ AdvisorSession 表不存在！请先运行 prisma migrate deploy");
      return;
    }
    console.log("✓ AdvisorSession 表存在");

    // 2. 检查现有字段
    console.log("\n2. 检查现有字段...");
    const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'AdvisorSession';
    `;
    
    const columnNames = columns.map(c => c.column_name);
    console.log("现有字段:", columnNames.join(", "));
    
    const hasProvince = columnNames.includes("province");
    const hasCity = columnNames.includes("city");
    
    // 3. 添加缺失的字段
    console.log("\n3. 添加缺失的字段...");
    
    if (!hasProvince) {
      console.log("  添加 province 字段...");
      await prisma.$executeRaw`ALTER TABLE "AdvisorSession" ADD COLUMN "province" TEXT;`;
      console.log("  ✓ province 字段已添加");
    } else {
      console.log("  ✓ province 字段已存在");
    }
    
    if (!hasCity) {
      console.log("  添加 city 字段...");
      await prisma.$executeRaw`ALTER TABLE "AdvisorSession" ADD COLUMN "city" TEXT;`;
      console.log("  ✓ city 字段已添加");
    } else {
      console.log("  ✓ city 字段已存在");
    }
    
    // 4. 检查并创建索引
    console.log("\n4. 检查索引...");
    const indexExists = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT FROM pg_indexes 
        WHERE tablename = 'AdvisorSession' 
        AND indexname = 'AdvisorSession_province_idx'
      );
    `;
    
    if (!indexExists[0]?.exists) {
      console.log("  创建 province 索引...");
      await prisma.$executeRaw`CREATE INDEX "AdvisorSession_province_idx" ON "AdvisorSession"("province");`;
      console.log("  ✓ 索引已创建");
    } else {
      console.log("  ✓ province 索引已存在");
    }
    
    // 5. 验证最终结果
    console.log("\n5. 验证结果...");
    const finalColumns = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'AdvisorSession'
      ORDER BY column_name;
    `;
    console.log("最终字段:", finalColumns.map(c => c.column_name).join(", "));
    
    // 6. 检查记录数
    const count = await prisma.advisorSession.count();
    console.log(`\n当前 AdvisorSession 记录数: ${count}`);
    
    console.log("\n✅ 数据库更新完成！");
    
  } catch (error) {
    console.error("\n❌ 错误:", error);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main();


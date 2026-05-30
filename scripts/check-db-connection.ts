
import { PrismaClient } from '../src/generated/prisma/client';
import dotenv from 'dotenv';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

// 加载环境变量
dotenv.config({ path: '.env.local' });

async function main() {
    const dbUrl = process.env.DATABASE_URL;

    if (!dbUrl) {
        console.error('❌ 错误: 未找到 DATABASE_URL 环境变量');
        process.exit(1);
    }

    // 隐藏密码部分
    const maskedUrl = dbUrl.replace(/:([^:@]+)@/, ':****@');
    console.log(`ℹ️  尝试连接到数据库: ${maskedUrl}`);

    if (dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1')) {
        console.warn('⚠️  警告: 检测到正在连接本地数据库！');
    } else if (dbUrl.includes('aws') || dbUrl.includes('rds')) {
        console.log('✅ 检测到正在连接远程云数据库 (AWS/RDS)');
    }

    // 配置连接池和适配器
    const pool = new pg.Pool({ connectionString: dbUrl });
    const adapter = new PrismaPg(pool);
    const prisma = new PrismaClient({ adapter });

    try {
        console.log('⏳ 正在建立连接...');
        await prisma.$connect();
        console.log('✅ 数据库连接成功！');

        // 尝试查询一个简单的计数，例如 User 或 Product
        const productCount = await prisma.product.count();
        console.log(`📊 数据库中共有 ${productCount} 个产品`);

        // 查询一个产品名称以确认数据来源
        const firstProduct = await prisma.product.findFirst({
            select: { name: true }
        });
        if (firstProduct) {
            console.log(`📦 第一个产品名称: ${firstProduct.name}`);
        }

    } catch (error) {
        console.error('❌ 数据库连接失败:', error);
    } finally {
        await prisma.$disconnect();
        await pool.end(); // 关闭连接池
    }
}

main();

#!/bin/bash
set -e

# ============================================================
# 数据库迁移脚本：从 Supabase PostgreSQL 迁移到新的 PostgreSQL
# ============================================================
# 用法:
#   1. 先设置好 SOURCE_DB_URL 和 TARGET_DB_URL 环境变量
#   2. 运行: bash scripts/migrate-db.sh
# ============================================================

SOURCE_DB_URL="${SOURCE_DB_URL:-$DATABASE_URL}"
TARGET_DB_URL="${TARGET_DB_URL:-}"

if [ -z "$SOURCE_DB_URL" ]; then
    echo "❌ 错误: 请设置 SOURCE_DB_URL 或 DATABASE_URL 环境变量"
    exit 1
fi

if [ -z "$TARGET_DB_URL" ]; then
    echo "❌ 错误: 请设置 TARGET_DB_URL 环境变量 (目标数据库连接字符串)"
    echo "   示例: export TARGET_DB_URL=\"postgresql://user:pass@host:5432/dbname?schema=public\""
    exit 1
fi

# 隐藏密码用于显示
MASKED_SOURCE=$(echo "$SOURCE_DB_URL" | sed 's/:\([^:@]*\)@/:****@/')
MASKED_TARGET=$(echo "$TARGET_DB_URL" | sed 's/:\([^:@]*\)@/:****@/')

echo "============================================================"
echo "🚀 数据库迁移开始"
echo "============================================================"
echo ""
echo "源数据库: $MASKED_SOURCE"
echo "目标数据库: $MASKED_TARGET"
echo ""

# 检查必要工具
for cmd in pg_dump psql pg_restore; do
    if ! command -v $cmd &> /dev/null; then
        echo "❌ 错误: 未找到 $cmd，请安装 PostgreSQL 客户端工具"
        echo "   Windows: https://www.postgresql.org/download/windows/"
        echo "   macOS: brew install libpq"
        exit 1
    fi
done

# 提取连接信息用于 psql 直连
# 注意: pg_dump 可以直接使用连接字符串

DUMP_FILE="supabase_dump_$(date +%Y%m%d_%H%M%S).sql"

echo "⏳ 步骤 1/4: 从源数据库导出结构和数据..."
pg_dump "$SOURCE_DB_URL" \
    --verbose \
    --no-owner \
    --no-privileges \
    --clean \
    --if-exists \
    --format=plain \
    > "$DUMP_FILE"

echo "✅ 导出完成: $DUMP_FILE"
echo ""

echo "⏳ 步骤 2/4: 在目标数据库创建 schema (使用 Prisma Migrate)..."
echo "   ⚠️  确保目标数据库是空的，或已备份"
echo ""

# 先尝试连接目标数据库
echo "⏳ 测试目标数据库连接..."
if ! psql "$TARGET_DB_URL" -c "SELECT 1;" > /dev/null 2>&1; then
    echo "❌ 错误: 无法连接到目标数据库"
    exit 1
fi
echo "✅ 目标数据库连接正常"
echo ""

echo "⏳ 步骤 3/4: 导入数据到目标数据库..."
psql "$TARGET_DB_URL" < "$DUMP_FILE"

echo "✅ 导入完成"
echo ""

echo "⏳ 步骤 4/4: 验证数据..."

# 获取表列表并统计记录数
TABLES=$(psql "$TARGET_DB_URL" -t -c "
    SELECT tablename FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename NOT LIKE '_prisma_migrations%'
    ORDER BY tablename;
")

echo ""
echo "📊 目标数据库表统计:"
echo "----------------------------"
for table in $TABLES; do
    count=$(psql "$TARGET_DB_URL" -t -c "SELECT COUNT(*) FROM \"$table\";" 2>/dev/null | xargs)
    printf "  %-30s %s 条记录\n" "$table" "$count"
done
echo "----------------------------"
echo ""

echo "============================================================"
echo "✅ 数据库迁移完成!"
echo "============================================================"
echo ""
echo "下一步:"
echo "  1. 更新 .env.local 中的 DATABASE_URL 为目标数据库:"
echo "     DATABASE_URL=\"$MASKED_TARGET\""
echo "  2. 运行: npx prisma migrate resolve --applied 20260510230000_add_transaction"
echo "     (将最后一个迁移标记为已应用，避免重复执行)"
echo "  3. 运行: npm run build 验证构建"
echo "  4. 运行: npx prisma db seed (如需重新初始化种子数据)"
echo ""
echo "备份文件保留: $DUMP_FILE"
echo ""

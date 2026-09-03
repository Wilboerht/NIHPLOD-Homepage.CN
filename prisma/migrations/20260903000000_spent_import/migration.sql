-- ============================================
-- 管理端 Excel 批量导入消费记录（批次 + 逐行明细，支持整批撤销）
-- ============================================

-- 1. 新建枚举（逐行结果状态）
CREATE TYPE "SpentImportRowStatus" AS ENUM ('SUCCESS', 'DUPLICATE', 'ERROR');

-- 2. 导入批次表
CREATE TABLE "SpentImportBatch" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileHash" TEXT,
    "totalRows" INTEGER NOT NULL,
    "successRows" INTEGER NOT NULL,
    "duplicateRows" INTEGER NOT NULL DEFAULT 0,
    "errorRows" INTEGER NOT NULL,
    "totalAmount" INTEGER NOT NULL,
    "undoneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpentImportBatch_pkey" PRIMARY KEY ("id")
);

-- 3. 批次索引
CREATE INDEX "SpentImportBatch_createdAt_idx"
    ON "SpentImportBatch"("createdAt" DESC);

-- 4. 批次外键（管理员仅软删；RESTRICT 防止硬删连带抹掉导入审计历史）
ALTER TABLE "SpentImportBatch" ADD CONSTRAINT "SpentImportBatch_adminId_fkey"
    FOREIGN KEY ("adminId") REFERENCES "Admin"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- 5. 逐行明细表（reference 保存幂等键，支撑整批撤销）
CREATE TABLE "SpentImportRow" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "channel" "SpentAdjustmentChannel",
    "orderNo" TEXT,
    "purchasedAt" TIMESTAMP(3),
    "note" TEXT,
    "reference" TEXT NOT NULL,
    "status" "SpentImportRowStatus" NOT NULL,
    "error" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpentImportRow_pkey" PRIMARY KEY ("id")
);

-- 6. 明细索引
CREATE INDEX "SpentImportRow_batchId_idx" ON "SpentImportRow"("batchId");

CREATE INDEX "SpentImportRow_userId_createdAt_idx"
    ON "SpentImportRow"("userId", "createdAt" DESC);

-- 7. 明细外键
ALTER TABLE "SpentImportRow" ADD CONSTRAINT "SpentImportRow_batchId_fkey"
    FOREIGN KEY ("batchId") REFERENCES "SpentImportBatch"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SpentImportRow" ADD CONSTRAINT "SpentImportRow_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

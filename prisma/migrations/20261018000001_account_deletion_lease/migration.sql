-- 账号注销状态机：enum + 执行租约（防止并发重复执行/慢失败覆盖完成态）
CREATE TYPE "AccountDeletionStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

ALTER TABLE "AccountDeletionRequest" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "AccountDeletionRequest"
ALTER COLUMN "status" TYPE "AccountDeletionStatus"
USING (
  CASE
    WHEN "status" IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED')
      THEN "status"::"AccountDeletionStatus"
    ELSE 'FAILED'::"AccountDeletionStatus"
  END
);

ALTER TABLE "AccountDeletionRequest" ALTER COLUMN "status" SET DEFAULT 'PENDING';

ALTER TABLE "AccountDeletionRequest" ADD COLUMN "lockedAt" TIMESTAMP(3);
ALTER TABLE "AccountDeletionRequest" ADD COLUMN "leaseToken" TEXT;

CREATE INDEX "AccountDeletionRequest_status_lockedAt_idx"
  ON "AccountDeletionRequest"("status", "lockedAt");

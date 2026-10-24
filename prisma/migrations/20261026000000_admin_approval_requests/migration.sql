-- Owner 审批流：申请、审批、执行状态与审计关联
CREATE TYPE "AdminApprovalStatus" AS ENUM (
  'PENDING',
  'APPROVED',
  'EXECUTING',
  'REJECTED',
  'CANCELLED',
  'EXPIRED',
  'EXECUTED',
  'EXECUTION_FAILED',
  'STALE'
);

CREATE TYPE "AdminApprovalExecutionMode" AS ENUM ('AUTO', 'REQUESTER');

CREATE TABLE "AdminApprovalRequest" (
  "id" TEXT NOT NULL,
  "policyKey" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "executionMode" "AdminApprovalExecutionMode" NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT,
  "targetLabel" TEXT,
  "targetSnapshot" JSONB,
  "payload" JSONB NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "requesterId" TEXT NOT NULL,
  "requesterEmail" TEXT,
  "requesterName" TEXT,
  "requesterRole" TEXT NOT NULL,
  "status" "AdminApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "approverId" TEXT,
  "approverEmail" TEXT,
  "approverName" TEXT,
  "approvedAt" TIMESTAMP(3),
  "approvalTotpVerifiedAt" TIMESTAMP(3),
  "decisionNote" TEXT,
  "executionResult" JSONB,
  "executedAt" TIMESTAMP(3),
  "error" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdminApprovalRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdminApprovalRequest_status_createdAt_idx"
  ON "AdminApprovalRequest" ("status", "createdAt" DESC);
CREATE INDEX "AdminApprovalRequest_requesterId_createdAt_idx"
  ON "AdminApprovalRequest" ("requesterId", "createdAt" DESC);
CREATE INDEX "AdminApprovalRequest_policyKey_createdAt_idx"
  ON "AdminApprovalRequest" ("policyKey", "createdAt" DESC);
CREATE INDEX "AdminApprovalRequest_expiresAt_idx"
  ON "AdminApprovalRequest" ("expiresAt");

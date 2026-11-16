import { createHash } from "crypto";
import type { Prisma } from "@/generated/prisma/client";
import {
  createAuditLog,
  createAuditLogTx,
  type AuditAction,
  type AuditTargetType,
} from "@/lib/audit";
import { apiConsole } from "@/lib/logger";

export function fingerprintInternalKey(key: string): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 16);
}

export async function auditInternalPoints(params: {
  action: AuditAction;
  targetType: AuditTargetType;
  targetId: string;
  userId: string;
  project: string;
  key: string;
  request: Request;
  detail: Record<string, unknown>;
  outcome?: "SUCCESS" | "FAILURE";
  /** 传入时与业务写入同事务；审计失败会抛错并回滚业务变更。 */
  tx?: Prisma.TransactionClient;
}): Promise<boolean> {
  const input = {
    action: params.action,
    targetType: params.targetType,
    targetId: params.targetId,
    targetLabel: params.project,
    userId: params.userId,
    actorType: "SYSTEM" as const,
    authMethod: "internal_api",
    outcome: params.outcome ?? ("SUCCESS" as const),
    request: params.request,
    detail: {
      project: params.project,
      keyFingerprint: fingerprintInternalKey(params.key),
      ...params.detail,
    },
  };
  try {
    if (params.tx) {
      await createAuditLogTx(params.tx, input);
      return true;
    }
    return await createAuditLog(input);
  } catch (error) {
    apiConsole.error(
      `[InternalPointsAudit] 审计写入失败 action=${params.action} project=${params.project} userId=${params.userId}`,
      error
    );
    return false;
  }
}

export async function auditInternalPointsFailure(params: {
  action: AuditAction;
  targetType: AuditTargetType;
  targetId: string;
  userId: string;
  project: string;
  key: string;
  request: Request;
  detail: Record<string, unknown>;
}): Promise<void> {
  await auditInternalPoints({ ...params, outcome: "FAILURE" });
}

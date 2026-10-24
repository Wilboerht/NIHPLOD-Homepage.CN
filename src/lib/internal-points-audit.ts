import { createHash } from "crypto";
import {
  createAuditLog,
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
}): Promise<boolean> {
  const ok = await createAuditLog({
    action: params.action,
    targetType: params.targetType,
    targetId: params.targetId,
    targetLabel: params.project,
    userId: params.userId,
    actorType: "SYSTEM",
    authMethod: "internal_api",
    outcome: params.outcome ?? "SUCCESS",
    request: params.request,
    detail: {
      project: params.project,
      keyFingerprint: fingerprintInternalKey(params.key),
      ...params.detail,
    },
  });
  if (!ok) {
    apiConsole.error(
      `[InternalPointsAudit] 审计写入失败 action=${params.action} project=${params.project} userId=${params.userId}`
    );
  }
  return ok;
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

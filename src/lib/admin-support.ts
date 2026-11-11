import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkAdminRateLimit, verifyAuth } from "@/lib/auth";
import { hasAdminPermission, type AdminPermission } from "@/lib/admin-permissions";
import { requireAdminStepUp } from "@/lib/admin-totp";
import { createAuditLogStrict, type AuditAction, type AuditTargetType } from "@/lib/audit";
import { csrfForbiddenResponse, validateCSRFToken } from "@/lib/csrf";
import type { AdminUser } from "@/types/auth";

export const supportReasonSchema = z
  .string()
  .trim()
  .min(2, "请填写操作原因或工单号")
  .max(500, "操作原因过长");

export async function requireAdminSupportAccess(
  request: NextRequest,
  permission: AdminPermission,
  options: { write?: boolean; stepUp?: boolean; rateLimitKey?: string } = {}
): Promise<{ ok: true; admin: AdminUser } | { ok: false; response: NextResponse }> {
  const write = options.write ?? true;
  if (write && !validateCSRFToken(request)) {
    return { ok: false, response: csrfForbiddenResponse() };
  }
  const admin = await verifyAuth(request);
  if (!admin) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      ),
    };
  }
  if (!hasAdminPermission(admin, permission)) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足" } },
        { status: 403 }
      ),
    };
  }
  const limited = await checkAdminRateLimit(
    request,
    options.rateLimitKey ?? (write ? "admin-support-write" : "admin-support-read"),
    admin.id
  );
  if (limited) return { ok: false, response: limited };
  if (options.stepUp ?? write) {
    const stepUp = await requireAdminStepUp(request, admin);
    if (stepUp) return { ok: false, response: stepUp };
  }
  return { ok: true, admin };
}

export async function writeAdminSupportAudit(input: {
  action: AuditAction;
  targetType: AuditTargetType;
  targetId: string;
  targetLabel?: string;
  detail?: Record<string, unknown>;
  admin: AdminUser;
  request: NextRequest;
}): Promise<void> {
  await createAuditLogStrict({
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    targetLabel: input.targetLabel,
    detail: input.detail,
    actorType: "ADMIN",
    actorEmail: input.admin.email,
    actorName: input.admin.name,
    actorRole: input.admin.role,
    authMethod: "step_up",
    sessionJti: null,
    adminId: input.admin.id,
    request: input.request,
  });
}

export function supportError(code: string, message: string, status = 400): NextResponse {
  return NextResponse.json({ success: false, error: { code, message } }, { status });
}

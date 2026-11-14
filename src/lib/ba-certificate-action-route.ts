import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { checkAdminRateLimit, verifyAuth } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { requireAdminStepUp } from "@/lib/admin-totp";
import { parseAdminJsonBody } from "@/lib/request-body";
import { createAuditLog } from "@/lib/audit";
import { apiConsole } from "@/lib/logger";
import { mapBaError } from "@/lib/ba-complaints";
import { baCertificateRequest } from "@/lib/ba-certificate-proxy";
import type { BaCertificateListItem } from "@/lib/ba-certificates";
import type { AuditAction } from "@/lib/audit";

const NO_STORE = { "Cache-Control": "no-store, private" } as const;

export async function handleBaCertificateAction(
  request: NextRequest,
  id: string,
  options: {
    path: string;
    permission: Parameters<typeof hasAdminPermission>[1];
    action: string;
    auditAction: AuditAction;
    requireStepUp?: boolean;
    requireReason?: boolean;
    includeDraft?: boolean;
  }
): Promise<NextResponse> {
  const admin = await verifyAuth(request);
  if (!admin) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
      { status: 401, headers: NO_STORE }
    );
  }
  if (!hasAdminPermission(admin, options.permission)) {
    return NextResponse.json(
      { success: false, error: { code: "FORBIDDEN", message: "无权限执行该证书操作" } },
      { status: 403, headers: NO_STORE }
    );
  }
  if (!validateCSRFToken(request)) return csrfForbiddenResponse();
  const rate = await checkAdminRateLimit(request, "admin-write", admin.id);
  if (rate) return rate;
  if (options.requireStepUp) {
    const stepUp = await requireAdminStepUp(request, admin);
    if (stepUp) return stepUp;
  }

  const parsed = await parseAdminJsonBody<{
    reason?: string;
    draft?: unknown;
    idempotencyKey?: string;
  }>(request);
  if (!parsed.ok) return parsed.response;
  const reason = String(parsed.data.reason ?? "")
    .trim()
    .slice(0, 1000);
  if (options.requireReason && !reason) {
    return NextResponse.json(
      { success: false, error: { code: "REASON_REQUIRED", message: "请填写操作原因" } },
      { status: 400, headers: NO_STORE }
    );
  }
  const idempotencyKey =
    parsed.data.idempotencyKey || request.headers.get("x-idempotency-key") || crypto.randomUUID();

  const body: Record<string, unknown> = { reason, idempotencyKey };
  if (options.includeDraft && parsed.data.draft && typeof parsed.data.draft === "object") {
    body.draft = parsed.data.draft;
  }

  const result = await baCertificateRequest<BaCertificateListItem>(
    admin,
    `/api/internal/admin/certificates/${encodeURIComponent(id)}/${options.path}`,
    { method: "POST", body, idempotencyKey }
  );
  if (!result.ok) return mapBaError(result);

  await createAuditLog({
    action: options.auditAction,
    targetType: "ba_certificate",
    targetId: id,
    targetLabel: result.data?.certNumber ?? id,
    reason: reason || undefined,
    actorType: "ADMIN",
    actorEmail: admin.email,
    actorName: admin.name,
    actorRole: admin.role,
    adminId: admin.id,
    detail: { action: options.action, idempotencyKey },
    request,
  }).catch((error) => apiConsole.error("[BaCertificateAction] 审计写入失败", error));

  return NextResponse.json({ success: true, data: result.data }, { headers: NO_STORE });
}

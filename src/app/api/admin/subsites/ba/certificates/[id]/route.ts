import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { checkAdminRateLimit, verifyAuth } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { parseAdminJsonBody } from "@/lib/request-body";
import { createAuditLog } from "@/lib/audit";
import { apiConsole } from "@/lib/logger";
import { mapBaError } from "@/lib/ba-complaints";
import { baCertificateRequest } from "@/lib/ba-certificate-proxy";
import type { BaCertificateDetail } from "@/lib/ba-certificates";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, private" } as const;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await verifyAuth(request);
  if (!admin) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
      { status: 401, headers: NO_STORE }
    );
  }
  if (!hasAdminPermission(admin, "ba:certificates:read")) {
    return NextResponse.json(
      { success: false, error: { code: "FORBIDDEN", message: "无权限查看 BA 证书" } },
      { status: 403, headers: NO_STORE }
    );
  }
  const rate = await checkAdminRateLimit(request, "admin-read", admin.id);
  if (rate) return rate;
  const { id } = await params;
  const result = await baCertificateRequest<BaCertificateDetail>(
    admin,
    `/api/internal/admin/certificates/${encodeURIComponent(id)}`
  );
  if (!result.ok) return mapBaError(result);
  return NextResponse.json({ success: true, data: result.data }, { headers: NO_STORE });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await verifyAuth(request);
  if (!admin) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
      { status: 401, headers: NO_STORE }
    );
  }
  if (!hasAdminPermission(admin, "ba:certificates:update")) {
    return NextResponse.json(
      { success: false, error: { code: "FORBIDDEN", message: "无权限修改 BA 证书" } },
      { status: 403, headers: NO_STORE }
    );
  }
  if (!validateCSRFToken(request)) return csrfForbiddenResponse();
  const rate = await checkAdminRateLimit(request, "admin-write", admin.id);
  if (rate) return rate;
  const parsed = await parseAdminJsonBody<{ draft?: unknown; idempotencyKey?: string }>(request);
  if (!parsed.ok) return parsed.response;
  if (!parsed.data.draft || typeof parsed.data.draft !== "object") {
    return NextResponse.json(
      { success: false, error: { code: "INVALID_DRAFT", message: "证书数据无效" } },
      { status: 400, headers: NO_STORE }
    );
  }
  const { id } = await params;
  const idempotencyKey =
    parsed.data.idempotencyKey || request.headers.get("x-idempotency-key") || crypto.randomUUID();
  const result = await baCertificateRequest<BaCertificateDetail["certificate"]>(
    admin,
    `/api/internal/admin/certificates/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      idempotencyKey,
      body: { draft: parsed.data.draft, idempotencyKey },
    }
  );
  if (!result.ok) return mapBaError(result);
  await createAuditLog({
    action: "ba_certificate_update",
    targetType: "ba_certificate",
    targetId: id,
    targetLabel: result.data?.certNumber ?? id,
    actorType: "ADMIN",
    actorEmail: admin.email,
    actorName: admin.name,
    actorRole: admin.role,
    adminId: admin.id,
    detail: { idempotencyKey },
    request,
  }).catch((error) => apiConsole.error("[BaCertificateUpdate] 审计写入失败", error));
  return NextResponse.json({ success: true, data: result.data }, { headers: NO_STORE });
}

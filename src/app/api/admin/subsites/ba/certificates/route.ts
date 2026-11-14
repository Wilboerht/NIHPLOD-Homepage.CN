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
import type { BaCertificateListData } from "@/lib/ba-certificates";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, private" } as const;

export async function GET(request: NextRequest) {
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

  const search = request.nextUrl.searchParams;
  const result = await baCertificateRequest<BaCertificateListData>(
    admin,
    "/api/internal/admin/certificates",
    {
      query: {
        page: search.get("page") || 1,
        pageSize: search.get("pageSize") || 20,
        status: search.get("status") || "ALL",
        q: search.get("q") || undefined,
        includeSensitive: hasAdminPermission(admin, "ba:certificates:sensitive:read")
          ? "true"
          : "false",
      },
    }
  );
  if (!result.ok) return mapBaError(result);
  return NextResponse.json({ success: true, data: result.data }, { headers: NO_STORE });
}

export async function POST(request: NextRequest) {
  const admin = await verifyAuth(request);
  if (!admin) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
      { status: 401, headers: NO_STORE }
    );
  }
  if (!validateCSRFToken(request)) return csrfForbiddenResponse();
  const rate = await checkAdminRateLimit(request, "admin-write", admin.id);
  if (rate) return rate;

  const parsed = await parseAdminJsonBody<{
    mode?: "submit" | "issue";
    draft?: unknown;
    idempotencyKey?: string;
  }>(request);
  if (!parsed.ok) return parsed.response;
  const mode = parsed.data.mode === "issue" ? "issue" : "submit";
  const required = mode === "issue" ? "ba:certificates:issue" : "ba:certificates:submit";
  if (!hasAdminPermission(admin, required)) {
    return NextResponse.json(
      { success: false, error: { code: "FORBIDDEN", message: "无权限执行该证书操作" } },
      { status: 403, headers: NO_STORE }
    );
  }
  if (mode === "issue") {
    const stepUp = await requireAdminStepUp(request, admin);
    if (stepUp) return stepUp;
  }
  if (!parsed.data.draft || typeof parsed.data.draft !== "object") {
    return NextResponse.json(
      { success: false, error: { code: "INVALID_DRAFT", message: "证书数据无效" } },
      { status: 400, headers: NO_STORE }
    );
  }

  const idempotencyKey =
    parsed.data.idempotencyKey || request.headers.get("x-idempotency-key") || crypto.randomUUID();
  const result = await baCertificateRequest<unknown>(admin, "/api/internal/admin/certificates", {
    method: "POST",
    idempotencyKey,
    body: { mode, draft: parsed.data.draft, idempotencyKey },
  });
  if (!result.ok) return mapBaError(result);

  await createAuditLog({
    action: mode === "issue" ? "ba_certificate_issue" : "ba_certificate_submit",
    targetType: "ba_certificate",
    targetId:
      result.data && typeof result.data === "object" && "id" in result.data
        ? String((result.data as { id: unknown }).id)
        : undefined,
    targetLabel:
      result.data && typeof result.data === "object" && "certNumber" in result.data
        ? String((result.data as { certNumber: unknown }).certNumber)
        : undefined,
    actorType: "ADMIN",
    actorEmail: admin.email,
    actorName: admin.name,
    actorRole: admin.role,
    adminId: admin.id,
    detail: { mode, idempotencyKey },
    request,
  }).catch((error) => apiConsole.error("[BaCertificateCreate] 审计写入失败", error));

  return NextResponse.json({ success: true, data: result.data }, { headers: NO_STORE });
}

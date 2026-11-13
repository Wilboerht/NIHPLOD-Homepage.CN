import { NextRequest, NextResponse } from "next/server";
import { checkAdminRateLimit, verifyAuth } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { parseAdminJsonBody } from "@/lib/request-body";
import { mapBaError } from "@/lib/ba-complaints";
import { baInternalStream } from "@/lib/ba-internal";
import { baActorHeader } from "@/lib/ba-certificates";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const admin = await verifyAuth(request);
  if (!admin) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
      { status: 401 }
    );
  }
  if (!hasAdminPermission(admin, "ba:certificates:read")) {
    return NextResponse.json(
      { success: false, error: { code: "FORBIDDEN", message: "无权限查看 BA 证书" } },
      { status: 403 }
    );
  }
  if (!validateCSRFToken(request)) return csrfForbiddenResponse();
  const rate = await checkAdminRateLimit(request, "admin-read", admin.id);
  if (rate) return rate;
  const parsed = await parseAdminJsonBody<{ draft?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  if (!parsed.data.draft || typeof parsed.data.draft !== "object") {
    return NextResponse.json(
      { success: false, error: { code: "INVALID_DRAFT", message: "证书数据无效" } },
      { status: 400 }
    );
  }
  const result = await baInternalStream("/api/internal/admin/certificates/preview", {
    method: "POST",
    body: { draft: parsed.data.draft },
    headers: { "x-internal-actor": baActorHeader(admin) },
    timeoutMs: 30000,
  });
  if (!result.ok) return mapBaError(result);
  const headers = new Headers();
  headers.set("Content-Type", result.response.headers.get("content-type") || "image/png");
  headers.set("Cache-Control", "private, no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(result.response.body, { status: 200, headers });
}

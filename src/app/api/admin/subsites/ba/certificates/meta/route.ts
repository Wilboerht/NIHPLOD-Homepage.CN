import { NextRequest, NextResponse } from "next/server";
import { checkAdminRateLimit, verifyAuth } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { mapBaError } from "@/lib/ba-complaints";
import { baCertificateRequest } from "@/lib/ba-certificate-proxy";
import type { BaCertificateMeta } from "@/lib/ba-certificates";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
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
  const rate = await checkAdminRateLimit(request, "admin-read", admin.id);
  if (rate) return rate;
  const result = await baCertificateRequest<BaCertificateMeta>(
    admin,
    "/api/internal/admin/certificates/meta"
  );
  if (!result.ok) return mapBaError(result);
  return NextResponse.json(
    { success: true, data: result.data },
    { headers: { "Cache-Control": "no-store" } }
  );
}

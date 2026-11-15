import { NextRequest, NextResponse } from "next/server";
import { checkAdminRateLimit, verifyAuth } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { mapBaError } from "@/lib/ba-complaints";
import { baActorStream, baCertificateRequest } from "@/lib/ba-certificate-proxy";
import { createAuditLog } from "@/lib/audit";
import type { BaCertificateDetail } from "@/lib/ba-certificates";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
  const { id } = await params;

  const detail = await baCertificateRequest<BaCertificateDetail>(
    admin,
    `/api/internal/admin/certificates/${encodeURIComponent(id)}`
  );
  if (!detail.ok) return mapBaError(detail);

  const certificate = detail.data.certificate;
  const isDraft = certificate.displayStatus === "PENDING" || certificate.displayStatus === "REJECTED";
  if (!isDraft && !hasAdminPermission(admin, "ba:certificates:download")) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "FORBIDDEN", message: "查看已签发证书预览需要证书下载权限" },
      },
      { status: 403, headers: { "Cache-Control": "no-store, private" } }
    );
  }

  const result = isDraft
    ? await baActorStream(admin, "/api/internal/admin/certificates/preview", {
        method: "POST",
        body: {
          draft: {
            companyName: certificate.companyName,
            shopName: certificate.shopName,
            phone: certificate.phone ?? certificate.phoneMasked ?? undefined,
            scopeText: certificate.scopeText,
            startDate: certificate.startDate,
            endDate: certificate.endDate,
          },
        },
        timeoutMs: 30000,
      })
    : await baActorStream(
        admin,
        `/api/internal/admin/certificates/${encodeURIComponent(id)}/artifact`,
        { query: { format: "png" }, timeoutMs: 30000 }
      );
  if (!result.ok) return mapBaError(result);
  await createAuditLog({
    action: "ba_certificate_preview",
    targetType: "ba_certificate",
    targetId: id,
    targetLabel: certificate.certNumber,
    detail: { draft: isDraft },
    actorType: "ADMIN",
    actorEmail: admin.email,
    actorName: admin.name,
    actorRole: admin.role,
    adminId: admin.id,
    request,
  }).catch(() => {});
  const headers = new Headers();
  headers.set("Content-Type", result.response.headers.get("content-type") || "image/png");
  headers.set("Cache-Control", "private, no-store");
  headers.set("Content-Disposition", "inline");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(result.response.body, { status: 200, headers });
}

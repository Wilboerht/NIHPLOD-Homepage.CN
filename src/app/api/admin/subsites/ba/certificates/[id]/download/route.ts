import { NextRequest, NextResponse } from "next/server";
import { checkAdminRateLimit, verifyAuth } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { mapBaError } from "@/lib/ba-complaints";
import { baCertificateRequest, baCertificateStream } from "@/lib/ba-certificate-proxy";
import { createAuditLog } from "@/lib/audit";
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
  if (!hasAdminPermission(admin, "ba:certificates:download")) {
    return NextResponse.json(
      { success: false, error: { code: "FORBIDDEN", message: "无权限下载 BA 证书" } },
      { status: 403, headers: NO_STORE }
    );
  }
  const rate = await checkAdminRateLimit(request, "admin-read", admin.id);
  if (rate) return rate;
  const { id } = await params;
  const format = request.nextUrl.searchParams.get("format") === "pdf" ? "pdf" : "png";

  const detail = await baCertificateRequest<BaCertificateDetail>(
    admin,
    `/api/internal/admin/certificates/${encodeURIComponent(id)}`
  );
  if (!detail.ok) return mapBaError(detail);

  const stream = await baCertificateStream(
    admin,
    `/api/internal/admin/certificates/${encodeURIComponent(id)}/artifact`,
    { query: { format }, timeoutMs: 30000 }
  );
  if (!stream.ok) return mapBaError(stream);

  await createAuditLog({
    action: "ba_certificate_download",
    targetType: "ba_certificate",
    targetId: id,
    targetLabel: detail.data.certificate.certNumber,
    actorType: "ADMIN",
    actorEmail: admin.email,
    actorName: admin.name,
    actorRole: admin.role,
    adminId: admin.id,
    detail: { format },
    request,
  }).catch(() => {});

  const headers = new Headers();
  headers.set(
    "Content-Type",
    stream.response.headers.get("content-type") || "application/octet-stream"
  );
  const length = stream.response.headers.get("content-length");
  if (length) headers.set("Content-Length", length);
  headers.set(
    "Content-Disposition",
    `attachment; filename="${detail.data.certificate.certNumber}.${format}"`
  );
  headers.set("Cache-Control", "private, no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(stream.response.body, { status: 200, headers });
}

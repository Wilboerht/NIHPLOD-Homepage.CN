import { NextRequest, NextResponse } from "next/server";
import { checkAdminRateLimit, verifyAuth } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { mapBaError } from "@/lib/ba-complaints";
import { baCertificateRequest, baCertificateStream } from "@/lib/ba-certificate-proxy";
import { baInternalStream } from "@/lib/ba-internal";
import { baActorHeader, type BaCertificateDetail } from "@/lib/ba-certificates";

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
  let result;
  if (certificate.displayStatus === "PENDING" || certificate.displayStatus === "REJECTED") {
    result = await baInternalStream("/api/internal/admin/certificates/preview", {
      method: "POST",
      body: {
        draft: {
          companyName: certificate.companyName,
          shopName: certificate.shopName,
          phone: certificate.phoneMasked ?? undefined,
          scopeText: certificate.scopeText,
          startDate: certificate.startDate,
          endDate: certificate.endDate,
        },
      },
      headers: { "x-internal-actor": baActorHeader(admin) },
      timeoutMs: 30000,
    });
  } else {
    result = await baCertificateStream(
      admin,
      `/api/internal/admin/certificates/${encodeURIComponent(id)}/artifact`,
      { query: { format: "png" }, timeoutMs: 30000 }
    );
  }
  if (!result.ok) return mapBaError(result);
  const headers = new Headers();
  headers.set("Content-Type", result.response.headers.get("content-type") || "image/png");
  headers.set("Cache-Control", "private, no-store");
  headers.set("Content-Disposition", "inline");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(result.response.body, { status: 200, headers });
}

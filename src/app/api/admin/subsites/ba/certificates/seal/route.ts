import { NextRequest, NextResponse } from "next/server";
import { checkAdminRateLimit, verifyAuth } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { readFormDataBody } from "@/lib/request-body";
import { mapBaError } from "@/lib/ba-complaints";
import { baCertificateRequest } from "@/lib/ba-certificate-proxy";
import { createAuditLog } from "@/lib/audit";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const admin = await verifyAuth(request);
  if (!admin) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
      { status: 401 }
    );
  }
  if (!hasAdminPermission(admin, "ba:certificates:issue")) {
    return NextResponse.json(
      { success: false, error: { code: "FORBIDDEN", message: "无权限上传证书签章" } },
      { status: 403 }
    );
  }
  if (!validateCSRFToken(request)) return csrfForbiddenResponse();
  const rate = await checkAdminRateLimit(request, "admin-write", admin.id);
  if (rate) return rate;

  let formData: FormData;
  try {
    formData = await readFormDataBody(request, MAX_BYTES + 1024 * 1024);
  } catch {
    return NextResponse.json(
      { success: false, error: { code: "INVALID_BODY", message: "签章上传请求无效" } },
      { status: 400 }
    );
  }
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { success: false, error: { code: "FILE_REQUIRED", message: "请选择签章图片" } },
      { status: 400 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { success: false, error: { code: "FILE_TOO_LARGE", message: "签章图片不能超过 5MB" } },
      { status: 413 }
    );
  }
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    return NextResponse.json(
      { success: false, error: { code: "INVALID_TYPE", message: "签章仅支持 PNG/JPEG/WebP" } },
      { status: 400 }
    );
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await baCertificateRequest<{ url: string }>(
    admin,
    "/api/internal/admin/certificates/seal",
    {
      method: "POST",
      body: {
        contentType: file.type,
        dataBase64: buffer.toString("base64"),
      },
    }
  );
  if (!result.ok) return mapBaError(result);
  await createAuditLog({
    action: "ba_certificate_seal_upload",
    targetType: "ba_certificate",
    targetLabel: "signature-seal",
    actorType: "ADMIN",
    actorEmail: admin.email,
    actorName: admin.name,
    actorRole: admin.role,
    adminId: admin.id,
    detail: { size: file.size, type: file.type },
    request,
  }).catch((error) => apiConsole.error("[BaCertificateSeal] 审计写入失败", error));
  return NextResponse.json(
    { success: true, data: result.data },
    { headers: { "Cache-Control": "no-store" } }
  );
}

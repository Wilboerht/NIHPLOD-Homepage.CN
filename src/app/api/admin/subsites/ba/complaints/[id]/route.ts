import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkAdminRateLimit, verifyAuth } from "@/lib/auth";
import { canReadBaComplaints, hasAdminPermission, resolveBaRole } from "@/lib/admin-permissions";
import { baInternalRequest } from "@/lib/ba-internal";
import {
  mapBaError,
  type BaComplaintActionData,
  type BaComplaintDetailData,
} from "@/lib/ba-complaints";
import { createAuditLog } from "@/lib/audit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const statusSchema = z
  .object({
    status: z.enum(["INVESTIGATING", "RESOLVED", "REJECTED"]).optional(),
    review_note: z.string().max(2000).optional(),
  })
  .refine((data) => data.status !== undefined || data.review_note !== undefined, {
    message: "至少提供 status 或 review_note",
  });

function jsonError(code: string, message: string, status: number): NextResponse {
  return NextResponse.json(
    { success: false, error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

function actorFromAdmin(admin: {
  id: string;
  email: string;
  name: string;
  role: string;
  permissionOverrides?: string[] | null;
}) {
  return {
    id: admin.id,
    email: admin.email,
    name: admin.name,
    role: resolveBaRole(admin.role, admin.permissionOverrides) ?? admin.role,
  };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await verifyAuth(request);
  if (!admin) return jsonError("UNAUTHORIZED", "未授权管理员访问", 401);
  if (!canReadBaComplaints(admin)) {
    return jsonError("FORBIDDEN", "无权限查看 BA 举报", 403);
  }

  const rateLimitResponse = await checkAdminRateLimit(request, "admin-read", admin.id);
  if (rateLimitResponse) return rateLimitResponse;

  const { id } = await params;
  const includeSensitive = hasAdminPermission(admin, "ba:complaints:sensitive:read");
  const result = await baInternalRequest<BaComplaintDetailData>(
    `/api/internal/admin/complaints/${encodeURIComponent(id)}`,
    { query: { includeSensitive: includeSensitive ? "true" : "false" } }
  );
  if (!result.ok) return mapBaError(result);

  return NextResponse.json(
    {
      success: true,
      data: { ...result.data, sensitive: includeSensitive },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await verifyAuth(request);
  if (!admin) return jsonError("UNAUTHORIZED", "未授权管理员访问", 401);
  if (!hasAdminPermission(admin, "ba:complaints:write")) {
    return jsonError("FORBIDDEN", "无权限处理 BA 举报", 403);
  }

  const rateLimitResponse = await checkAdminRateLimit(request, "admin-write", admin.id);
  if (rateLimitResponse) return rateLimitResponse;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("INVALID_REQUEST", "请求体格式错误", 400);
  }
  const parsed = statusSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("INVALID_PARAMS", "状态或审核备注无效", 400);
  }

  const { id } = await params;
  const result = await baInternalRequest<BaComplaintActionData>(
    `/api/internal/admin/complaints/${encodeURIComponent(id)}/status`,
    {
      method: "POST",
      body: {
        status: parsed.data.status,
        review_note: parsed.data.review_note,
        actor: actorFromAdmin(admin),
      },
    }
  );
  if (!result.ok) return mapBaError(result);

  await createAuditLog({
    action: "ba_complaint_status_update",
    targetType: "ba_complaint",
    targetId: id,
    targetLabel: id,
    detail: {
      status: parsed.data.status ?? null,
      hasReviewNote: Boolean(parsed.data.review_note),
    },
    actorType: "ADMIN",
    actorEmail: admin.email,
    actorName: admin.name,
    actorRole: admin.role,
    adminId: admin.id,
    request,
  }).catch((error) => logger.error("[BAComplaint] 主站审计写入失败", { error: String(error) }));

  return NextResponse.json(
    { success: true, data: result.data },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await verifyAuth(request);
  if (!admin) return jsonError("UNAUTHORIZED", "未授权管理员访问", 401);
  if (!hasAdminPermission(admin, "ba:complaints:delete")) {
    return jsonError("FORBIDDEN", "无权限删除 BA 举报", 403);
  }

  const rateLimitResponse = await checkAdminRateLimit(request, "admin-write", admin.id);
  if (rateLimitResponse) return rateLimitResponse;

  const { id } = await params;
  const result = await baInternalRequest<{ id: string }>(
    `/api/internal/admin/complaints/${encodeURIComponent(id)}/delete`,
    {
      method: "POST",
      body: { actor: actorFromAdmin(admin) },
    }
  );
  if (!result.ok) return mapBaError(result);

  await createAuditLog({
    action: "ba_complaint_delete",
    targetType: "ba_complaint",
    targetId: id,
    targetLabel: id,
    detail: { softDeleted: true },
    reason: "soft_delete",
    actorType: "ADMIN",
    actorEmail: admin.email,
    actorName: admin.name,
    actorRole: admin.role,
    adminId: admin.id,
    request,
  }).catch((error) => logger.error("[BAComplaint] 主站审计写入失败", { error: String(error) }));

  return NextResponse.json(
    { success: true, data: result.data },
    { headers: { "Cache-Control": "no-store" } }
  );
}

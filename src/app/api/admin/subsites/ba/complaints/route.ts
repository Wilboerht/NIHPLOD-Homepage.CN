import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkAdminRateLimit, verifyAuth } from "@/lib/auth";
import { canReadBaComplaints } from "@/lib/admin-permissions";
import { baInternalRequest } from "@/lib/ba-internal";
import { mapBaError, type BaComplaintListData } from "@/lib/ba-complaints";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z
    .enum(["ALL", "PENDING", "INVESTIGATING", "RESOLVED", "REJECTED"])
    .default("ALL"),
  q: z.string().max(200).optional(),
});

function jsonError(code: string, message: string, status: number): NextResponse {
  return NextResponse.json(
    { success: false, error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

export async function GET(request: NextRequest) {
  const admin = await verifyAuth(request);
  if (!admin) {
    return jsonError("UNAUTHORIZED", "未授权管理员访问", 401);
  }
  if (!canReadBaComplaints(admin)) {
    return jsonError("FORBIDDEN", "无权限查看 BA 举报", 403);
  }

  const rateLimitResponse = await checkAdminRateLimit(request, "admin-read", admin.id);
  if (rateLimitResponse) return rateLimitResponse;

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    page: searchParams.get("page") ?? "1",
    pageSize: searchParams.get("pageSize") ?? "20",
    status: searchParams.get("status") ?? "ALL",
    q: searchParams.get("q") ?? undefined,
  });
  if (!parsed.success) {
    return jsonError("INVALID_PARAMS", "查询参数无效", 400);
  }

  const result = await baInternalRequest<BaComplaintListData>(
    "/api/internal/admin/complaints",
    {
      query: {
        page: parsed.data.page,
        pageSize: parsed.data.pageSize,
        status: parsed.data.status,
        q: parsed.data.q,
      },
    }
  );
  if (!result.ok) return mapBaError(result);

  return NextResponse.json(
    { success: true, data: result.data },
    { headers: { "Cache-Control": "no-store" } }
  );
}

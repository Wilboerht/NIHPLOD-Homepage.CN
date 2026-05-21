/**
 * 审计日志查询 API
 * GET /api/admin/audit-logs
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { listAuditLogs } from "@/lib/audit";
import { z } from "zod";
import { apiConsole } from "@/lib/logger";

const querySchema = z.object({
  page: z.preprocess((val) => (val ? Number(val) : 1), z.number().min(1)),
  pageSize: z.preprocess((val) => (val ? Number(val) : 20), z.number().min(1).max(100)),
  action: z.string().optional(),
  targetType: z.string().optional(),
  adminId: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const params = querySchema.parse({
      page: searchParams.get("page"),
      pageSize: searchParams.get("pageSize"),
      action: searchParams.get("action") || undefined,
      targetType: searchParams.get("targetType") || undefined,
      adminId: searchParams.get("adminId") || undefined,
      startDate: searchParams.get("startDate") || undefined,
      endDate: searchParams.get("endDate") || undefined,
    });

    const result = await listAuditLogs({
      page: params.page,
      pageSize: params.pageSize,
      action: params.action,
      targetType: params.targetType,
      adminId: params.adminId,
      startDate: params.startDate ? new Date(params.startDate) : undefined,
      endDate: params.endDate ? new Date(params.endDate) : undefined,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    apiConsole.error("[AuditLogs] GET 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "查询失败" } },
      { status: 500 }
    );
  }
}

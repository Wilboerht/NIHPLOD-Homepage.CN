/**
 * 管理端 SSO 审计日志查询 API
 * GET /api/admin/sso-audit
 *
 * 支持多维筛选：userId、clientId、event、success、startDate、endDate
 * 需要 admin 认证。
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiConsole } from "@/lib/logger";
import { z } from "zod";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  userId: z.string().optional(),
  clientId: z.string().optional(),
  event: z.string().optional(),
  success: z.enum(["true", "false"]).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export async function GET(request: NextRequest) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }

    const { searchParams } = request.nextUrl;
    const raw = Object.fromEntries(searchParams.entries());
    const parsed = querySchema.safeParse(raw);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: "参数错误", details: parsed.error.issues } },
        { status: 400 }
      );
    }

    const { userId, clientId, event, success, startDate, endDate, page, pageSize } = parsed.data;

    // 构建 where 条件
    const where: Record<string, unknown> = {};

    if (userId) where.userId = userId;
    if (clientId) where.clientId = clientId;
    if (event) where.event = event;
    if (success !== undefined) where.success = success === "true";

    if (startDate || endDate) {
      const createdAt: Record<string, Date> = {};
      if (startDate) createdAt.gte = new Date(startDate);
      if (endDate) createdAt.lte = new Date(endDate);
      where.createdAt = createdAt;
    }

    const [items, total] = await Promise.all([
      prisma.ssoAuditEvent.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: "desc" },
      }),
      prisma.ssoAuditEvent.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        items,
        pagination: { page, pageSize, total },
      },
    });
  } catch (error) {
    apiConsole.error("[AdminSsoAudit] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

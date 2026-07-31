/**
 * SSO 审计日志查询与导出 API
 * GET /api/admin/oauth/audit       — 多条件筛选分页
 * GET /api/admin/oauth/audit?export=csv — CSV 导出
 *
 * 权限：仅 owner 角色可操作
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

const EVENT_TYPES = [
  "authorize", "token", "introspect", "userinfo",
  "backchannel_logout", "consent", "status_change",
];

export async function GET(request: NextRequest) {
  try {
    const admin = await verifyAuth(request);
    if (!admin || admin.role !== "owner") {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "仅超级管理员可查看" } },
        { status: 403 }
      );
    }

    const { searchParams } = request.nextUrl;
    const isExport = searchParams.get("export") === "csv";

    const page = isExport ? 1 : Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = isExport ? 10000 : Math.min(parseInt(searchParams.get("pageSize") || "50", 10), 500);
    const event = searchParams.get("event") || undefined;
    const clientId = searchParams.get("clientId") || undefined;
    const userId = searchParams.get("userId") || undefined;
    const startDate = searchParams.get("startDate") || undefined;
    const endDate = searchParams.get("endDate") || undefined;
    const success = searchParams.get("success");

    const where: Record<string, unknown> = {};

    if (event && EVENT_TYPES.includes(event)) {
      where.event = event;
    }
    if (clientId) where.clientId = clientId;
    if (userId) where.userId = userId;
    if (success === "true") where.success = true;
    if (success === "false") where.success = false;

    if (startDate || endDate) {
      const createdAt: Record<string, Date> = {};
      if (startDate) createdAt.gte = new Date(startDate);
      if (endDate) createdAt.lte = new Date(endDate);
      where.createdAt = createdAt;
    }

    if (isExport) {
      // CSV 导出
      const items = await prisma.ssoAuditEvent.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 10000,
      });

      const escapeCSV = (val: string): string => {
        // 防公式注入：以 = + - @ 开头的单元格加单引号前缀
        const sanitized = /^[=+\-@]/.test(val) ? `'${val}` : val;
        // 包含逗号、双引号或换行时用双引号包裹
        if (/[",\n\r]/.test(sanitized)) {
          return `"${sanitized.replace(/"/g, '""')}"`;
        }
        return sanitized;
      };

      const csvHeaders = "id,event,userId,clientId,clientName,ip,success,createdAt\n";
      const csvRows = items.map((item) =>
        [
          escapeCSV(item.id),
          escapeCSV(item.event),
          escapeCSV(item.userId || ""),
          escapeCSV(item.clientId || ""),
          escapeCSV(item.clientName || ""),
          escapeCSV(item.ip || ""),
          String(item.success),
          item.createdAt.toISOString(),
        ].join(",")
      ).join("\n");

      return new NextResponse(csvHeaders + csvRows, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="sso-audit-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    const [items, total] = await Promise.all([
      prisma.ssoAuditEvent.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.ssoAuditEvent.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        items: items.map((item) => ({
          ...item,
          createdAt: item.createdAt.toISOString(),
        })),
        pagination: { page, pageSize, total },
      },
    });
  } catch (error) {
    apiConsole.error("[AdminOAuthAudit] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

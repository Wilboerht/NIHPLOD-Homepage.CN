/**
 * SSO 审计日志查询与导出 API
 * GET /api/admin/oauth/audit       — 多条件筛选分页
 * GET /api/admin/oauth/audit?export=csv — CSV 导出
 *
 * 权限：仅 owner 角色可操作
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { escapeCSV } from "@/lib/sso-audit";
import { maskPhone } from "@/lib/mask-phone";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

// 与 src/lib/sso-audit.ts 的 SsoEventType 保持一致（实际产生的事件全集）
const EVENT_TYPES = [
  "authorize",
  "token",
  "introspect",
  "userinfo",
  "backchannel_logout",
  "logout",
  "consent",
  "status_change",
];

export async function GET(request: NextRequest) {
  try {
    const rateLimitResponse = await checkAdminRateLimit(request);
    if (rateLimitResponse) return rateLimitResponse;

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
    const pageSize = isExport
      ? 5000
      : Math.min(parseInt(searchParams.get("pageSize") || "50", 10), 500);
    const event = searchParams.get("event") || undefined;
    const clientId = searchParams.get("clientId") || undefined;
    const userId = searchParams.get("userId") || undefined;
    const startDate = searchParams.get("startDate") || undefined;
    const endDate = searchParams.get("endDate") || undefined;
    const success = searchParams.get("success");

    const where: Record<string, unknown> = {};

    if (event) {
      // 不在白名单内的 event 参数直接拒绝，避免筛选条件被静默忽略造成误解
      if (!EVENT_TYPES.includes(event)) {
        return NextResponse.json(
          { success: false, error: { code: "INVALID_PARAMS", message: "不支持的事件类型" } },
          { status: 400 }
        );
      }
      where.event = event;
    }
    if (clientId) where.clientId = clientId;
    if (userId) where.userId = userId;
    if (success === "true") where.success = true;
    if (success === "false") where.success = false;

    if (startDate || endDate) {
      const createdAt: Record<string, Date> = {};
      if (startDate) createdAt.gte = new Date(startDate);
      if (endDate) {
        // endDate 为 YYYY-MM-DD 时按次日零点（不含）处理，避免漏掉当天事件
        const end = new Date(endDate);
        if (/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
          end.setUTCDate(end.getUTCDate() + 1);
        }
        createdAt.lt = end;
      }
      where.createdAt = createdAt;
    }

    if (isExport) {
      // CSV 导出
      const items = await prisma.ssoAuditEvent.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 5000,
      });

      const csvHeaders = "id,event,userId,clientId,clientName,ip,success,createdAt\n";
      const csvRows = items
        .map((item) =>
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
        )
        .join("\n");

      // 前置 BOM，防止 Excel 打开 UTF-8 CSV 时中文乱码
      return new NextResponse("\uFEFF" + csvHeaders + csvRows, {
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

    // 联表 User 取手机号并脱敏，供管理端列表展示（userId 为空或用户已删除时为 null）
    const userIds = [
      ...new Set(items.map((i) => i.userId).filter((id): id is string => !!id)),
    ];
    const users =
      userIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, phone: true },
          })
        : [];
    const phoneMap = new Map(users.map((u) => [u.id, u.phone ? maskPhone(u.phone) : null]));

    return NextResponse.json({
      success: true,
      data: {
        items: items.map((item) => ({
          ...item,
          userPhone: (item.userId && phoneMap.get(item.userId)) || null,
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

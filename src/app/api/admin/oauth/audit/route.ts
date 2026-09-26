/**
 * SSO 审计日志查询与导出 API
 * GET /api/admin/oauth/audit       — 多条件筛选分页
 * GET /api/admin/oauth/audit?export=csv — CSV 导出
 *
 * 权限：需 sso:read（查询与 CSV 导出同一权限点）
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";
import { escapeCSV } from "@/lib/sso-audit";
import { maskPhone } from "@/lib/mask-phone";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * 解析日期筛选参数并按 UTC+8 归一：
 * - YYYY-MM-DD：开始取当天 00:00:00（UTC+8），结束取次日 00:00:00（UTC+8，不含）
 * - 其他格式：按原值解析，非法返回 null
 */
function parseUtc8Boundary(value: string, isEnd: boolean): Date | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day + (isEnd ? 1 : 0), -8, 0, 0, 0));
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// 与 src/lib/sso-audit.ts 的 SsoEventType 保持一致（实际产生的事件全集）
const EVENT_TYPES = [
  "authorize",
  "token",
  "introspect",
  "userinfo",
  "backchannel_logout",
  "profile_webhook",
  "logout",
  "consent",
  "status_change",
];

export async function GET(request: NextRequest) {
  try {
    // 先鉴权后限流：未认证请求不消耗已登录管理员共用的限流桶
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request, "admin-read");
    if (rateLimitResponse) return rateLimitResponse;
    if (!hasAdminPermission(admin, "sso:read")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：SSO 审计查看" } },
        { status: 403 }
      );
    }

    const { searchParams } = request.nextUrl;
    const isExport = searchParams.get("export") === "csv";

    // 分页参数：parseInt 可能得到 NaN（Math.max/min 对 NaN 仍返回 NaN），
    // 必须先经 Number.isFinite 校验再钳制到合法范围
    const rawPage = parseInt(searchParams.get("page") || "1", 10);
    const page = isExport ? 1 : Number.isFinite(rawPage) ? Math.max(1, rawPage) : 1;
    const rawPageSize = parseInt(searchParams.get("pageSize") || "50", 10);
    const pageSize = isExport
      ? 5000
      : Number.isFinite(rawPageSize)
        ? Math.min(Math.max(1, rawPageSize), 500)
        : 50;
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
      if (startDate) {
        const start = parseUtc8Boundary(startDate, false);
        if (!start) {
          return NextResponse.json(
            { success: false, error: { code: "INVALID_PARAMS", message: "开始日期格式错误" } },
            { status: 400 }
          );
        }
        createdAt.gte = start;
      }
      if (endDate) {
        // endDate 为 YYYY-MM-DD 时按「UTC+8 次日零点（不含）」处理，覆盖当天全部事件
        const end = parseUtc8Boundary(endDate, true);
        if (!end) {
          return NextResponse.json(
            { success: false, error: { code: "INVALID_PARAMS", message: "结束日期格式错误" } },
            { status: 400 }
          );
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

      // 导出行为本身留痕：导出内容含 userId/IP 等敏感字段
      await createAuditLog({
        action: "sso_audit_export",
        targetType: "system",
        targetId: "sso_audit_csv",
        detail: {
          filters: { event, clientId, userId, startDate, endDate, success },
          exportedCount: items.length,
        },
        adminId: admin.id,
        request,
      });

      // 前置 BOM，防止 Excel 打开 UTF-8 CSV 时中文乱码
      return new NextResponse("\uFEFF" + csvHeaders + csvRows, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="sso-audit-${new Date().toISOString().slice(0, 10)}.csv"`,
          // 导出含 userId/IP 等敏感字段：禁止浏览器与中间缓存留存
          "Cache-Control": "no-store, no-cache, must-revalidate",
          Pragma: "no-cache",
          "X-Content-Type-Options": "nosniff",
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

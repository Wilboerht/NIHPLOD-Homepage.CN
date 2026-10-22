/**
 * 管理端用户列表 API
 * GET /api/admin/users
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import { z } from "zod";
import { apiConsole } from "@/lib/logger";
import { maskPhone } from "@/lib/mask-phone";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { escapeCSV } from "@/lib/csv";
import { beginAuditLog, finishAuditLog } from "@/lib/audit";

const querySchema = z.object({
  page: z.preprocess((val) => (val ? Number(val) : 1), z.number().min(1).max(1000)),
  pageSize: z.preprocess((val) => (val ? Number(val) : 20), z.number().min(1).max(100)),
  search: z.string().max(100).nullish(),
  status: z.enum(["ACTIVE", "SUSPENDED", "BANNED", "DELETED"]).nullish(),
  level: z.enum(["REGULAR", "SILVER", "GOLD", "DIAMOND"]).nullish(),
});

// 强制动态渲染，禁止静态预渲染
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

    if (!hasAdminPermission(admin, "users:read")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：用户查看" } },
        { status: 403 }
      );
    }

    // 速率限制：防止用户列表被高频爬取（含手机号等 PII）
    const ip = getClientIP(request);
    const limitResult = await rateLimit(ip, "default", { maxRequests: 60, windowMs: 60 * 1000 });
    if (!limitResult.success) {
      return NextResponse.json(
        { success: false, error: { code: "RATE_LIMITED", message: "请求过于频繁，请稍后再试" } },
        { status: 429 }
      );
    }

    const { searchParams } = new URL(request.url);
    const params = querySchema.parse({
      page: searchParams.get("page"),
      pageSize: searchParams.get("pageSize"),
      search: searchParams.get("search"),
      status: searchParams.get("status"),
      level: searchParams.get("level"),
    });
    const isExport = searchParams.get("export") === "csv";

    // 构建查询条件
    const where: Record<string, unknown> = {};

    if (params.search) {
      where.OR = [
        { id: { equals: params.search } },
        // 手机号仅精确匹配：模糊匹配（contains）会让无敏感权限的角色逐位穷举还原完整手机号
        { phone: { equals: params.search } },
        { nickname: { contains: params.search, mode: "insensitive" } },
      ];
    }

    if (params.status) {
      where.status = params.status;
    }

    if (params.level) {
      where.membershipLevel = params.level;
    }

    // 查询用户
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip: isExport ? undefined : (params.page - 1) * params.pageSize,
        take: isExport ? 10000 : params.pageSize,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          phone: true,
          phoneVerified: true,
          nickname: true,
          avatar: true,
          status: true,
          membershipLevel: true,
          createdAt: true,
        },
      }),
      prisma.user.count({ where }),
    ]);

    // CSV 导出（按当前筛选条件）
    if (isExport) {
      const csvHeaders = "手机号,昵称,状态,会员等级,注册时间\n";
      const csvRows = users
        .map((user) =>
          [
            escapeCSV(maskPhone(user.phone)),
            escapeCSV(user.nickname || ""),
            escapeCSV(user.status),
            escapeCSV(user.membershipLevel),
            user.createdAt.toISOString(),
          ].join(",")
        )
        .join("\n");

      // 导出审计：记录筛选条件与导出条数（search 可能为完整手机号，统一脱敏）
      const auditDetail = {
        search: params.search ? maskPhone(params.search) : null,
        status: params.status ?? null,
        level: params.level ?? null,
        exportedCount: users.length,
      };
      const auditId = await beginAuditLog({
        action: "user_export",
        targetType: "user",
        detail: auditDetail,
        adminId: admin.id,
        request,
      });
      if (!auditId) {
        return NextResponse.json(
          {
            success: false,
            error: { code: "AUDIT_UNAVAILABLE", message: "审计服务不可用，已拒绝导出" },
          },
          { status: 503 }
        );
      }
      await finishAuditLog(auditId, "SUCCESS", auditDetail);

      return new NextResponse(csvHeaders + csvRows, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="users-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        users: users.map((user) => ({
          ...user,
          phone: maskPhone(user.phone),
          createdAt: user.createdAt.toISOString(),
        })),
        pagination: {
          page: params.page,
          pageSize: params.pageSize,
          total,
          totalPages: Math.ceil(total / params.pageSize),
        },
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "VALIDATION_ERROR", message: "参数错误", details: error.issues },
        },
        { status: 400 }
      );
    }
    apiConsole.error("[AdminUsers] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

/**
 * 批量修改用户状态（冻结/封禁/恢复正常）
 * POST /api/admin/users
 * Body: { ids: string[], status: "ACTIVE" | "SUSPENDED" | "BANNED" }
 * 需要 users:write 权限（涉及用户权益）
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }
    if (!hasAdminPermission(admin, "users:write")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：用户状态变更" } },
        { status: 403 }
      );
    }

    const { validateCSRFToken, csrfForbiddenResponse } = await import("@/lib/csrf");
    if (!validateCSRFToken(request)) {
      return csrfForbiddenResponse();
    }

    const rateLimitResponse = await checkAdminRateLimit(request);
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json();
    const parsed = z
      .object({
        ids: z.array(z.string().min(1)).min(1).max(200),
        status: z.enum(["ACTIVE", "SUSPENDED", "BANNED"]),
      })
      .safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: "参数错误" } },
        { status: 400 }
      );
    }

    const { ids, status } = parsed.data;

    // 批量与单个端点共用同一套级联逻辑（cascadeUserStatusChange）：
    // 冻结/封禁时撤销 Refresh Token + access token 黑名单 + OAuth 会话 + backchannel logout + webhook；
    // 解封时移出黑名单。逐个用户级联（量小，ids ≤ 200），外部通知失败不阻断整体流程。
    const targets = await prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, status: true },
    });
    // 跳过状态未变化的用户，避免无效的级联与审计噪音
    const toChange = targets.filter((u) => u.status !== status && u.status !== "DELETED");
    const skippedDeleted = targets.filter((u) => u.status === "DELETED").length;
    const changedIds: string[] = [];

    const auditId = await beginAuditLog({
      action: "user_status_change",
      targetType: "user",
      targetId: ids[0],
      detail: { ids, status, count: 0, skippedDeleted },
      actorType: "ADMIN",
      actorEmail: admin.email,
      actorName: admin.name,
      actorRole: admin.role,
      authMethod: "session",
      adminId: admin.id,
      request,
    });
    if (!auditId) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "AUDIT_UNAVAILABLE", message: "审计服务不可用，已拒绝操作" },
        },
        { status: 503 }
      );
    }

    if (toChange.length > 0) {
      try {
        const { changeUserStatus } = await import("@/lib/user-status");
        const { recordSsoEvent } = await import("@/lib/sso-audit");
        for (const u of toChange) {
          // 每用户独立事务：状态 + token 撤销原子；单个失败不会留下半改状态
          const result = await changeUserStatus({
            userId: u.id,
            expectedStatus: u.status,
            newStatus: status,
          });
          if (!result.changed) continue; // 并发修改，跳过
          changedIds.push(u.id);
          // SSO 审计：每个实际变更的用户一条（合规敏感，与单个端点一致同步等待写入）
          await recordSsoEvent({
            event: "status_change",
            userId: u.id,
            ip: getClientIP(request),
            success: true,
            detail: {
              action:
                status === "ACTIVE"
                  ? "user_unbanned"
                  : status === "SUSPENDED"
                    ? "user_suspended"
                    : "user_banned",
              previousStatus: u.status,
              newStatus: status,
              adminId: admin.id,
              batch: true,
            },
          });
        }
      } catch (error) {
        await finishAuditLog(auditId, "FAILURE", { ids, status });
        throw error;
      }
    }

    await finishAuditLog(auditId, "SUCCESS", {
      ids,
      status,
      count: changedIds.length,
      skippedDeleted,
    });

    return NextResponse.json({
      success: true,
      data: { updated: changedIds.length, skippedDeleted },
    });
  } catch (error) {
    apiConsole.error("[AdminUsersBatch] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

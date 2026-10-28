import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { requireAdminStepUp } from "@/lib/admin-totp";
import { validateCUID, invalidIdResponse } from "@/lib/validation";
import { advisorRequest } from "@/lib/advisor-internal";
import { beginAuditLog, createAuditLogStrict, finishAuditLog } from "@/lib/audit";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { apiConsole } from "@/lib/logger";
import type {
  AdvisorOverviewDegradedReason,
  AdvisorOverviewPayload,
  AdvisorUserOverview,
  AdvisorUserUpdateResult,
} from "@/types/advisor-user";

type RouteContext = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

const OVERVIEW_PATH = "/api/internal/admin/user-overview";
const OVERVIEW_TIMEOUT_MS = 3000;
const VIEW_AUDIT_WINDOW_MS = 5 * 60 * 1000;

const UPDATE_PATH = "/api/internal/admin/user";
const UPDATE_TIMEOUT_MS = 5000;

const updateSchema = z
  .object({
    dailyTestLimit: z.number().int().min(0).max(9999).optional(),
    role: z.enum(["user", "disabled"]).optional(),
  })
  .refine((data) => data.dailyTestLimit !== undefined || data.role !== undefined, {
    message: "未提供可更新的字段",
  });

function mapDegradedReason(code: string, status: number): AdvisorOverviewDegradedReason {
  if (code === "NOT_CONFIGURED") return "not_configured";
  if (code === "UNAUTHORIZED") return "unauthorized";
  if (status === 429) return "rate_limited";
  return "upstream_error";
}

function mapWriteError(result: { status: number; code: string; message: string }): {
  status: number;
  code: string;
  message: string;
} {
  if (result.status === 400) {
    return { status: 400, code: "INVALID_PARAMS", message: result.message };
  }
  if (result.status === 404) {
    return { status: 404, code: "NOT_FOUND", message: "该用户尚未开通测肤，无法修改" };
  }
  if (result.status === 429) {
    return { status: 429, code: "RATE_LIMITED", message: "操作过于频繁，请稍后重试" };
  }
  return {
    status: 502,
    code: "UPSTREAM_ERROR",
    message: "测肤子站暂时不可用，请稍后重试",
  };
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }

    if (
      !hasAdminPermission(admin, "users:read") ||
      !hasAdminPermission(admin, "advisor:users:read")
    ) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：用户测肤档案查看" } },
        { status: 403 }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request, "advisor-user:read");
    if (rateLimitResponse) return rateLimitResponse;

    const { id } = await context.params;
    if (!validateCUID(id)) return invalidIdResponse();

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, membershipLevel: true, totalSpent: true },
    });
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "用户不存在" } },
        { status: 404 }
      );
    }

    const result = await advisorRequest<{
      success?: boolean;
      data?: AdvisorUserOverview;
    }>(OVERVIEW_PATH, {
      query: {
        userId: user.id,
        level: user.membershipLevel,
        totalSpent: user.totalSpent,
      },
      // 测肤档案属敏感读取，强制绑定 query 签名，防止 userId 被改写
      signQuery: true,
      timeoutMs: OVERVIEW_TIMEOUT_MS,
    });

    if (!result.ok) {
      apiConsole.warn("[AdminUserAdvisor] 测肤子站不可用", {
        userId: id,
        code: result.code,
        status: result.status,
      });
      const payload: AdvisorOverviewPayload = {
        overview: null,
        degraded: true,
        reason: mapDegradedReason(result.code, result.status),
      };
      return NextResponse.json({ success: true, data: payload });
    }

    const overview = result.data?.data ?? null;
    if (!overview) {
      apiConsole.warn("[AdminUserAdvisor] 子站返回结构异常", { userId: id });
      const payload: AdvisorOverviewPayload = {
        overview: null,
        degraded: true,
        reason: "upstream_error",
      };
      return NextResponse.json({ success: true, data: payload });
    }

    if (overview.account) {
      const recentView = await prisma.auditLog.findFirst({
        where: {
          action: "advisor_user_view",
          targetType: "user",
          targetId: id,
          adminId: admin.id,
          createdAt: { gte: new Date(Date.now() - VIEW_AUDIT_WINDOW_MS) },
        },
        select: { id: true },
      });
      if (!recentView) {
        await createAuditLogStrict({
          action: "advisor_user_view",
          targetType: "user",
          targetId: id,
          detail: { subsite: "advisor" },
          adminId: admin.id,
          request,
        });
      }
    }

    const payload: AdvisorOverviewPayload = { overview, degraded: false };
    return NextResponse.json({ success: true, data: payload });
  } catch (error) {
    apiConsole.error("[AdminUserAdvisor] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  if (!validateCSRFToken(request)) {
    return csrfForbiddenResponse();
  }

  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }

    if (
      !hasAdminPermission(admin, "users:read") ||
      !hasAdminPermission(admin, "advisor:users:write")
    ) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：用户测肤权限修改" } },
        { status: 403 }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request, "advisor-user:write");
    if (rateLimitResponse) return rateLimitResponse;

    const stepUpResponse = await requireAdminStepUp(request, admin);
    if (stepUpResponse) return stepUpResponse;

    const { id } = await context.params;
    if (!validateCUID(id)) return invalidIdResponse();

    const body = await request.json().catch(() => null);
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: "参数错误" } },
        { status: 400 }
      );
    }
    const patch = parsed.data;

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "用户不存在" } },
        { status: 404 }
      );
    }
    if (user.status === "DELETED") {
      return NextResponse.json(
        { success: false, error: { code: "USER_DELETED", message: "该用户已注销，不可修改" } },
        { status: 409 }
      );
    }
    if (patch.role === "user" && user.status !== "ACTIVE") {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "MAIN_ACCOUNT_INACTIVE",
            message: "主站账号状态非正常，不能启用测肤子站账号",
          },
        },
        { status: 409 }
      );
    }

    const auditId = await beginAuditLog({
      action: "advisor_user_update",
      targetType: "user",
      targetId: id,
      detail: {
        subsite: "advisor",
        patch: {
          dailyTestLimit: patch.dailyTestLimit ?? null,
          role: patch.role ?? null,
        },
      },
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

    const result = await advisorRequest<{
      success?: boolean;
      data?: AdvisorUserUpdateResult;
    }>(UPDATE_PATH, {
      method: "PATCH",
      query: { userId: id },
      body: {
        patch,
        operator: {
          id: admin.id,
          email: admin.email,
          name: admin.name,
        },
        mainAuditId: auditId,
      },
      // 写操作强制绑定 query 签名，防止请求被改写到其他 userId
      signQuery: true,
      timeoutMs: UPDATE_TIMEOUT_MS,
    });

    if (!result.ok) {
      await finishAuditLog(auditId, "FAILURE", {
        code: result.code,
        status: result.status,
        patch: {
          dailyTestLimit: patch.dailyTestLimit ?? null,
          role: patch.role ?? null,
        },
      });
      const mapped = mapWriteError(result);
      return NextResponse.json(
        { success: false, error: { code: mapped.code, message: mapped.message } },
        { status: mapped.status }
      );
    }

    const data = result.data?.data;
    if (!data?.previous || !data?.current) {
      await finishAuditLog(auditId, "FAILURE", { reason: "INVALID_UPSTREAM_RESPONSE" });
      return NextResponse.json(
        { success: false, error: { code: "UPSTREAM_ERROR", message: "测肤子站返回异常" } },
        { status: 502 }
      );
    }

    await finishAuditLog(auditId, "SUCCESS", {
      previous: {
        role: data.previous.role,
        dailyTestLimit: data.previous.dailyTestLimit,
      },
      current: {
        role: data.current.role,
        dailyTestLimit: data.current.dailyTestLimit,
      },
      changed: data.changed,
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    apiConsole.error("[AdminUserAdvisorUpdate] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { validateCUID, invalidIdResponse } from "@/lib/validation";
import { advisorRequest } from "@/lib/advisor-internal";
import { createAuditLogStrict } from "@/lib/audit";
import { apiConsole } from "@/lib/logger";
import type { AdvisorReportDetail } from "@/types/advisor-report";

type RouteContext = { params: Promise<{ id: string; sessionId: string }> };

export const dynamic = "force-dynamic";

const DETAIL_PATH = "/api/internal/admin/user-report";
const DETAIL_TIMEOUT_MS = 6000;
const SESSION_ID_RE = /^[0-9A-Za-z-]{8,128}$/;

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
      !hasAdminPermission(admin, "advisor:report:read")
    ) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：完整测肤报告" } },
        { status: 403 }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request, "advisor-report:read");
    if (rateLimitResponse) return rateLimitResponse;

    const { id, sessionId } = await context.params;
    if (!validateCUID(id)) return invalidIdResponse();
    if (!SESSION_ID_RE.test(sessionId)) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: "报告 ID 无效" } },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "用户不存在" } },
        { status: 404 }
      );
    }

    const result = await advisorRequest<{
      success?: boolean;
      data?: AdvisorReportDetail;
    }>(DETAIL_PATH, {
      query: { userId: id, sessionId },
      signQuery: true,
      timeoutMs: DETAIL_TIMEOUT_MS,
    });

    if (!result.ok) {
      apiConsole.warn("[AdminAdvisorReport] 详情获取失败", {
        userId: id,
        sessionId,
        code: result.code,
        status: result.status,
      });
      const status = result.status === 404 ? 404 : result.status === 429 ? 429 : 502;
      return NextResponse.json(
        {
          success: false,
          error: {
            code: status === 404 ? "NOT_FOUND" : status === 429 ? "RATE_LIMITED" : "UPSTREAM_ERROR",
            message:
              status === 404
                ? "报告不存在或已归档"
                : status === 429
                  ? "请求过于频繁，请稍后重试"
                  : "测肤子站暂时不可用，请稍后重试",
          },
        },
        { status }
      );
    }

    const data = result.data?.data;
    if (!data || data.sessionId !== sessionId) {
      apiConsole.warn("[AdminAdvisorReport] 详情结构异常", { userId: id, sessionId });
      return NextResponse.json(
        { success: false, error: { code: "UPSTREAM_ERROR", message: "测肤子站返回异常" } },
        { status: 502 }
      );
    }

    await createAuditLogStrict({
      action: "advisor_report_view",
      targetType: "user",
      targetId: id,
      detail: {
        subsite: "advisor",
        sessionId,
        reportVersion: data.result?.reportVersion ?? null,
      },
      adminId: admin.id,
      request,
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    apiConsole.error("[AdminAdvisorReport] 详情异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

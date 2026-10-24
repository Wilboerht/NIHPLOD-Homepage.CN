import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { validateCUID, invalidIdResponse } from "@/lib/validation";
import { advisorRequest } from "@/lib/advisor-internal";
import { apiConsole } from "@/lib/logger";
import type { AdvisorReportListPayload } from "@/types/advisor-report";

type RouteContext = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

const LIST_PATH = "/api/internal/admin/user-reports";
const LIST_TIMEOUT_MS = 5000;

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

    const rateLimitResponse = await checkAdminRateLimit(request, "advisor-report:list");
    if (rateLimitResponse) return rateLimitResponse;

    const { id } = await context.params;
    if (!validateCUID(id)) return invalidIdResponse();

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

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const limit = Math.min(
      50,
      Math.max(1, parseInt(searchParams.get("limit") || "10", 10) || 10)
    );

    const result = await advisorRequest<{
      success?: boolean;
      data?: AdvisorReportListPayload;
    }>(LIST_PATH, {
      query: { userId: id, page, limit },
      signQuery: true,
      timeoutMs: LIST_TIMEOUT_MS,
    });

    if (!result.ok) {
      apiConsole.warn("[AdminAdvisorReports] 列表获取失败", {
        userId: id,
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
                ? "用户报告不存在"
                : status === 429
                  ? "请求过于频繁，请稍后重试"
                  : "测肤子站暂时不可用，请稍后重试",
          },
        },
        { status }
      );
    }

    const data = result.data?.data;
    if (!data || !Array.isArray(data.reports) || !data.pagination) {
      apiConsole.warn("[AdminAdvisorReports] 列表结构异常", { userId: id });
      return NextResponse.json(
        { success: false, error: { code: "UPSTREAM_ERROR", message: "测肤子站返回异常" } },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    apiConsole.error("[AdminAdvisorReports] 列表异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

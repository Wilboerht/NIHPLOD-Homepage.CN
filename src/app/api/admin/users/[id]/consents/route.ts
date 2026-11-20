import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { canReadBaComplaints, hasAdminPermission } from "@/lib/admin-permissions";
import { validateCUID, invalidIdResponse } from "@/lib/validation";
import { createAuditLogStrict } from "@/lib/audit";
import { apiConsole } from "@/lib/logger";
import { buildUserConsentOverview } from "@/lib/user-consent-overview";

type RouteContext = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: RouteContext) {
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

    const rateLimitResponse = await checkAdminRateLimit(request, "user:consent:read");
    if (rateLimitResponse) return rateLimitResponse;

    const { id } = await context.params;
    if (!validateCUID(id)) return invalidIdResponse();

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, phone: true },
    });
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "用户不存在" } },
        { status: 404 }
      );
    }

    const overview = await buildUserConsentOverview({
      userId: user.id,
      phone: user.phone,
      canReadSkin: hasAdminPermission(admin, "advisor:users:read"),
      canReadBa: canReadBaComplaints(admin),
    });

    {
      try {
        await createAuditLogStrict({
          action: "user_consent_view",
          targetType: "user",
          targetId: id,
          detail: {
            projects: overview.projects.map((project) => ({
              key: project.key,
              overall: project.overall,
            })),
          },
          adminId: admin.id,
          request,
        });
      } catch (error) {
        apiConsole.error("[AdminUserConsent] 审计写入失败，拒绝返回授权状态:", error);
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "AUDIT_UNAVAILABLE",
              message: "审计日志不可用，已拒绝查看授权状态",
            },
          },
          { status: 503, headers: { "Cache-Control": "no-store" } }
        );
      }
    }

    return NextResponse.json(
      { success: true, data: overview },
      { headers: { "Cache-Control": "no-store, private", Pragma: "no-cache" } }
    );
  } catch (error) {
    apiConsole.error("[AdminUserConsent] 查询失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

/**
 * 管理员历史邮箱
 * GET /api/admin/admins/:id/email-history
 */
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, checkAdminRateLimit } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { apiConsole } from "@/lib/logger";
import { validateCUID, invalidIdResponse } from "@/lib/validation";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, private",
  Pragma: "no-cache",
} as const;

export const GET = withAuth(
  async (request, admin, { params }: { params: Promise<{ id: string }> }) => {
    try {
      if (!hasAdminPermission(admin, "admins:read")) {
        return NextResponse.json(
          { success: false, error: { code: "FORBIDDEN", message: "权限不足：管理员查看" } },
          { status: 403, headers: NO_STORE_HEADERS }
        );
      }

      const rateLimitResponse = await checkAdminRateLimit(request, "admin-read");
      if (rateLimitResponse) return rateLimitResponse;

      const { id } = await params;
      if (!validateCUID(id)) return invalidIdResponse();

      const history = await prisma.adminEmailHistory.findMany({
        where: { adminId: id },
        orderBy: { changedAt: "desc" },
        take: 50,
        select: { id: true, email: true, changedAt: true, changedBy: true, reason: true },
      });

      return NextResponse.json(
        {
          success: true,
          data: {
            history: history.map((item) => ({
              ...item,
              changedAt: item.changedAt.toISOString(),
            })),
          },
        },
        { headers: NO_STORE_HEADERS }
      );
    } catch (error) {
      apiConsole.error("[AdminAdmins] email-history GET 异常:", error);
      return NextResponse.json(
        { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
        { status: 500, headers: NO_STORE_HEADERS }
      );
    }
  }
);

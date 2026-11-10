import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { validateCUID, invalidIdResponse } from "@/lib/validation";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
    }
    if (!hasAdminPermission(admin, "users:delete")) {
      return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });
    }
    const limited = await checkAdminRateLimit(request, "user:delete-preflight", admin.id);
    if (limited) return limited;
    const { id } = await context.params;
    if (!validateCUID(id)) return invalidIdResponse();

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, phone: true, status: true, totalSpent: true },
    });
    if (!user) {
      return NextResponse.json({ success: false, error: { code: "NOT_FOUND" } }, { status: 404 });
    }

    const [
      balance,
      pendingRedemptions,
      activeAfterSales,
      externalIdentities,
      contactMessages,
      jobApplications,
    ] = await Promise.all([
      prisma.pointBalance.findUnique({ where: { userId: id }, select: { available: true } }),
      prisma.pointRedemption.count({ where: { userId: id, status: "PENDING" } }),
      prisma.pointRedemption.count({
        where: {
          userId: id,
          status: { in: ["AFTER_SALES_REQUESTED", "AFTER_SALES_APPROVED", "RETURNING", "RETURNED"] },
        },
      }),
      prisma.externalIdentity.count({ where: { userId: id } }),
      prisma.contactMessage.count({ where: { phone: user.phone } }),
      prisma.jobApplication.count({ where: { phone: user.phone } }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        userId: id,
        status: user.status,
        totalSpent: user.totalSpent,
        pointsAvailable: balance?.available ?? 0,
        pendingRedemptions,
        activeAfterSales,
        externalIdentities,
        independentRecords: {
          contactMessages,
          jobApplications,
          note: "这些记录仅按手机号提示数量，注销账号不会自动删除，需按对应模块保留政策另行处理。",
        },
      },
    }, { headers: { "Cache-Control": "no-store, private" } });
  } catch (error) {
    apiConsole.error("[AdminUserDeletePreflight] 查询失败:", error);
    return NextResponse.json({ success: false, error: { code: "INTERNAL_ERROR" } }, { status: 500 });
  }
}

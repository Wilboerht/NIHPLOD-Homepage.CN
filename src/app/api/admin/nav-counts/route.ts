import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/nav-counts
 * 管理端侧边栏待处理数量：只返回当前管理员有权查看的模块。
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request, "admin-read", admin.id);
    if (rateLimitResponse) return rateLimitResponse;

    const canReadMessages = hasAdminPermission(admin, "messages:read");
    const canReadUsers = hasAdminPermission(admin, "users:read");
    const canReadSpent = hasAdminPermission(admin, "spent:read");
    const canReadRedemptions = hasAdminPermission(admin, "redemptions:read");
    const canReadApplications = hasAdminPermission(admin, "applications:read");
    const canReviewApprovals = hasAdminPermission(admin, "approvals:review");
    const canRequestApprovals = hasAdminPermission(admin, "approvals:request");

    const [
      messages,
      accountDeletions,
      spentAdjustments,
      pointRedemptions,
      applications,
      approvals,
    ] = await Promise.all([
      canReadMessages ? prisma.contactMessage.count({ where: { read: false } }) : 0,
      canReadUsers
        ? prisma.accountDeletionRequest.count({ where: { status: "FAILED" } })
        : 0,
      canReadSpent
        ? prisma.spentAdjustmentApplication.count({ where: { status: "PENDING" } })
        : 0,
      canReadRedemptions
        ? prisma.pointRedemption.count({ where: { status: "PENDING" } })
        : 0,
      canReadApplications
        ? prisma.jobApplication.count({ where: { status: "pending" } })
        : 0,
      canReviewApprovals || canRequestApprovals
        ? prisma.adminApprovalRequest.count({
            where: canReviewApprovals
              ? { status: "PENDING", expiresAt: { gt: new Date() } }
              : {
                  requesterId: admin.id,
                  expiresAt: { gt: new Date() },
                  OR: [
                    { status: "PENDING" },
                    { status: "APPROVED", executionMode: "REQUESTER" },
                  ],
                },
          })
        : 0,
    ]);

    return NextResponse.json({
      success: true,
      data: {
        messages,
        accountDeletions,
        spentAdjustments,
        pointRedemptions,
        applications,
        approvals,
      },
    });
  } catch (error) {
    apiConsole.error("[AdminNavCounts] 查询失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "查询失败" } },
      { status: 500 }
    );
  }
}

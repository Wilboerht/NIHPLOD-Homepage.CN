import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { baInternalRequest } from "@/lib/ba-internal";
import type { BaComplaintListData } from "@/lib/ba-complaints";
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
const canReadAfterSales = hasAdminPermission(admin, "redemptions:after-sales");
const canReadApplications = hasAdminPermission(admin, "applications:read");
const canReviewApprovals = hasAdminPermission(admin, "approvals:review");
const canRequestApprovals = hasAdminPermission(admin, "approvals:request");
const canReadBaComplaints =
  hasAdminPermission(admin, "ba:complaints:read") ||
  hasAdminPermission(admin, "ba:complaints:write") ||
  hasAdminPermission(admin, "ba:complaints:delete") ||
  hasAdminPermission(admin, "ba:complaints:sensitive:read");
const canReadDeletionFailures = hasAdminPermission(admin, "users:security:write");
const canReadWebhooks = hasAdminPermission(admin, "webhooks:read");
const canReadCron = hasAdminPermission(admin, "cron:read");
const now = new Date();
const expiringBefore = new Date(now.getTime() + 24 * 60 * 60 * 1000);

const [
  messages,
  baComplaints,
  accountDeletions,
  spentAdjustments,
  pointRedemptions,
  redemptionAfterSales,
  applications,
  approvals,
  approvalsExpiringSoon,
  deletionFailures,
  webhookFailures,
  cronFailures,
] = await Promise.all([
  canReadMessages ? prisma.contactMessage.count({ where: { read: false } }) : 0,
  canReadBaComplaints
    ? baInternalRequest<BaComplaintListData>("/api/internal/admin/complaints", {
        query: { page: 1, pageSize: 1, status: "PENDING" },
        timeoutMs: 2000,
      })
        .then((result) => (result.ok ? result.data.total : 0))
        .catch(() => 0)
    : 0,
  canReadUsers ? prisma.accountDeletionRequest.count({ where: { status: "FAILED" } }) : 0,
  canReadSpent ? prisma.spentAdjustmentApplication.count({ where: { status: "PENDING" } }) : 0,
  canReadRedemptions ? prisma.pointRedemption.count({ where: { status: "PENDING" } }) : 0,
  canReadAfterSales
    ? prisma.pointRedemption.count({
        where: { status: { in: ["AFTER_SALES_REQUESTED", "RETURNING", "RETURNED"] } },
      })
    : 0,
  canReadApplications ? prisma.jobApplication.count({ where: { status: "pending" } }) : 0,
  canReviewApprovals || canRequestApprovals
    ? prisma.adminApprovalRequest.count({
        where: canReviewApprovals
          ? { status: "PENDING", expiresAt: { gt: now } }
          : {
              requesterId: admin.id,
              expiresAt: { gt: now },
              OR: [{ status: "PENDING" }, { status: "APPROVED", executionMode: "REQUESTER" }],
            },
      })
    : 0,
  canReviewApprovals
    ? prisma.adminApprovalRequest.count({
        where: { status: "PENDING", expiresAt: { gt: now, lte: expiringBefore } },
      })
    : 0,
  canReadDeletionFailures
    ? prisma.accountDeletionRequest.count({ where: { status: "FAILED" } })
    : 0,
  canReadWebhooks
    ? Promise.all([
        prisma.webhookDeliveryFailure.count(),
        prisma.backchannelLogoutFailure.count(),
      ]).then(([webhook, backchannel]) => webhook + backchannel)
    : 0,
  canReadCron
    ? prisma.cronTaskRun.count({
        where: {
          startedAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
          OR: [
            { status: { in: ["FAILED", "TIMEOUT"] } },
            { status: null, success: false },
          ],
        },
      })
    : 0,
]);

const systemAlerts = [
  {
    key: "account-deletions",
    label: "注销执行失败",
    count: deletionFailures,
    href: "/admin/account-deletions",
  },
  {
    key: "webhooks",
    label: "通知投递失败",
    count: webhookFailures,
    href: "/admin/webhook-failures",
  },
  {
    key: "cron",
    label: "定时任务失败",
    count: cronFailures,
    href: "/admin/cron-tasks",
  },
  {
    key: "approvals-expiring",
    label: "审批即将过期",
    count: approvalsExpiringSoon,
    href: "/admin/approvals?status=PENDING&expiring=1",
  },
].filter((alert) => alert.count > 0);

return NextResponse.json({
  success: true,
  data: {
    messages,
    baComplaints,
    accountDeletions,
    spentAdjustments,
    pointRedemptions,
    redemptionAfterSales,
    applications,
    approvals,
    systemAlerts,
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

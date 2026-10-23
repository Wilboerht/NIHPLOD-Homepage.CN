import { describe, expect, it } from "vitest";
import {
  buildAdminStatsData,
  type AdminStatsSnapshot,
  type RecentMessageRecord,
} from "@/lib/admin-stats-data";
import type { AdminUser } from "@/types/auth";

const admin = (role: AdminUser["role"]): AdminUser => ({
  id: "admin-1",
  email: "admin@example.com",
  name: "测试管理员",
  role,
});

const snapshot: AdminStatsSnapshot = {
  productsCount: 10,
  categoriesCount: 4,
  draftProductsCount: 2,
  jobsCount: 3,
  totalUsersCount: 100,
  newUsersTodayCount: 5,
  totalMessagesCount: 20,
  messagesTodayCount: 2,
  unreadMessagesCount: 4,
  unreadMessagesOldestAt: "2026-10-20T00:00:00.000Z",
  pendingSpentAdjustmentsCount: 6,
  pendingSpentAmount: 1200,
  pendingSpentAdjustmentsOldestAt: "2026-10-21T00:00:00.000Z",
  pendingRedemptionsCount: 2,
  pendingRedemptionsOldestAt: "2026-10-22T00:00:00.000Z",
  pendingApplicationsCount: 3,
  pendingApplicationsOldestAt: "2026-10-22T01:00:00.000Z",
  newApplicationsThisWeekCount: 9,
  failedAccountDeletionsCount: 1,
  webhookFailuresCount: 7,
  cronFailures24hCount: 2,
};

const recentMessage: RecentMessageRecord = {
  id: "message-1",
  name: "张三",
  phone: "13800138000",
  content: "咨询产品",
  read: false,
  createdAt: new Date("2026-10-22T02:00:00.000Z"),
};

describe("buildAdminStatsData 权限裁剪", () => {
  it("owner 获取全部统计，并脱敏留言手机号", () => {
    const data = buildAdminStatsData(admin("owner"), snapshot, [recentMessage]);

    expect(data.totalUsers).toBe(100);
    expect(data.products).toBe(10);
    expect(data.jobs).toBe(3);
    expect(data.pendingApplications).toBe(3);
    expect(data.pendingSpentAdjustments).toBe(6);
    expect(data.pendingSpentAmount).toBe(1200);
    expect(data.pendingRedemptions).toBe(2);
    expect(data.failedAccountDeletions).toBe(1);
    expect(data.webhookFailures).toBe(7);
    expect(data.cronFailures24h).toBe(2);
    expect(data.recentMessages?.[0].phone).toBe("138****8000");
    expect(data.recentMessages?.[0].createdAt).toBe("2026-10-22T02:00:00.000Z");
  });

  it("support 只返回客服相关域，不返回产品/招聘/系统字段", () => {
    const data = buildAdminStatsData(admin("support"), snapshot);

    expect(data.totalUsers).toBe(100);
    expect(data.unreadMessages).toBe(4);
    expect(data.pendingSpentAdjustments).toBe(6);
    expect(data.pendingRedemptions).toBe(2);
    expect(data.recentMessages).toEqual([]);

    expect(data.products).toBeUndefined();
    expect(data.jobs).toBeUndefined();
    expect(data.pendingApplications).toBeUndefined();
    expect(data.failedAccountDeletions).toBeUndefined();
    expect(data.webhookFailures).toBeUndefined();
    expect(data.cronFailures24h).toBeUndefined();
  });

  it("finance 只返回用户、消费补录与兑换字段", () => {
    const data = buildAdminStatsData(admin("finance"), snapshot);

    expect(data.totalUsers).toBe(100);
    expect(data.pendingSpentAdjustments).toBe(6);
    expect(data.pendingSpentAmount).toBe(1200);
    expect(data.pendingRedemptions).toBe(2);

    expect(data.totalMessages).toBeUndefined();
    expect(data.recentMessages).toBeUndefined();
    expect(data.products).toBeUndefined();
    expect(data.jobs).toBeUndefined();
    expect(data.pendingApplications).toBeUndefined();
    expect(data.failedAccountDeletions).toBeUndefined();
    expect(data.webhookFailures).toBeUndefined();
    expect(data.cronFailures24h).toBeUndefined();
  });

  it("hr 只返回职位与简历字段", () => {
    const data = buildAdminStatsData(admin("hr"), snapshot);

    expect(data.jobs).toBe(3);
    expect(data.pendingApplications).toBe(3);
    expect(data.newApplicationsThisWeek).toBe(9);

    expect(data.totalUsers).toBeUndefined();
    expect(data.totalMessages).toBeUndefined();
    expect(data.products).toBeUndefined();
    expect(data.pendingSpentAdjustments).toBeUndefined();
    expect(data.pendingRedemptions).toBeUndefined();
  });

  it("历史 admin 角色不返回需安全写入权限的注销失败与系统告警字段", () => {
    const data = buildAdminStatsData(admin("admin"), snapshot);

    expect(data.pendingApplications).toBe(3);
    expect(data.pendingSpentAdjustments).toBe(6);
    expect(data.pendingRedemptions).toBe(2);
    expect(data.failedAccountDeletions).toBeUndefined();
    expect(data.webhookFailures).toBeUndefined();
    expect(data.cronFailures24h).toBeUndefined();
  });
});

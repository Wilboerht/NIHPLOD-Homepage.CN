/**
 * 仪表盘统计数据的权限映射（纯函数，便于单测）。
 *
 * 口径说明：站内没有订单/支付，产品均为站外购买链接。
 * 这里的“消费补录”仅代表用户站外消费申报/同步，用于会员等级与积分，不代表站内营收。
 */
import { hasAdminPermission, type AdminPermission } from "./admin-permissions";
import type { AdminUser } from "@/types/auth";

export interface AdminStatsData {
  products?: number;
  categories?: number;
  /** 草稿产品数（products:read） */
  draftProducts?: number;
  jobs?: number;
  totalUsers?: number;
  /** 今日新增用户（users:read） */
  newUsersToday?: number;
  totalMessages?: number;
  /** 今日新增留言（messages:read） */
  messagesToday?: number;
  unreadMessages?: number;
  /** 最早一条未读留言时间，用于待办时效（messages:read） */
  unreadMessagesOldestAt?: string;
  recentMessages?: {
    id: string;
    name: string;
    phone: string;
    content: string;
    read: boolean;
    createdAt: string;
  }[];
  /** 待审核消费补录数（spent:read） */
  pendingSpentAdjustments?: number;
  /** 待审核消费补录申报金额（spent:read，元） */
  pendingSpentAmount?: number;
  /** 最早一条待审核消费补录时间（spent:read） */
  pendingSpentAdjustmentsOldestAt?: string;
  /** 待履约积分兑换数（redemptions:read） */
  pendingRedemptions?: number;
  /** 最早一条待履约兑换时间（redemptions:read） */
  pendingRedemptionsOldestAt?: string;
  /** 待处理简历数（applications:read） */
  pendingApplications?: number;
  /** 最早一条待处理简历时间（applications:read） */
  pendingApplicationsOldestAt?: string;
  /** 本周新增简历数（applications:read） */
  newApplicationsThisWeek?: number;
  /** 注销失败人工队列数（users:security:write） */
  failedAccountDeletions?: number;
  /** Webhook 失败队列条数（webhooks:read） */
  webhookFailures?: number;
  /** 近 24 小时定时任务失败次数（cron:read） */
  cronFailures24h?: number;
}

/** 内部聚合快照（不含权限裁剪） */
export interface AdminStatsSnapshot {
  productsCount: number;
  categoriesCount: number;
  draftProductsCount: number;
  jobsCount: number;
  totalUsersCount: number;
  newUsersTodayCount: number;
  totalMessagesCount: number;
  messagesTodayCount: number;
  unreadMessagesCount: number;
  unreadMessagesOldestAt?: string;
  pendingSpentAdjustmentsCount: number;
  pendingSpentAmount: number;
  pendingSpentAdjustmentsOldestAt?: string;
  pendingRedemptionsCount: number;
  pendingRedemptionsOldestAt?: string;
  pendingApplicationsCount: number;
  pendingApplicationsOldestAt?: string;
  newApplicationsThisWeekCount: number;
  failedAccountDeletionsCount: number;
  webhookFailuresCount: number;
  cronFailures24hCount: number;
}

export interface RecentMessageRecord {
  id: string;
  name: string;
  phone: string;
  content: string;
  read: boolean;
  createdAt: Date;
}

const maskPhone = (phone: string) => phone.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2");

/**
 * 按权限裁剪统计字段。
 * 抽成纯函数便于测试，避免新增字段时漏加权限判断。
 */
export function buildAdminStatsData(
  admin: AdminUser,
  counts: AdminStatsSnapshot,
  recentMessages?: RecentMessageRecord[]
): AdminStatsData {
  const can = (permission: AdminPermission) => hasAdminPermission(admin, permission);
  const data: AdminStatsData = {};

  if (can("users:read")) {
    data.totalUsers = counts.totalUsersCount;
    data.newUsersToday = counts.newUsersTodayCount;
  }
  // 注销失败队列需要人工重试，仅对有安全写入权限的角色展示
  if (can("users:security:write")) {
    data.failedAccountDeletions = counts.failedAccountDeletionsCount;
  }
  if (can("products:read")) {
    data.products = counts.productsCount;
    data.draftProducts = counts.draftProductsCount;
  }
  if (can("categories:read")) data.categories = counts.categoriesCount;
  if (can("jobs:read")) data.jobs = counts.jobsCount;
  if (can("applications:read")) {
    data.pendingApplications = counts.pendingApplicationsCount;
    data.pendingApplicationsOldestAt = counts.pendingApplicationsOldestAt;
    data.newApplicationsThisWeek = counts.newApplicationsThisWeekCount;
  }
  if (can("spent:read")) {
    data.pendingSpentAdjustments = counts.pendingSpentAdjustmentsCount;
    data.pendingSpentAmount = counts.pendingSpentAmount;
    data.pendingSpentAdjustmentsOldestAt = counts.pendingSpentAdjustmentsOldestAt;
  }
  if (can("redemptions:read")) {
    data.pendingRedemptions = counts.pendingRedemptionsCount;
    data.pendingRedemptionsOldestAt = counts.pendingRedemptionsOldestAt;
  }
  if (can("webhooks:read")) data.webhookFailures = counts.webhookFailuresCount;
  if (can("cron:read")) data.cronFailures24h = counts.cronFailures24hCount;

  if (can("messages:read")) {
    data.totalMessages = counts.totalMessagesCount;
    data.messagesToday = counts.messagesTodayCount;
    data.unreadMessages = counts.unreadMessagesCount;
    data.unreadMessagesOldestAt = counts.unreadMessagesOldestAt;
    data.recentMessages = (recentMessages ?? []).map((msg) => ({
      ...msg,
      phone: maskPhone(msg.phone),
      createdAt: new Date(msg.createdAt).toISOString(),
    }));
  }

  return data;
}

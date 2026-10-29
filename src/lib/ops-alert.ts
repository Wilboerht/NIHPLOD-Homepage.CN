/**
 * 运营告警与日报（发综合管理群 + 运营群）：
 * 兑换临期/自动取消、待办积压、礼品库存、消费补录冲突、运营日报。
 *
 * 所有发送尽力而为，失败只记录日志，不阻断业务。
 */
import { prisma } from "./prisma";
import { apiConsole } from "./logger";
import { maskPhone } from "./mask-phone";
import { claimAlert, notifyWithCooldown, sendAlert } from "./alert-notify";
import { getUtc8DayRange } from "./audit-integrity";
import type { SpentOrderConflictResult } from "./spent-order-conflicts";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function nowText(now = new Date()): string {
  return now.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
}

function dayText(date: Date): string {
  return date.toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" });
}

function formatAge(date: Date | null | undefined, now: Date): string {
  if (!date) return "-";
  const minutes = Math.floor(Math.max(0, now.getTime() - date.getTime()) / MINUTE);
  if (minutes < 60) return `${Math.max(1, minutes)} 分钟`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时`;
  return `${Math.floor(hours / 24)} 天`;
}

function pendingDays(): number {
  const raw = Number(process.env.POINT_REDEMPTION_PENDING_DAYS ?? "30");
  return Number.isFinite(raw) ? raw : 30;
}

function lowStockThreshold(): number {
  const raw = Number(process.env.POINT_GIFT_LOW_STOCK_THRESHOLD ?? "2");
  return Number.isFinite(raw) ? Math.max(0, raw) : 2;
}

/** 兑换待履约临期提醒（T-7 / T-1，窗口天然只命中一次） */
export async function sendRedemptionExpiryReminders(now = new Date()): Promise<void> {
  const days = pendingDays();
  if (days <= 0) return;

  for (const daysLeft of [7, 1]) {
    if (daysLeft > days) continue;

    const end = new Date(now.getTime() - days * DAY + daysLeft * DAY);
    const start = new Date(end.getTime() - DAY);
    const where = { status: "PENDING" as const, createdAt: { gte: start, lt: end } };

    const [items, total] = await Promise.all([
      prisma.pointRedemption.findMany({
        where,
        orderBy: { createdAt: "asc" },
        take: 20,
        select: {
          id: true,
          productName: true,
          points: true,
          createdAt: true,
          user: { select: { nickname: true, phone: true } },
        },
      }),
      prisma.pointRedemption.count({ where }),
    ]);
    if (items.length === 0) continue;

    const dayKey = start.toISOString().slice(0, 10);
    if (!(await claimAlert(`redemption-expiry:${daysLeft}:${dayKey}`, total, 12 * HOUR, now))) {
      continue;
    }

    sendAlert(
      "ops",
      `兑换待履约临期提醒（T-${daysLeft}）`,
      [
        `- 待处理：${total} 笔`,
        `- 自动取消时间：${dayText(new Date(start.getTime() + days * DAY))} 起`,
        `- 检查时间：${nowText(now)}`,
        "",
        ...items.map((item) => {
          const user = item.user.nickname || maskPhone(item.user.phone);
          return `- ${user} · ${item.productName} · ${item.points} 积分 · 申请于 ${dayText(item.createdAt)}`;
        }),
        total > items.length ? `- 其余 ${total - items.length} 笔省略` : "",
      ].filter(Boolean)
    );
  }
}

/** 兑换超时自动取消结果 */
export function notifyRedemptionAutoCancelled(result: {
  scanned: number;
  cancelled: number;
  skipped: number;
  failed: number;
  refundedPoints: number;
}): void {
  if (result.scanned === 0) return;
  const dayKey = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
  notifyWithCooldown({
    ruleKey: `redemption-auto-cancel:${dayKey}`,
    count: result.cancelled,
    cooldownMs: 12 * HOUR,
    type: "ops",
    title: "兑换超时自动取消",
    lines: [
      `- 扫描：${result.scanned} 笔`,
      `- 已取消：${result.cancelled} 笔`,
      `- 退还积分：${result.refundedPoints}`,
      `- 跳过：${result.skipped} 笔`,
      `- 失败：${result.failed} 笔`,
      `- 时间：${nowText()}`,
    ],
  });
}

/** 消费补录超时导入批次 */
export function notifyStaleSpentImportBatches(count: number): void {
  if (count <= 0) return;
  notifyWithCooldown({
    ruleKey: "spent-import-stale",
    count,
    cooldownMs: HOUR,
    type: "ops",
    title: "消费补录导入批次超时",
    lines: [
      `- 已标记失败：${count} 个批次`,
      `- 时间：${nowText()}`,
      "- 请前往「消费审核」检查并重新导入",
    ],
  });
}

/** 消费订单跨来源冲突 */
export function notifySpentOrderConflicts(result: SpentOrderConflictResult): void {
  if (result.count <= 0) return;
  const dayKey = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
  notifyWithCooldown({
    ruleKey: `spent-order-conflicts:${dayKey}`,
    count: result.count,
    cooldownMs: 12 * HOUR,
    type: "ops",
    title: "消费订单跨来源冲突",
    lines: [
      `- 发现：${result.count} 个订单号${result.truncated ? "（已截断）" : ""}`,
      `- 扫描范围：最近 ${result.since}`,
      "",
      ...result.items.slice(0, 10).map((item) => `- ${item.orderNo} · ${item.sources.join(" + ")}`),
      result.count > 10 ? `- 其余 ${result.count - 10} 个省略` : "",
      "- 请人工核对并处理重复入账",
    ].filter(Boolean),
  });
}

/** 礼品库存预警：单独告警，不混入运营日报；同一状态 12 小时内只提醒一次 */
export async function sendGiftLowStockAlert(now = new Date()): Promise<void> {
  const threshold = lowStockThreshold();
  const products = await prisma.product.findMany({
    where: {
      pointRedeemable: true,
      published: true,
      category: { visible: true },
      redeemStock: { not: null, lte: threshold },
    },
    orderBy: { redeemStock: "asc" },
    take: 20,
    select: { name: true, redeemStock: true },
  });

  if (products.length === 0) return;

  notifyWithCooldown({
    ruleKey: "gift-low-stock",
    count: products.length,
    cooldownMs: 12 * HOUR,
    type: "ops",
    title: `礼品库存预警（≤${threshold}）`,
    lines: [
      `- 触发时间：${nowText(now)}`,
      ...products.map((product) => `- ${product.name}：剩余 ${product.redeemStock ?? 0}`),
      products.length >= 20 ? "- 仅显示前 20 个，请前往「积分礼品」查看全部" : "",
      "- 请及时补充库存或调整可兑状态",
    ].filter(Boolean),
  });
}

/** 运营日报：新增、待办、积压（cron 每天 23:55 发送；礼品库存单独预警） */
export async function sendOpsDailyDigest(now = new Date()): Promise<void> {
  const { day, fromAt } = getUtc8DayRange(now);

  const dayAgo = new Date(now.getTime() - DAY);
  const twoDaysAgo = new Date(now.getTime() - 2 * DAY);
  const threeDaysAgo = new Date(now.getTime() - 3 * DAY);

  const [
    messagesToday,
    applicationsToday,
    spentToday,
    redemptionsToday,
    unreadAgg,
    applicationsPendingAgg,
    spentPendingAgg,
    redemptionsPendingAgg,
    agedMessages,
    agedApplications,
    agedSpent,
    agedRedemptions,
  ] = await Promise.all([
    prisma.contactMessage.count({ where: { createdAt: { gte: fromAt } } }),
    prisma.jobApplication.count({ where: { createdAt: { gte: fromAt } } }),
    prisma.spentAdjustmentApplication.count({ where: { createdAt: { gte: fromAt } } }),
    prisma.pointRedemption.count({ where: { createdAt: { gte: fromAt } } }),
    prisma.contactMessage.aggregate({
      _count: true,
      _min: { createdAt: true },
      where: { read: false },
    }),
    prisma.jobApplication.aggregate({
      _count: true,
      _min: { createdAt: true },
      where: { status: "pending" },
    }),
    prisma.spentAdjustmentApplication.aggregate({
      _count: true,
      _min: { createdAt: true },
      _sum: { amountClaimed: true },
      where: { status: "PENDING" },
    }),
    prisma.pointRedemption.aggregate({
      _count: true,
      _min: { createdAt: true },
      where: { status: "PENDING" },
    }),
    prisma.contactMessage.count({ where: { read: false, createdAt: { lt: dayAgo } } }),
    prisma.jobApplication.count({ where: { status: "pending", createdAt: { lt: threeDaysAgo } } }),
    prisma.spentAdjustmentApplication.count({
      where: { status: "PENDING", createdAt: { lt: dayAgo } },
    }),
    prisma.pointRedemption.count({
      where: { status: "PENDING", createdAt: { lt: twoDaysAgo } },
    }),
  ]);

  // 查询成功后再占位，避免瞬时数据库错误导致当天日报被去重跳过
  if (!(await claimAlert(`ops-digest:${day}`, 1, 12 * HOUR, now))) return;

  sendAlert("ops", `运营日报（${day}）`, [
    `- 统计截止：${nowText(now)}`,
    "",
    "**今日新增**",
    `- 留言：${messagesToday}`,
    `- 简历：${applicationsToday}`,
    `- 积分申请：${spentToday}`,
    `- 兑换申请：${redemptionsToday}`,
    "",
    "**待处理**",
    `- 未读留言：${unreadAgg._count}（最老 ${formatAge(unreadAgg._min.createdAt, now)}）`,
    `- 简历待处理：${applicationsPendingAgg._count}（最老 ${formatAge(
      applicationsPendingAgg._min.createdAt,
      now
    )}）`,
    `- 积分申请待审：${spentPendingAgg._count} 笔 / 申报 ¥${
      spentPendingAgg._sum.amountClaimed ?? 0
    }（最老 ${formatAge(spentPendingAgg._min.createdAt, now)}）`,
    `- 兑换待履约：${redemptionsPendingAgg._count} 笔（最老 ${formatAge(
      redemptionsPendingAgg._min.createdAt,
      now
    )}）`,
    "",
    "**积压超时**",
    `- 留言未读 >24h：${agedMessages}`,
    `- 简历待处理 >3d：${agedApplications}`,
    `- 积分申请待审 >24h：${agedSpent}`,
    `- 兑换待履约 >48h：${agedRedemptions}`,
  ]);

  apiConsole.info(`[OpsDigest] 运营日报已生成: ${day}`);
}

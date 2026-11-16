/**
 * 兑换履约保护期。
 *
 * 默认 7 天；生产可通过 REDEMPTION_FULFILL_PROTECTION_DAYS 调整，
 * 建议设置为不短于商城退款/退货窗口，避免“下单兑礼→发货→退款”的套利窗口。
 */
const DEFAULT_FULFILL_PROTECTION_DAYS = 7;

/** 默认履约保护天数（测试/文档引用；运行时可通过环境变量覆盖）。 */
export const REDEMPTION_FULFILL_PROTECTION_DAYS = DEFAULT_FULFILL_PROTECTION_DAYS;

export function getRedemptionProtectionDays(): number {
  const raw = Number(process.env.REDEMPTION_FULFILL_PROTECTION_DAYS);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_FULFILL_PROTECTION_DAYS;
}

export function getRedemptionFulfillableAt(createdAt: Date | string): Date {
  const start = createdAt instanceof Date ? createdAt : new Date(createdAt);
  return new Date(start.getTime() + getRedemptionProtectionDays() * 24 * 60 * 60 * 1000);
}

export function getRedemptionProtectionView(createdAt: Date, now = new Date()) {
  const fulfillableAt = getRedemptionFulfillableAt(createdAt);
  return {
    protectionDays: getRedemptionProtectionDays(),
    fulfillableAt: fulfillableAt.toISOString(),
    protectionActive: fulfillableAt.getTime() > now.getTime(),
  };
}

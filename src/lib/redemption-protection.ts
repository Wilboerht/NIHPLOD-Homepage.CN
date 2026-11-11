export const REDEMPTION_FULFILL_PROTECTION_DAYS = 7;

export function getRedemptionFulfillableAt(createdAt: Date | string): Date {
  const start = createdAt instanceof Date ? createdAt : new Date(createdAt);
  return new Date(
    start.getTime() + REDEMPTION_FULFILL_PROTECTION_DAYS * 24 * 60 * 60 * 1000
  );
}

export function getRedemptionProtectionView(createdAt: Date, now = new Date()) {
  const fulfillableAt = getRedemptionFulfillableAt(createdAt);
  return {
    fulfillableAt: fulfillableAt.toISOString(),
    protectionActive: fulfillableAt.getTime() > now.getTime(),
  };
}

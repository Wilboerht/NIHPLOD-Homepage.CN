/**
 * 客户端幂等请求 ID（积分调整/兑换等资金操作使用）。
 * crypto.randomUUID 仅在安全上下文（https/localhost）可用，非安全上下文降级为随机串。
 */
export function createClientRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

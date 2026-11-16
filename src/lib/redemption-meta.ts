/**
 * 兑换状态展示文案（共享常量，避免导出/管理端/用户端各自维护导致漂移）。
 */
export const REDEMPTION_STATUS_LABELS: Record<string, string> = {
  PENDING: "待发货",
  FULFILLED: "已发货",
  COMPLETED: "已完成",
  AFTER_SALES_REQUESTED: "售后待审核",
  AFTER_SALES_APPROVED: "售后待寄回",
  AFTER_SALES_REJECTED: "售后已驳回",
  RETURNING: "退货中",
  RETURNED: "退货已签收",
  REFUNDED: "已退款",
  AFTER_SALES_CLOSED: "售后已关闭",
  CANCELLED: "已取消",
};

export function redemptionStatusLabel(status: string): string {
  return REDEMPTION_STATUS_LABELS[status] ?? status;
}

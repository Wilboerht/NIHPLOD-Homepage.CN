/** 积分流水类型/来源展示文案（管理端共用） */
export const POINT_LEDGER_TYPE_LABELS: Record<string, string> = {
  CONSUME: "消费发放",
  REFUND: "退款冲正",
  BIRTHDAY: "生日积分",
  CHECKIN: "打卡奖励",
  REDEEM: "兑礼扣减",
  REDEEM_REFUND: "兑换撤销退分",
  EXPIRE: "过期扣减",
  ADJUST: "人工调整",
};

export const POINT_LEDGER_SOURCE_LABELS: Record<string, string> = {
  WEBSITE: "官网",
  MALL: "商城",
  UNKNOWN: "未知",
};

export const POINT_LEDGER_TYPE_OPTIONS = Object.entries(POINT_LEDGER_TYPE_LABELS).map(
  ([value, label]) => ({ value, label })
);

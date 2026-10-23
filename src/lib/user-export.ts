import { escapeCSV } from "@/lib/csv";

export const USER_EXPORT_GROUPS = [
  "profile",
  "identities",
  "points",
  "redemptions",
  "addresses",
  "spent",
  "growth",
  "logins",
  "deletions",
  "advisorAccount",
  "advisorSessions",
  "advisorDiary",
  "advisorFullAnalysis",
] as const;

export type UserExportGroup = (typeof USER_EXPORT_GROUPS)[number];

export const ADVISOR_EXPORT_GROUPS: readonly UserExportGroup[] = [
  "advisorAccount",
  "advisorSessions",
  "advisorDiary",
  "advisorFullAnalysis",
];

export const DEFAULT_USER_EXPORT_GROUPS: readonly UserExportGroup[] = [
  "profile",
  "identities",
  "points",
  "redemptions",
  "addresses",
  "spent",
  "growth",
  "logins",
  "deletions",
  "advisorAccount",
  "advisorSessions",
  "advisorDiary",
];

export const USER_EXPORT_GROUP_LABELS: Record<UserExportGroup, string> = {
  profile: "用户基础资料",
  identities: "第三方平台绑定",
  points: "积分流水",
  redemptions: "积分兑换记录",
  addresses: "收货地址",
  spent: "消费补录记录",
  growth: "等级变更",
  logins: "登录历史",
  deletions: "账号注销申请",
  advisorAccount: "测肤子站账号与额度",
  advisorSessions: "测肤会话（业务摘要）",
  advisorDiary: "测肤日记",
  advisorFullAnalysis: "测肤会话完整分析",
};

export const USER_EXPORT_GROUP_FILES: Record<UserExportGroup, readonly string[]> = {
  profile: ["users.csv"],
  identities: ["external-identities.csv"],
  points: ["points-ledger.csv"],
  redemptions: ["point-redemptions.csv"],
  addresses: ["addresses.csv"],
  spent: ["spent-adjustments.csv"],
  growth: ["level-changes.csv"],
  logins: ["login-attempts.csv"],
  deletions: ["account-deletions.csv"],
  advisorAccount: ["advisor-accounts.csv"],
  advisorSessions: ["advisor-sessions.csv"],
  advisorDiary: ["advisor-diary.csv"],
  advisorFullAnalysis: ["advisor-session-analysis.jsonl"],
};

export const USER_EXPORT_FILE_DESCRIPTIONS: Record<string, string> = {
  "export-info.csv": "导出范围、筛选条件与权限说明",
  "users.csv": "用户基础资料及所选范围的数量汇总",
  "external-identities.csv": "第三方平台绑定明细",
  "points-ledger.csv": "积分流水全量明细",
  "point-redemptions.csv": "积分兑换全量明细",
  "addresses.csv": "收货地址全量明细",
  "spent-adjustments.csv": "消费补录全量明细",
  "level-changes.csv": "会员等级变更全量明细",
  "login-attempts.csv": "登录历史全量明细",
  "account-deletions.csv": "账号注销申请",
  "advisor-accounts.csv": "测肤子站账号、额度与使用量",
  "advisor-sessions.csv": "测肤会话业务摘要",
  "advisor-diary.csv": "测肤日记全量明细",
  "advisor-session-analysis.jsonl": "测肤会话完整分析（可选、JSONL、每行一条）",
  "advisor-errors.csv": "测肤子站逐用户拉取失败记录",
  "manifest.csv": "ZIP 文件清单与行数",
};

export const CSV_BOM = "\uFEFF";
export const CSV_EOL = "\r\n";

export const USER_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "正常",
  SUSPENDED: "冻结",
  BANNED: "封禁",
  DELETED: "已注销",
};

export const MEMBERSHIP_LABELS: Record<string, string> = {
  REGULAR: "普通会员",
  SILVER: "银卡会员",
  GOLD: "金卡会员",
  DIAMOND: "钻石卡会员",
};

export const POINT_TYPE_LABELS: Record<string, string> = {
  CONSUME: "消费发放",
  REFUND: "退款冲正",
  BIRTHDAY: "生日积分",
  CHECKIN: "打卡奖励",
  REDEEM: "兑礼扣减",
  REDEEM_REFUND: "兑换撤销退分",
  EXPIRE: "过期扣减",
  ADJUST: "人工调整",
};

export const REDEMPTION_STATUS_LABELS: Record<string, string> = {
  PENDING: "待处理",
  FULFILLED: "已完成",
  CANCELLED: "已取消",
};

export const SPENT_CHANNEL_LABELS: Record<string, string> = {
  TMALL: "天猫商城",
  DOUYIN: "抖音商城",
  XIAOHONGSHU: "小红书",
  WECHAT_SHOP: "微信小店",
  OFFLINE: "线下专柜",
  DEALER: "经销商",
  OTHER: "其他",
  JD: "京东",
  MINIPROGRAM: "微信小程序",
};

export const SPENT_STATUS_LABELS: Record<string, string> = {
  PENDING: "待审核",
  APPROVED: "已通过",
  REJECTED: "已驳回",
};

export const LOGIN_TYPE_LABELS: Record<string, string> = {
  password: "密码登录",
  sms: "验证码登录",
  admin: "管理员登录",
  wechat: "微信登录",
  douyin: "抖音登录",
};

export const EXTERNAL_PROVIDER_LABELS: Record<string, string> = {
  wechat_open: "微信开放平台",
  wechat_mp: "微信公众号",
  wechat_miniprogram: "微信小程序",
  douyin: "抖音",
};

export const DELETION_STATUS_LABELS: Record<string, string> = {
  PENDING: "待执行",
  RUNNING: "执行中",
  COMPLETED: "已完成",
  FAILED: "失败",
  CANCELLED: "已取消",
};

export const ADVISOR_ROLE_LABELS: Record<string, string> = {
  user: "正常",
  disabled: "已禁用",
};

export const ADVISOR_SKIN_STATE_LABELS: Record<string, string> = {
  great: "很好",
  good: "不错",
  normal: "一般",
  bad: "较差",
  terrible: "很差",
};

export function isUserExportGroup(value: string): value is UserExportGroup {
  return (USER_EXPORT_GROUPS as readonly string[]).includes(value);
}

export function normalizeUserExportGroups(
  raw: string | null | undefined,
  canReadAdvisor: boolean
): { groups: UserExportGroup[]; invalid: string[]; requestedAdvisor: boolean } {
  const values = raw
    ? raw
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : [...DEFAULT_USER_EXPORT_GROUPS];
  const invalid = values.filter((item) => !isUserExportGroup(item));
  const requested = new Set(values.filter(isUserExportGroup));

  if (!raw && !canReadAdvisor) {
    for (const group of ADVISOR_EXPORT_GROUPS) requested.delete(group);
  }
  const requestedAdvisor = [...requested].some((group) => ADVISOR_EXPORT_GROUPS.includes(group));

  requested.add("profile");
  if (requested.has("advisorFullAnalysis")) requested.add("advisorSessions");

  return {
    groups: USER_EXPORT_GROUPS.filter((group) => requested.has(group)),
    invalid,
    requestedAdvisor,
  };
}

export function selectedFileNames(groups: readonly UserExportGroup[]): string[] {
  const files = new Set<string>();
  for (const group of groups) {
    for (const file of USER_EXPORT_GROUP_FILES[group]) files.add(file);
  }
  return [...files];
}

export function genderLabel(value: string | null | undefined): string {
  if (value === "male") return "男";
  if (value === "female") return "女";
  return "未设置";
}

export function yesNo(value: boolean | null | undefined): string {
  return value ? "是" : "否";
}

export function toIso(value: Date | string | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

export function toDateOnly(value: Date | string | null | undefined): string {
  const iso = toIso(value);
  return iso ? iso.slice(0, 10) : "";
}

export function jsonCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  return escapeCSV(String(value));
}

export function csvLine(cells: readonly unknown[]): string {
  return cells.map(csvCell).join(",");
}

export function csvText(headers: readonly string[], rows: readonly (readonly unknown[])[]): string {
  return [csvLine(headers), ...rows.map((row) => csvLine(row))].join(CSV_EOL) + CSV_EOL;
}

export interface ExportCsvEntry {
  name: string;
  kind: "csv";
  headers: readonly string[];
  rows: AsyncIterable<readonly unknown[]>;
}

export interface ExportJsonlEntry {
  name: string;
  kind: "jsonl";
  lines: AsyncIterable<string>;
}

export type UserExportEntry = ExportCsvEntry | ExportJsonlEntry;

export function staticCsvEntry(
  name: string,
  headers: readonly string[],
  rows: readonly (readonly unknown[])[]
): ExportCsvEntry {
  return {
    name,
    kind: "csv",
    headers,
    rows: (async function* () {
      yield* rows;
    })(),
  };
}

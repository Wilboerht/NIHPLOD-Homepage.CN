import type { Prisma } from "@/generated/prisma/client";
import prisma from "@/lib/prisma";
import { maskAddress, maskIdentifier, maskPhone } from "@/lib/mask-phone";
import { iterateUserBatches } from "@/lib/user-query";
import {
  DELETION_STATUS_LABELS,
  EXTERNAL_PROVIDER_LABELS,
  LOGIN_TYPE_LABELS,
  MEMBERSHIP_LABELS,
  POINT_TYPE_LABELS,
  REDEMPTION_STATUS_LABELS,
  SPENT_CHANNEL_LABELS,
  SPENT_STATUS_LABELS,
  USER_STATUS_LABELS,
  genderLabel,
  jsonCell,
  toDateOnly,
  toIso,
  yesNo,
  type ExportCsvEntry,
  type UserExportEntry,
  type UserExportGroup,
} from "@/lib/user-export";

export const USER_EXPORT_BATCH_SIZE = 200;

const USER_ID_SELECT = { id: true, createdAt: true } satisfies Prisma.UserSelect;

export interface DatabaseExportOptions {
  where: Prisma.UserWhereInput;
  groups: readonly UserExportGroup[];
  canReadSensitive: boolean;
  batchSize?: number;
}

const userSelect = {
  id: true,
  phone: true,
  phoneVerified: true,
  nickname: true,
  avatar: true,
  gender: true,
  status: true,
  membershipLevel: true,
  totalSpent: true,
  silverActivatedAt: true,
  goldActivatedAt: true,
  diamondActivatedAt: true,
  wechatOpenId: true,
  wechatUnionId: true,
  birthday: true,
  birthdayLocked: true,
  createdAt: true,
  updatedAt: true,
  pointBalance: { select: { available: true, updatedAt: true } },
  accountDeletionRequest: { select: { status: true } },
  _count: {
    select: {
      externalIdentities: true,
      pointLedger: true,
      pointRedemptions: true,
      addresses: true,
      spentAdjustmentApplications: true,
      membershipLevelChanges: true,
      loginAttempts: true,
    },
  },
} satisfies Prisma.UserSelect;

type ExportUser = Prisma.UserGetPayload<{ select: typeof userSelect }>;

function groupByUser<T extends { userId: string | null }>(items: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    if (!item.userId) continue;
    const list = map.get(item.userId);
    if (list) list.push(item);
    else map.set(item.userId, [item]);
  }
  return map;
}

async function* iterateUserIdBatches(
  where: Prisma.UserWhereInput,
  batchSize: number
): AsyncGenerator<string[]> {
  for await (const rows of iterateUserBatches({
    where,
    select: USER_ID_SELECT,
    batchSize,
  })) {
    yield rows.map((row) => row.id);
  }
}

function countOf(user: ExportUser, key: keyof ExportUser["_count"]): number {
  const counts = user._count as Record<string, number | undefined>;
  return counts[key] ?? 0;
}

const USERS_HEADERS = [
  "用户ID",
  "手机号",
  "手机号已验证",
  "昵称",
  "头像URL",
  "性别",
  "账号状态",
  "账号状态代码",
  "会员等级",
  "会员等级代码",
  "累计消费(元)",
  "银卡激活时间",
  "金卡激活时间",
  "钻石卡激活时间",
  "微信OpenID",
  "微信UnionID",
  "生日",
  "生日锁定",
  "积分余额",
  "积分余额更新时间",
  "积分流水数",
  "兑换次数",
  "收货地址数",
  "消费补录数",
  "等级变更数",
  "登录记录数",
  "第三方身份数",
  "注销申请状态",
  "注册时间",
  "最后更新时间",
] as const;

function usersEntry(options: DatabaseExportOptions): ExportCsvEntry {
  const selected = new Set(options.groups);
  const batchSize = options.batchSize ?? USER_EXPORT_BATCH_SIZE;

  return {
    name: "users.csv",
    kind: "csv",
    headers: USERS_HEADERS,
    rows: (async function* () {
      for await (const users of iterateUserBatches({
        where: options.where,
        select: userSelect,
        batchSize,
      })) {
        for (const user of users) {
          const row = user as ExportUser;
          yield [
            row.id,
            options.canReadSensitive ? row.phone : maskPhone(row.phone),
            yesNo(row.phoneVerified),
            row.nickname ?? "",
            row.avatar ?? "",
            genderLabel(row.gender),
            USER_STATUS_LABELS[row.status] ?? row.status,
            row.status,
            MEMBERSHIP_LABELS[row.membershipLevel] ?? row.membershipLevel,
            row.membershipLevel,
            row.totalSpent,
            toIso(row.silverActivatedAt),
            toIso(row.goldActivatedAt),
            toIso(row.diamondActivatedAt),
            options.canReadSensitive ? (row.wechatOpenId ?? "") : maskIdentifier(row.wechatOpenId),
            options.canReadSensitive
              ? (row.wechatUnionId ?? "")
              : maskIdentifier(row.wechatUnionId),
            toDateOnly(row.birthday),
            yesNo(row.birthdayLocked),
            selected.has("points") ? (row.pointBalance?.available ?? 0) : "",
            selected.has("points") ? toIso(row.pointBalance?.updatedAt) : "",
            selected.has("points") ? countOf(row, "pointLedger") : "",
            selected.has("redemptions") ? countOf(row, "pointRedemptions") : "",
            selected.has("addresses") ? countOf(row, "addresses") : "",
            selected.has("spent") ? countOf(row, "spentAdjustmentApplications") : "",
            selected.has("growth") ? countOf(row, "membershipLevelChanges") : "",
            selected.has("logins") ? countOf(row, "loginAttempts") : "",
            selected.has("identities") ? countOf(row, "externalIdentities") : "",
            selected.has("deletions")
              ? row.accountDeletionRequest
                ? (DELETION_STATUS_LABELS[row.accountDeletionRequest.status] ??
                  row.accountDeletionRequest.status)
                : ""
              : "",
            toIso(row.createdAt),
            toIso(row.updatedAt),
          ];
        }
      }
    })(),
  };
}

function identitiesEntry(options: DatabaseExportOptions): ExportCsvEntry {
  const batchSize = options.batchSize ?? USER_EXPORT_BATCH_SIZE;
  return {
    name: "external-identities.csv",
    kind: "csv",
    headers: [
      "用户ID",
      "身份ID",
      "平台",
      "平台代码",
      "平台唯一标识",
      "UnionID",
      "来源小程序ClientID",
      "来源小程序名称",
      "元数据(JSON)",
      "绑定时间",
      "更新时间",
    ],
    rows: (async function* () {
      for await (const userIds of iterateUserIdBatches(options.where, batchSize)) {
        const identities = await prisma.externalIdentity.findMany({
          where: { userId: { in: userIds } },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: {
            id: true,
            userId: true,
            provider: true,
            subjectId: true,
            unionId: true,
            metadata: true,
            createdAt: true,
            updatedAt: true,
          },
        });
        const mpClientIds = [
          ...new Set(
            identities
              .map((identity) => {
                const meta = (identity.metadata ?? null) as Record<string, unknown> | null;
                return typeof meta?.mpClientId === "string" ? meta.mpClientId : null;
              })
              .filter((value): value is string => value !== null)
          ),
        ];
        const clients =
          mpClientIds.length > 0
            ? await prisma.oAuthClient.findMany({
                where: { clientId: { in: mpClientIds } },
                select: { clientId: true, name: true },
              })
            : [];
        const clientNames = new Map(clients.map((client) => [client.clientId, client.name]));

        const byUser = groupByUser(identities);
        for (const userId of userIds) {
          for (const identity of byUser.get(userId) ?? []) {
            const meta = (identity.metadata ?? null) as Record<string, unknown> | null;
            const mpClientId = typeof meta?.mpClientId === "string" ? meta.mpClientId : null;
            yield [
              identity.userId,
              identity.id,
              EXTERNAL_PROVIDER_LABELS[identity.provider] ?? identity.provider,
              identity.provider,
              options.canReadSensitive ? identity.subjectId : maskIdentifier(identity.subjectId),
              options.canReadSensitive
                ? (identity.unionId ?? "")
                : maskIdentifier(identity.unionId),
              mpClientId ?? "",
              mpClientId ? (clientNames.get(mpClientId) ?? "") : "",
              jsonCell(identity.metadata),
              toIso(identity.createdAt),
              toIso(identity.updatedAt),
            ];
          }
        }
      }
    })(),
  };
}

function pointsEntry(options: DatabaseExportOptions): ExportCsvEntry {
  const batchSize = options.batchSize ?? USER_EXPORT_BATCH_SIZE;
  return {
    name: "points-ledger.csv",
    kind: "csv",
    headers: [
      "用户ID",
      "流水ID",
      "类型",
      "类型代码",
      "积分变动",
      "剩余",
      "幂等键",
      "备注",
      "冻结截止",
      "到账时间",
      "过期时间",
      "创建时间",
    ],
    rows: (async function* () {
      for await (const userIds of iterateUserIdBatches(options.where, batchSize)) {
        const items = await prisma.pointLedger.findMany({
          where: { userId: { in: userIds } },
          orderBy: [{ createdAt: "desc" }, { id: "asc" }],
          select: {
            id: true,
            userId: true,
            type: true,
            amount: true,
            remaining: true,
            reference: true,
            note: true,
            frozenUntil: true,
            releasedAt: true,
            expiresAt: true,
            createdAt: true,
          },
        });
        const byUser = groupByUser(items);
        for (const userId of userIds) {
          for (const item of byUser.get(userId) ?? []) {
            yield [
              item.userId,
              item.id,
              POINT_TYPE_LABELS[item.type] ?? item.type,
              item.type,
              item.amount,
              item.remaining ?? "",
              item.reference,
              item.note ?? "",
              toIso(item.frozenUntil),
              toIso(item.releasedAt),
              toIso(item.expiresAt),
              toIso(item.createdAt),
            ];
          }
        }
      }
    })(),
  };
}

function redemptionsEntry(options: DatabaseExportOptions): ExportCsvEntry {
  const batchSize = options.batchSize ?? USER_EXPORT_BATCH_SIZE;
  return {
    name: "point-redemptions.csv",
    kind: "csv",
    headers: [
      "用户ID",
      "兑换ID",
      "产品ID",
      "产品名称",
      "参考价(元)",
      "扣减积分",
      "兑换时等级",
      "兑换时兑礼率",
      "来源ClientID",
      "状态",
      "状态代码",
      "幂等键",
      "收货人",
      "收货电话",
      "收货地址",
      "承运商",
      "运单号",
      "完成时间",
      "取消时间",
      "取消原因",
      "创建时间",
    ],
    rows: (async function* () {
      for await (const userIds of iterateUserIdBatches(options.where, batchSize)) {
        const items = await prisma.pointRedemption.findMany({
          where: { userId: { in: userIds } },
          orderBy: [{ createdAt: "desc" }, { id: "asc" }],
          select: {
            id: true,
            userId: true,
            productId: true,
            productName: true,
            priceYuan: true,
            points: true,
            level: true,
            redeemRate: true,
            clientId: true,
            status: true,
            reference: true,
            recipient: true,
            phone: true,
            address: true,
            carrier: true,
            waybillNo: true,
            fulfilledAt: true,
            cancelledAt: true,
            cancelNote: true,
            createdAt: true,
          },
        });
        const byUser = groupByUser(items);
        for (const userId of userIds) {
          for (const item of byUser.get(userId) ?? []) {
            yield [
              item.userId,
              item.id,
              item.productId ?? "",
              item.productName,
              Number(item.priceYuan),
              item.points,
              item.level ? (MEMBERSHIP_LABELS[item.level] ?? item.level) : "",
              item.redeemRate === null ? "" : Number(item.redeemRate),
              item.clientId ?? "",
              REDEMPTION_STATUS_LABELS[item.status] ?? item.status,
              item.status,
              item.reference,
              options.canReadSensitive ? (item.recipient ?? "") : maskIdentifier(item.recipient),
              options.canReadSensitive
                ? (item.phone ?? "")
                : item.phone
                  ? maskPhone(item.phone)
                  : "",
              options.canReadSensitive ? (item.address ?? "") : maskAddress(item.address),
              item.carrier ?? "",
              item.waybillNo ?? "",
              toIso(item.fulfilledAt),
              toIso(item.cancelledAt),
              item.cancelNote ?? "",
              toIso(item.createdAt),
            ];
          }
        }
      }
    })(),
  };
}

function addressesEntry(options: DatabaseExportOptions): ExportCsvEntry {
  const batchSize = options.batchSize ?? USER_EXPORT_BATCH_SIZE;
  return {
    name: "addresses.csv",
    kind: "csv",
    headers: [
      "用户ID",
      "地址ID",
      "收货人",
      "电话",
      "省市区",
      "详细地址",
      "是否默认",
      "创建时间",
      "更新时间",
    ],
    rows: (async function* () {
      for await (const userIds of iterateUserIdBatches(options.where, batchSize)) {
        const items = await prisma.userAddress.findMany({
          where: { userId: { in: userIds } },
          orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }, { id: "asc" }],
          select: {
            id: true,
            userId: true,
            recipient: true,
            phone: true,
            region: true,
            detail: true,
            isDefault: true,
            createdAt: true,
            updatedAt: true,
          },
        });
        const byUser = groupByUser(items);
        for (const userId of userIds) {
          for (const item of byUser.get(userId) ?? []) {
            yield [
              item.userId,
              item.id,
              options.canReadSensitive ? item.recipient : maskIdentifier(item.recipient),
              options.canReadSensitive ? item.phone : maskPhone(item.phone),
              item.region,
              options.canReadSensitive ? item.detail : maskAddress(item.detail),
              yesNo(item.isDefault),
              toIso(item.createdAt),
              toIso(item.updatedAt),
            ];
          }
        }
      }
    })(),
  };
}

function spentEntry(options: DatabaseExportOptions): ExportCsvEntry {
  const batchSize = options.batchSize ?? USER_EXPORT_BATCH_SIZE;
  return {
    name: "spent-adjustments.csv",
    kind: "csv",
    headers: [
      "用户ID",
      "申请ID",
      "渠道",
      "渠道代码",
      "订单号",
      "经销商",
      "申报金额(元)",
      "消费日期",
      "凭证数量",
      "凭证链接(JSON)",
      "备注",
      "状态",
      "状态代码",
      "核实金额(元)",
      "审核备注",
      "审核人",
      "审核时间",
      "创建时间",
      "更新时间",
    ],
    rows: (async function* () {
      for await (const userIds of iterateUserIdBatches(options.where, batchSize)) {
        const items = await prisma.spentAdjustmentApplication.findMany({
          where: { userId: { in: userIds } },
          orderBy: [{ createdAt: "desc" }, { id: "asc" }],
          select: {
            id: true,
            userId: true,
            channel: true,
            orderNo: true,
            dealerName: true,
            amountClaimed: true,
            purchasedAt: true,
            images: true,
            note: true,
            status: true,
            reviewAmount: true,
            reviewNote: true,
            reviewedAt: true,
            createdAt: true,
            updatedAt: true,
            reviewedBy: { select: { name: true, email: true } },
          },
        });
        const byUser = groupByUser(items);
        for (const userId of userIds) {
          for (const item of byUser.get(userId) ?? []) {
            yield [
              item.userId,
              item.id,
              SPENT_CHANNEL_LABELS[item.channel] ?? item.channel,
              item.channel,
              options.canReadSensitive ? item.orderNo : maskIdentifier(item.orderNo),
              item.dealerName ?? "",
              item.amountClaimed ?? "",
              toIso(item.purchasedAt),
              item.images.length,
              options.canReadSensitive ? jsonCell(item.images) : "",
              item.note ?? "",
              SPENT_STATUS_LABELS[item.status] ?? item.status,
              item.status,
              item.reviewAmount ?? "",
              item.reviewNote ?? "",
              item.reviewedBy ? `${item.reviewedBy.name} (${item.reviewedBy.email})` : "",
              toIso(item.reviewedAt),
              toIso(item.createdAt),
              toIso(item.updatedAt),
            ];
          }
        }
      }
    })(),
  };
}

function levelChangesEntry(options: DatabaseExportOptions): ExportCsvEntry {
  const batchSize = options.batchSize ?? USER_EXPORT_BATCH_SIZE;
  return {
    name: "level-changes.csv",
    kind: "csv",
    headers: [
      "用户ID",
      "变更ID",
      "原等级",
      "原等级代码",
      "新等级",
      "新等级代码",
      "幂等键",
      "备注",
      "创建时间",
    ],
    rows: (async function* () {
      for await (const userIds of iterateUserIdBatches(options.where, batchSize)) {
        const items = await prisma.membershipLevelChange.findMany({
          where: { userId: { in: userIds } },
          orderBy: [{ createdAt: "desc" }, { id: "asc" }],
          select: {
            id: true,
            userId: true,
            fromLevel: true,
            toLevel: true,
            reference: true,
            note: true,
            createdAt: true,
          },
        });
        const byUser = groupByUser(items);
        for (const userId of userIds) {
          for (const item of byUser.get(userId) ?? []) {
            yield [
              item.userId,
              item.id,
              MEMBERSHIP_LABELS[item.fromLevel] ?? item.fromLevel,
              item.fromLevel,
              MEMBERSHIP_LABELS[item.toLevel] ?? item.toLevel,
              item.toLevel,
              item.reference,
              item.note ?? "",
              toIso(item.createdAt),
            ];
          }
        }
      }
    })(),
  };
}

function loginAttemptsEntry(options: DatabaseExportOptions): ExportCsvEntry {
  const batchSize = options.batchSize ?? USER_EXPORT_BATCH_SIZE;
  return {
    name: "login-attempts.csv",
    kind: "csv",
    headers: [
      "用户ID",
      "记录ID",
      "登录方式",
      "登录方式代码",
      "是否成功",
      "失败原因",
      "IP地址",
      "UserAgent",
      "来源ClientID",
      "创建时间",
    ],
    rows: (async function* () {
      for await (const userIds of iterateUserIdBatches(options.where, batchSize)) {
        const items = await prisma.loginAttempt.findMany({
          where: { userId: { in: userIds } },
          orderBy: [{ createdAt: "desc" }, { id: "asc" }],
          select: {
            id: true,
            userId: true,
            type: true,
            success: true,
            reason: true,
            ipAddress: true,
            userAgent: true,
            clientId: true,
            createdAt: true,
          },
        });
        const byUser = groupByUser(items);
        for (const userId of userIds) {
          for (const item of byUser.get(userId) ?? []) {
            yield [
              item.userId,
              item.id,
              LOGIN_TYPE_LABELS[item.type] ?? item.type,
              item.type,
              yesNo(item.success),
              item.reason ?? "",
              options.canReadSensitive ? (item.ipAddress ?? "") : "",
              options.canReadSensitive ? (item.userAgent ?? "") : "",
              item.clientId ?? "",
              toIso(item.createdAt),
            ];
          }
        }
      }
    })(),
  };
}

function accountDeletionsEntry(options: DatabaseExportOptions): ExportCsvEntry {
  const batchSize = options.batchSize ?? USER_EXPORT_BATCH_SIZE;
  return {
    name: "account-deletions.csv",
    kind: "csv",
    headers: [
      "用户ID",
      "申请ID",
      "状态",
      "状态代码",
      "原因",
      "申请时间",
      "计划执行时间",
      "取消时间",
      "完成时间",
      "尝试次数",
      "最后错误",
    ],
    rows: (async function* () {
      for await (const userIds of iterateUserIdBatches(options.where, batchSize)) {
        const items = await prisma.accountDeletionRequest.findMany({
          where: { userId: { in: userIds } },
          orderBy: [{ requestedAt: "desc" }, { id: "asc" }],
          select: {
            id: true,
            userId: true,
            status: true,
            reason: true,
            requestedAt: true,
            scheduledAt: true,
            cancelledAt: true,
            completedAt: true,
            attempts: true,
            lastError: true,
          },
        });
        const byUser = groupByUser(items);
        for (const userId of userIds) {
          for (const item of byUser.get(userId) ?? []) {
            yield [
              item.userId,
              item.id,
              DELETION_STATUS_LABELS[item.status] ?? item.status,
              item.status,
              item.reason ?? "",
              toIso(item.requestedAt),
              toIso(item.scheduledAt),
              toIso(item.cancelledAt),
              toIso(item.completedAt),
              item.attempts,
              item.lastError ?? "",
            ];
          }
        }
      }
    })(),
  };
}

export function buildDatabaseExportEntries(options: DatabaseExportOptions): UserExportEntry[] {
  const selected = new Set(options.groups);
  const entries: UserExportEntry[] = [usersEntry(options)];
  if (selected.has("identities")) entries.push(identitiesEntry(options));
  if (selected.has("points")) entries.push(pointsEntry(options));
  if (selected.has("redemptions")) entries.push(redemptionsEntry(options));
  if (selected.has("addresses")) entries.push(addressesEntry(options));
  if (selected.has("spent")) entries.push(spentEntry(options));
  if (selected.has("growth")) entries.push(levelChangesEntry(options));
  if (selected.has("logins")) entries.push(loginAttemptsEntry(options));
  if (selected.has("deletions")) entries.push(accountDeletionsEntry(options));
  return entries;
}

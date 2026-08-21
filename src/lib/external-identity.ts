/**
 * 外部平台身份辅助模块（多平台聚合框架）
 *
 * ExternalIdentity 是统一的外部身份存储：一个用户可绑定多个平台身份
 * （wechat_open / wechat_mp / wechat_miniprogram，未来 apple / alipay 等）。
 *
 * 双写过渡说明：User.wechatOpenId / wechatUnionId 旧列仍被现有微信流程使用，
 * 所有写入点在更新旧列的同时调用本模块 upsert/remove，保持两侧一致。
 * 后续独立任务再收口为单一数据源。
 */
import { prisma } from "./prisma";

/** 身份存储客户端（支持传入事务 tx，默认用全局 prisma） */
type IdentityStore = Pick<typeof prisma, "externalIdentity">;

/** 身份元数据（昵称/头像等快照，可空；JSON 兼容的平坦键值） */
export type ExternalIdentityMetadata = Record<string, string | number | boolean | null> | null;

/**
 * 按 provider + 平台内唯一标识查找用户
 * @returns 绑定该身份的 User，未找到返回 null
 */
export async function findUserByIdentity(provider: string, subjectId: string) {
  const identity = await prisma.externalIdentity.findUnique({
    where: { provider_subjectId: { provider, subjectId } },
    select: { userId: true },
  });
  if (!identity) return null;
  return prisma.user.findUnique({ where: { id: identity.userId } });
}

/**
 * 按 UnionID 聚合查找用户（跨应用）
 * UnionID 的意义就是跨应用聚合（开放平台/服务号/小程序同一用户 unionid 相同）。
 * 不同平台的 unionid 属不同命名空间（如微信 UnionID 与抖音 union_id 互不相通），
 * 调用方应显式传入 provider（单个或同系数组）限定查找范围，避免跨命名空间串扰；
 * 不传时全表查找（仅限确知无串扰风险的场景）。
 * @returns 绑定该 unionId 的 User（取最早绑定的身份），未找到返回 null
 */
export async function findUserByUnionId(unionId: string, provider?: string | string[]) {
  const identity = await prisma.externalIdentity.findFirst({
    where: {
      unionId,
      ...(provider
        ? Array.isArray(provider)
          ? { provider: { in: provider } }
          : { provider }
        : {}),
    },
    orderBy: { createdAt: "asc" },
    select: { userId: true },
  });
  if (!identity) return null;
  return prisma.user.findUnique({ where: { id: identity.userId } });
}

/**
 * 写入/更新外部身份（upsert by [provider, subjectId]）
 * 冲突时更新归属用户与 unionId/metadata——调用方必须已完成归属决策。
 * @param client 可选事务客户端；与 user 更新同事务调用可保证双写一致性
 */
export async function upsertIdentity(
  userId: string,
  provider: string,
  subjectId: string,
  unionId?: string | null,
  metadata?: ExternalIdentityMetadata,
  client: IdentityStore = prisma
) {
  return client.externalIdentity.upsert({
    where: { provider_subjectId: { provider, subjectId } },
    update: {
      userId,
      ...(unionId !== undefined && unionId !== null ? { unionId } : {}),
      ...(metadata !== undefined && metadata !== null ? { metadata } : {}),
    },
    create: {
      userId,
      provider,
      subjectId,
      unionId: unionId ?? null,
      metadata: metadata ?? undefined,
    },
  });
}

/**
 * 移除用户的外部身份（解绑场景）
 * @param providerPrefix 如 "wechat" 移除全部微信系身份；不传则移除该用户全部外部身份
 * @returns 被删除的行数
 */
export async function removeIdentities(userId: string, providerPrefix?: string) {
  const result = await prisma.externalIdentity.deleteMany({
    where: {
      userId,
      ...(providerPrefix ? { provider: { startsWith: providerPrefix } } : {}),
    },
  });
  return result.count;
}

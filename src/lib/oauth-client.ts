/**
 * OAuth Client 管理库
 *
 * 用于 OAuth 2.0 授权码模式中管理已注册的子项目（Client）。
 * 每个子项目注册后获得 clientId + clientSecret，用于授权流程。
 */
import { prisma } from "./prisma";
import { z } from "zod";
import { randomBytes } from "crypto";
import { getInternalApiKeys } from "./internal-api";
import { apiConsole } from "@/lib/logger";
import { sendBackchannelLogout, isBlockedHostname } from "./backchannel-logout";
import { SUPPORTED_SCOPES } from "./oauth-constants";

// ============================================
// 参数校验
// ============================================

/**
 * 公网 https URI 校验（与 backchannel-logout 的 SSRF 防护共用主机名黑名单）
 * @param rejectFragment - redirect URI 按 OAuth 2.0 规范（RFC 6749 §3.1.2）不允许带 fragment
 */
function isPublicHttpsUrl(u: string, rejectFragment = false): boolean {
  try {
    const parsed = new URL(u);
    if (parsed.protocol !== "https:") return false;
    if (rejectFragment && parsed.hash) return false;
    if (isBlockedHostname(parsed.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

const uriSchema = z
  .string()
  .url()
  .max(500)
  .refine((u) => isPublicHttpsUrl(u, true), { message: "必须是 https:// 公网地址，且不允许带 fragment" });

/** scope 白名单收敛：仅允许系统支持的 scope */
const scopesSchema = z
  .array(z.string().min(1).max(50))
  .min(1)
  .refine((scopes) => scopes.every((s) => SUPPORTED_SCOPES.includes(s)), {
    message: `scopes 仅支持: ${SUPPORTED_SCOPES.join(", ")}`,
  });

const backchannelLogoutUriSchema = z
  .string()
  .url()
  .max(500)
  .refine((u) => isPublicHttpsUrl(u), { message: "必须是 https:// 公网地址" });

const createClientSchema = z.object({
  name: z.string().min(1).max(100),
  redirectUris: z.array(uriSchema).min(1),
  postLogoutRedirectUris: z.array(uriSchema).optional().default([]),
  scopes: scopesSchema,
  isPublic: z.boolean().optional().default(false),
  backchannelLogoutUri: backchannelLogoutUriSchema.optional(),
  codeTtlSeconds: z.number().int().min(60).max(600).optional().default(300),
  accessTokenTtlSeconds: z.number().int().min(60).max(86400).optional().default(900),
});

const updateClientSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  redirectUris: z.array(uriSchema).min(1).optional(),
  postLogoutRedirectUris: z.array(uriSchema).optional(),
  scopes: scopesSchema.optional(),
  isActive: z.boolean().optional(),
  isPublic: z.boolean().optional(),
  backchannelLogoutUri: backchannelLogoutUriSchema.nullable().optional(),
  codeTtlSeconds: z.number().int().min(60).max(600).optional(),
  accessTokenTtlSeconds: z.number().int().min(60).max(86400).optional(),
});

// ============================================
// 类型定义
// ============================================

/**
 * 返回去敏后的 client 数据（不含 clientSecret），用于 API 响应。
 * 使用显式字段白名单，避免依赖解构排除模式。
 */
export function toSafeClientResponse(
  client: OAuthClientData
): Omit<OAuthClientData, "clientSecret"> {
  return {
    id: client.id,
    clientId: client.clientId,
    name: client.name,
    redirectUris: client.redirectUris,
    postLogoutRedirectUris: client.postLogoutRedirectUris,
    scopes: client.scopes,
    isActive: client.isActive,
    isPublic: client.isPublic,
    backchannelLogoutUri: client.backchannelLogoutUri,
    codeTtlSeconds: client.codeTtlSeconds,
    accessTokenTtlSeconds: client.accessTokenTtlSeconds,
    createdAt: client.createdAt,
    updatedAt: client.updatedAt,
  };
}

export interface OAuthClientData {
  id: string;
  clientId: string;
  clientSecret?: string; // 仅在创建时返回明文
  name: string;
  redirectUris: string[];
  postLogoutRedirectUris: string[];
  scopes: string[];
  isActive: boolean;
  isPublic: boolean;
  backchannelLogoutUri: string | null;
  codeTtlSeconds: number;
  accessTokenTtlSeconds: number;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================
// 工具函数
// ============================================

/**
 * 生成 clientId：nanoid 风格 24 字符
 */
function generateClientId(): string {
  const MAX_ITERATIONS = 8;
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const maxValid = Math.floor(256 / chars.length) * chars.length;
  let result = "";
  let iterations = 0;
  while (iterations < MAX_ITERATIONS && result.length < 24) {
    iterations++;
    const bytes = randomBytes(48);
    for (let i = 0; i < bytes.length && result.length < 24; i++) {
      if (bytes[i] >= maxValid) continue;
      result += chars[bytes[i] % chars.length];
    }
  }
  // 兜底：若 rejection sampling 不足（极不可能），继续用 rejection sampling 补足
  // （不能直接用取模，256 不能被 36 整除会产生取模偏置）
  while (result.length < 24) {
    const fallback = randomBytes(24);
    for (let i = 0; i < fallback.length && result.length < 24; i++) {
      if (fallback[i] >= maxValid) continue;
      result += chars[fallback[i] % chars.length];
    }
  }
  return result;
}

/**
 * 生成 clientSecret：32 字节 base64
 */
function generateClientSecret(): string {
  return randomBytes(32).toString("base64");
}

/**
 * 获取 bcrypt 哈希（延迟加载避免循环依赖）
 */
async function hashSecret(secret: string): Promise<string> {
  const bcrypt = await import("bcryptjs");
  return bcrypt.hash(secret, 12);
}

/**
 * 验证 client_secret
 */
async function verifySecret(secret: string, hash: string): Promise<boolean> {
  const bcrypt = await import("bcryptjs");
  return bcrypt.compare(secret, hash);
}

// ============================================
// 密钥轮换缓存（5 分钟过渡期）
// ============================================

/**
 * 旧 secret hash 缓存，用于密钥轮换后的平滑过渡。
 * key: clientId, value: { oldHash, expiresAt }
 *
 * ⚠️ 多实例部署注意：此缓存仅在当前进程内存中生效。
 * 密钥轮换请求仅被一个实例处理，其他实例的缓存中不会存储旧 hash，
 * 导致 5 分钟过渡期内其他实例立即拒绝旧密钥。
 * 多实例环境需将旧 hash 存入共享存储（如 Redis）或使用数据库。
 */
const oldSecretCache = new Map<string, { oldHash: string; expiresAt: number }>();

/**
 * 缓存旧 secret hash，供 verifyOAuthClientSecret 在过渡期内回退匹配。
 * 轮换密钥时由 rotate-secret API 调用。
 */
export function cacheOldSecret(clientId: string, oldHash: string): void {
  oldSecretCache.set(clientId, {
    oldHash,
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 分钟过渡期
  });
}

// ============================================
// CRUD 操作
// ============================================

/**
 * 创建 OAuth Client（返回明文 secret 仅此一次）
 */
export async function createOAuthClient(
  data: z.infer<typeof createClientSchema>
): Promise<{ client: OAuthClientData; plainSecret: string }> {
  const parsed = createClientSchema.parse(data);
  const clientId = generateClientId();
  const plainSecret = generateClientSecret();
  const secretHash = await hashSecret(plainSecret);

  const client = await prisma.oAuthClient.create({
    data: {
      clientId,
      clientSecret: secretHash,
      name: parsed.name,
      redirectUris: parsed.redirectUris,
      postLogoutRedirectUris: parsed.postLogoutRedirectUris,
      scopes: parsed.scopes,
      isPublic: parsed.isPublic,
      backchannelLogoutUri: parsed.backchannelLogoutUri || null,
      codeTtlSeconds: parsed.codeTtlSeconds,
      accessTokenTtlSeconds: parsed.accessTokenTtlSeconds,
    },
  });

  return {
    client: {
      id: client.id,
      clientId: client.clientId,
      clientSecret: plainSecret,
      name: client.name,
      redirectUris: client.redirectUris,
      postLogoutRedirectUris: client.postLogoutRedirectUris,
      scopes: client.scopes,
      isActive: client.isActive,
      isPublic: client.isPublic,
      backchannelLogoutUri: client.backchannelLogoutUri,
      codeTtlSeconds: client.codeTtlSeconds,
      accessTokenTtlSeconds: client.accessTokenTtlSeconds,
      createdAt: client.createdAt,
      updatedAt: client.updatedAt,
    },
    plainSecret,
  };
}

/**
 * 按 clientId 查询 OAuth Client（不含 secret）
 */
export async function getOAuthClientByClientId(clientId: string): Promise<OAuthClientData | null> {
  const client = await prisma.oAuthClient.findFirst({
    where: { clientId },
  });
  if (!client) return null;
  return {
    id: client.id,
    clientId: client.clientId,
    name: client.name,
    redirectUris: client.redirectUris,
    postLogoutRedirectUris: client.postLogoutRedirectUris,
    scopes: client.scopes,
    isActive: client.isActive,
    isPublic: client.isPublic,
    backchannelLogoutUri: client.backchannelLogoutUri,
    codeTtlSeconds: client.codeTtlSeconds,
    accessTokenTtlSeconds: client.accessTokenTtlSeconds,
    createdAt: client.createdAt,
    updatedAt: client.updatedAt,
  };
}

export interface VerifyClientResult {
  client: OAuthClientData | null;
  reason: "ok" | "not_found" | "disabled" | "invalid_secret";
}

/**
 * 预计算的 bcrypt dummy hash（cost 12，与真实 secret 一致）。
 * clientId 不存在时也执行一次比较，消除 clientId 枚举的时序侧信道。
 */
const DUMMY_SECRET_HASH = "$2b$12$Lx3ziMGPANWOQnKuh61SCOW6fsmL4T9HANUEOxkKtShykBMdeFcpC";

/**
 * 按 clientId 验证 client_secret
 * - Confidential Client：必须提供并验证 client_secret
 * - Public Client：当 allowPublic=true 且未提供 secret 时直接通过（用于 token 端点）
 *
 * 返回包含详细原因的 result 对象，调用方可根据 reason 返回不同错误码
 */
export async function verifyOAuthClientSecret(
  clientId: string,
  secret?: string,
  options?: { allowPublic?: boolean }
): Promise<VerifyClientResult> {
  const client = await prisma.oAuthClient.findFirst({
    where: { clientId },
  });

  if (!client) {
    // 时序侧信道缓解：clientId 不存在时也执行一次 dummy bcrypt 比较，
    // 使响应时间与"client 存在但 secret 错误"的情况一致
    await verifySecret(secret ?? "", DUMMY_SECRET_HASH);
    return { client: null, reason: "not_found" };
  }

  if (!client.isActive) {
    return { client: null, reason: "disabled" };
  }

  let valid = false;
  if (client.isPublic && options?.allowPublic && !secret) {
    valid = true;
  } else if (secret) {
    // 优先匹配当前 hash
    valid = await verifySecret(secret, client.clientSecret);

    // 回退：检查旧 secret 缓存（密钥轮换过渡期）
    if (!valid) {
      const cached = oldSecretCache.get(clientId);
      if (cached && Date.now() < cached.expiresAt) {
        valid = await verifySecret(secret, cached.oldHash);
      }
    }
  }

  // 清理过期缓存条目
  const cached = oldSecretCache.get(clientId);
  if (cached && Date.now() >= cached.expiresAt) {
    oldSecretCache.delete(clientId);
  }

  if (!valid) return { client: null, reason: "invalid_secret" };

  return {
    client: {
      id: client.id,
      clientId: client.clientId,
      name: client.name,
      redirectUris: client.redirectUris,
      postLogoutRedirectUris: client.postLogoutRedirectUris,
      scopes: client.scopes,
      isActive: client.isActive,
      isPublic: client.isPublic,
      backchannelLogoutUri: client.backchannelLogoutUri,
      codeTtlSeconds: client.codeTtlSeconds,
      accessTokenTtlSeconds: client.accessTokenTtlSeconds,
      createdAt: client.createdAt,
      updatedAt: client.updatedAt,
    },
    reason: "ok" as const,
  };
}

/**
 * 按内部 ID 查询
 */
export async function getOAuthClientById(id: string): Promise<OAuthClientData | null> {
  const client = await prisma.oAuthClient.findUnique({ where: { id } });
  if (!client) return null;
  return {
    id: client.id,
    clientId: client.clientId,
    name: client.name,
    redirectUris: client.redirectUris,
    postLogoutRedirectUris: client.postLogoutRedirectUris,
    scopes: client.scopes,
    isActive: client.isActive,
    isPublic: client.isPublic,
    backchannelLogoutUri: client.backchannelLogoutUri,
    codeTtlSeconds: client.codeTtlSeconds,
    accessTokenTtlSeconds: client.accessTokenTtlSeconds,
    createdAt: client.createdAt,
    updatedAt: client.updatedAt,
  };
}

/**
 * 更新 OAuth Client
 */
export async function updateOAuthClient(
  id: string,
  data: z.infer<typeof updateClientSchema>
): Promise<OAuthClientData | null> {
  const parsed = updateClientSchema.parse(data);
  try {
    const client = await prisma.oAuthClient.update({
      where: { id },
      data: parsed,
    });
    return {
      id: client.id,
      clientId: client.clientId,
      name: client.name,
      redirectUris: client.redirectUris,
      postLogoutRedirectUris: client.postLogoutRedirectUris,
      scopes: client.scopes,
      isActive: client.isActive,
      isPublic: client.isPublic,
      backchannelLogoutUri: client.backchannelLogoutUri,
      codeTtlSeconds: client.codeTtlSeconds,
      accessTokenTtlSeconds: client.accessTokenTtlSeconds,
      createdAt: client.createdAt,
      updatedAt: client.updatedAt,
    };
  } catch (err) {
    apiConsole.error("[OAuthClient] updateOAuthClient 失败:", err);
    return null;
  }
}

/**
 * 删除 OAuth Client（硬删除）
 *
 * 删除前会清理该 client 关联的会话、授权、 consent 与 refresh token 记录，
 * 避免已删除 client 的历史数据残留。
 * 注意：ssoAuditEvent 刻意保留不级联删除——审计事件中的 clientName 字段
 * 本为冗余留存设计，用于 client 删除后仍可追溯历史事件。
 */
export async function deleteOAuthClient(id: string): Promise<boolean> {
  try {
    const client = await prisma.oAuthClient.findUnique({
      where: { id },
      select: { clientId: true, backchannelLogoutUri: true },
    });
    if (!client) return false;

    // 删除前查询活跃用户 → 发送 Backchannel Logout 通知
    if (client.backchannelLogoutUri) {
      const activeSessions = await prisma.oAuthSession.findMany({
        where: { clientId: client.clientId, revokedAt: null },
        select: { userId: true },
        distinct: ["userId"],
      });
      for (const uid of new Set(activeSessions.map((s) => s.userId))) {
        await sendBackchannelLogout(uid, [client.clientId], { includeInactive: true });
      }
    }

    await prisma.$transaction(async (tx) => {
      // 清理关联数据
      await tx.oAuthSession.deleteMany({ where: { clientId: client.clientId } });
      await tx.userConsent.deleteMany({ where: { clientId: client.clientId } });
      await tx.refreshToken.deleteMany({ where: { clientId: client.clientId } });
      await tx.oAuthAuthorizationCode.deleteMany({ where: { clientId: client.clientId } });
      // 删除 client 本身（ssoAuditEvent 审计日志刻意保留，用于合规追溯）
      await tx.oAuthClient.delete({ where: { id } });
    });

    return true;
  } catch (err) {
    apiConsole.error("[OAuthClient] deleteOAuthClient 失败:", err);
    return false;
  }
}

/**
 * 列出所有 OAuth Client（管理后台用）
 */
export async function listOAuthClients(params?: {
  isActive?: boolean;
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ clients: OAuthClientData[]; total: number }> {
  const { isActive, search, page = 1, pageSize = 20 } = params || {};
  const where: Record<string, unknown> = {};
  if (isActive !== undefined) where.isActive = isActive;
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { clientId: { contains: search, mode: "insensitive" } },
    ];
  }

  const [clients, total] = await Promise.all([
    prisma.oAuthClient.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: "desc" },
    }),
    prisma.oAuthClient.count({ where }),
  ]);

  return {
    clients: clients.map((c) => ({
      id: c.id,
      clientId: c.clientId,
      name: c.name,
      redirectUris: c.redirectUris,
      postLogoutRedirectUris: c.postLogoutRedirectUris,
      scopes: c.scopes,
      isActive: c.isActive,
      isPublic: c.isPublic,
      backchannelLogoutUri: c.backchannelLogoutUri,
      codeTtlSeconds: c.codeTtlSeconds,
      accessTokenTtlSeconds: c.accessTokenTtlSeconds,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    })),
    total,
  };
}

/**
 * 通过内部 API Key 查找对应的 OAuth Client
 * 桥接现有 Advisor 等子站使用的 Internal API 密钥体系。
 *
 * 注意：此函数仅从内存配置中查找 project 名称，
 * 实际数据库查询需由调用方异步执行（使用 findClientByName）。
 * 内部 API Key 在进程启动时从 INTERNAL_API_KEYS 环境变量加载，
 * 修改密钥后需重启实例才能生效（不支持热更新）。
 *
 * @deprecated 此存根已无调用者，请直接使用 {@link findClientByName}。
 *             保留仅为向后兼容，未来版本将移除。
 * @returns InternalApiKeyConfig 项目配置（不含 DB 信息），
 *          或 null（调用方应回退到 client_secret 认证）
 */
export function getClientByInternalApiKey(
  apiKey: string
): { project: string; name: string } | null {
  const { keys } = getInternalApiKeys();
  const config = keys.get(apiKey);
  if (!config) return null;
  return { project: config.project, name: config.project };
}

/**
 * 按名称查找 Client（用于 Internal API 桥接）
 */
export async function findClientByName(name: string): Promise<OAuthClientData | null> {
  const client = await prisma.oAuthClient.findFirst({
    where: { name, isActive: true },
  });
  if (!client) return null;
  return {
    id: client.id,
    clientId: client.clientId,
    name: client.name,
    redirectUris: client.redirectUris,
    postLogoutRedirectUris: client.postLogoutRedirectUris,
    scopes: client.scopes,
    isActive: client.isActive,
    isPublic: client.isPublic,
    backchannelLogoutUri: client.backchannelLogoutUri,
    codeTtlSeconds: client.codeTtlSeconds,
    accessTokenTtlSeconds: client.accessTokenTtlSeconds,
    createdAt: client.createdAt,
    updatedAt: client.updatedAt,
  };
}

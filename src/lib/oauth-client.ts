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

// ============================================
// 参数校验
// ============================================

const createClientSchema = z.object({
  name: z.string().min(1).max(100),
  redirectUris: z.array(z.string().url().max(500)).min(1),
  postLogoutRedirectUris: z.array(z.string().url().max(500)).optional().default([]),
  scopes: z.array(z.string().min(1).max(50)).min(1),
  isPublic: z.boolean().optional().default(false),
  backchannelLogoutUri: z.string().url().max(500).optional(),
});

const updateClientSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  redirectUris: z.array(z.string().url().max(500)).min(1).optional(),
  postLogoutRedirectUris: z.array(z.string().url().max(500)).optional(),
  scopes: z.array(z.string().min(1).max(50)).min(1).optional(),
  isActive: z.boolean().optional(),
  isPublic: z.boolean().optional(),
  backchannelLogoutUri: z.string().url().max(500).nullable().optional(),
});

// ============================================
// 类型定义
// ============================================

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
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  const bytes = randomBytes(24);
  for (let i = 0; i < 24; i++) {
    result += chars[bytes[i] % chars.length];
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
      createdAt: client.createdAt,
      updatedAt: client.updatedAt,
    },
    plainSecret,
  };
}

/**
 * 按 clientId 查询 OAuth Client（不含 secret）
 */
export async function getOAuthClientByClientId(
  clientId: string
): Promise<OAuthClientData | null> {
  const client = await prisma.oAuthClient.findFirst({
    where: { clientId, isActive: true },
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
    createdAt: client.createdAt,
    updatedAt: client.updatedAt,
  };
}

/**
 * 按 clientId 验证 client_secret
 * - Confidential Client：必须提供并验证 client_secret
 * - Public Client：当 allowPublic=true 且未提供 secret 时直接通过（用于 token 端点）
 */
export async function verifyOAuthClientSecret(
  clientId: string,
  secret?: string,
  options?: { allowPublic?: boolean }
): Promise<OAuthClientData | null> {
  const client = await prisma.oAuthClient.findFirst({
    where: { clientId, isActive: true },
  });
  if (!client) return null;

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

  if (!valid) return null;

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
    createdAt: client.createdAt,
    updatedAt: client.updatedAt,
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
      createdAt: client.createdAt,
      updatedAt: client.updatedAt,
    };
  } catch {
    return null;
  }
}

/**
 * 删除 OAuth Client（硬删除）
 *
 * 删除前会清理该 client 关联的会话、授权、 consent 与 refresh token 记录，
 * 避免已删除 client 的历史数据残留。
 */
export async function deleteOAuthClient(id: string): Promise<boolean> {
  try {
    const client = await prisma.oAuthClient.findUnique({
      where: { id },
      select: { clientId: true },
    });
    if (!client) return false;

    await prisma.$transaction(async (tx) => {
      // 清理关联数据
      await tx.oAuthSession.deleteMany({ where: { clientId: client.clientId } });
      await tx.userConsent.deleteMany({ where: { clientId: client.clientId } });
      await tx.refreshToken.deleteMany({ where: { clientId: client.clientId } });
      await tx.oAuthAuthorizationCode.deleteMany({ where: { clientId: client.clientId } });
      // 删除 client 本身
      await tx.oAuthClient.delete({ where: { id } });
    });

    return true;
  } catch {
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
    createdAt: client.createdAt,
    updatedAt: client.updatedAt,
  };
}

/**
 * OAuth 授权码管理库
 *
 * 管理 OAuth 2.0 授权码的创建、消费和清理。
 * 授权码为 32 字节随机 hex，以 SHA-256 哈希存储在数据库中。
 * 消费时使用原子化 updateMany + used=false 乐观锁保证一次性使用。
 */
import { prisma } from "./prisma";
import { createHash, randomBytes } from "crypto";

// 授权码有效期：5 分钟
const CODE_TTL_MS = 5 * 60 * 1000;

/**
 * 生成授权码原始值（32 字节 hex）
 */
function generateCode(): string {
  return randomBytes(32).toString("hex");
}

/**
 * 对授权码进行 SHA-256 哈希（存储用）
 */
export function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export interface AuthorizationCodeData {
  id: string;
  code: string; // 原始明文 code（仅在创建时返回）
  clientId: string;
  userId: string;
  redirectUri: string;
  scopes: string[];
  codeChallenge: string | null;
  codeChallengeMethod: string | null;
  nonce: string | null;
  expiresAt: Date;
}

/**
 * 创建授权码
 *
 * @param params.clientId - OAuth Client ID
 * @param params.userId - 用户 ID
 * @param params.redirectUri - 回调 URL
 * @param params.scopes - 权限范围
 * @param params.codeChallenge - PKCE code_challenge
 * @param params.codeChallengeMethod - PKCE 方法（S256）
 * @returns 包含明文 code 的数据，调用方需将明文 code 返回给 client
 */
export async function createAuthorizationCode(params: {
  clientId: string;
  userId: string;
  redirectUri: string;
  scopes: string[];
  codeChallenge?: string;
  codeChallengeMethod?: string;
  nonce?: string;
}): Promise<AuthorizationCodeData> {
  const rawCode = generateCode();
  const codeHash = hashCode(rawCode);
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);

  const record = await prisma.oAuthAuthorizationCode.create({
    data: {
      code: codeHash,
      clientId: params.clientId,
      userId: params.userId,
      redirectUri: params.redirectUri,
      scopes: params.scopes,
      codeChallenge: params.codeChallenge || null,
      codeChallengeMethod: params.codeChallengeMethod || null,
      nonce: params.nonce || null,
      expiresAt,
    },
  });

  return {
    id: record.id,
    code: rawCode,
    clientId: record.clientId,
    userId: record.userId,
    redirectUri: record.redirectUri,
    scopes: record.scopes,
    codeChallenge: record.codeChallenge,
    codeChallengeMethod: record.codeChallengeMethod,
    nonce: record.nonce,
    expiresAt: record.expiresAt,
  };
}

/**
 * 消费授权码（原子化标记 used=true）
 *
 * 使用 updateMany + used=false 条件实现乐观锁，
 * 防止并发重复使用同一授权码。
 *
 * @param rawCode - 明文授权码
 * @returns 消费成功返回记录数据，失败（已使用/不存在）返回 null
 */
export async function consumeAuthorizationCode(
  rawCode: string
): Promise<Omit<AuthorizationCodeData, "code"> | null> {
  const codeHash = hashCode(rawCode);

  // 原子化消费：仅当 used=false 时才更新
  const result = await prisma.oAuthAuthorizationCode.updateMany({
    where: { code: codeHash, used: false },
    data: { used: true },
  });

  if (result.count === 0) {
    return null; // 已使用或不存在
  }

  // 获取完整记录
  const record = await prisma.oAuthAuthorizationCode.findUnique({
    where: { code: codeHash },
  });

  if (!record) return null;

  return {
    id: record.id,
    clientId: record.clientId,
    userId: record.userId,
    redirectUri: record.redirectUri,
    scopes: record.scopes,
    codeChallenge: record.codeChallenge,
    codeChallengeMethod: record.codeChallengeMethod,
    nonce: record.nonce,
    expiresAt: record.expiresAt,
  };
}

/**
 * 清理过期授权码（可由 cron 任务定期调用）
 */
export async function cleanupExpiredCodes(): Promise<number> {
  const result = await prisma.oAuthAuthorizationCode.deleteMany({
    where: {
      OR: [{ expiresAt: { lt: new Date() } }, { used: true }],
    },
  });
  return result.count;
}

/**
 * 验证 PKCE code_verifier
 *
 * RFC 7636:
 * - code_verifier 长度 43-128 字符
 * - code_challenge 长度 43 字符（S256 base64url 编码后的 SHA-256 输出）
 *
 * @param codeVerifier - 客户端提交的原始 code_verifier
 * @param codeChallenge - 存储在授权码记录中的 code_challenge
 * @param method - code_challenge_method（仅支持 S256）
 */
export function verifyPKCE(
  codeVerifier: string,
  codeChallenge: string,
  method: string = "S256"
): boolean {
  if (method !== "S256") {
    return false;
  }

  // RFC 7636: code_verifier 长度 43-128 字符
  if (codeVerifier.length < 43 || codeVerifier.length > 128) {
    return false;
  }

  // RFC 7636: S256 code_challenge 应为 43 字符 base64url
  if (codeChallenge.length !== 43) {
    return false;
  }

  // S256: SHA-256(code_verifier) → base64url
  const expected = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");

  return expected === codeChallenge;
}

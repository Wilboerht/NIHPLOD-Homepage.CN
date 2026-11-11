/**
 * 主站 -> 测肤子站（Skin-Advisor）管理员 SSO
 *
 * 设计：
 * - 主站是管理员身份/密码/TOTP/权限的唯一来源；
 * - 子站只通过一次性 code 换取 60 秒签名断言，再签发本地会话；
 * - 与 C 端 OAuthAuthorizationCode 完全隔离，避免管理员与普通用户身份混用。
 */
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "crypto";
import { SignJWT } from "jose";
import { prisma } from "./prisma";
import { getIssuer } from "./oauth-constants";
import {
  resolveAdminPermissions,
  resolveAdvisorRole,
  type AdminRoleValue,
} from "./admin-permissions";
import { getAdminSsoKeyId, importAdminSsoPrivateKey } from "./admin-sso-keys";

export const ADMIN_SSO_AUDIENCE = "advisor-admin";
export const ADMIN_SSO_CODE_TTL_MS = 60 * 1000;
export const ADMIN_SSO_ASSERTION_TTL_SECONDS = 60;

export type AdminSsoSigningConfig =
  | { alg: "RS256"; keyId: string; privateKey: string }
  | { alg: "HS256"; secret: string };

export interface AdminSsoConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  signing: AdminSsoSigningConfig;
}

function readRequired(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`[AdminSSO] ${name} 未配置`);
  }
  return value;
}

/**
 * 默认使用 RS256。仅在显式设置 ADVISOR_ADMIN_SSO_SIGNING_ALG=HS256 时
 * 保留共享密钥回退（迁移窗口/紧急回滚），生产最终必须删除该配置。
 */
export function getAdminSsoConfig(): AdminSsoConfig {
  const clientSecret = readRequired("ADVISOR_ADMIN_SSO_CLIENT_SECRET");
  if (clientSecret.length < 32) {
    throw new Error("[AdminSSO] ADVISOR_ADMIN_SSO_CLIENT_SECRET 至少需要 32 位");
  }

  const requestedAlg = process.env.ADVISOR_ADMIN_SSO_SIGNING_ALG?.trim().toUpperCase();
  const privateKey = process.env.ADVISOR_ADMIN_SSO_PRIVATE_KEY;
  const legacySecret = process.env.ADVISOR_ADMIN_SSO_SECRET;
  const signingAlg = requestedAlg || (privateKey ? "RS256" : legacySecret ? "HS256" : "");

  let signing: AdminSsoSigningConfig;
  if (signingAlg === "RS256") {
    if (!privateKey) {
      throw new Error("[AdminSSO] ADVISOR_ADMIN_SSO_PRIVATE_KEY 未配置");
    }
    signing = { alg: "RS256", keyId: getAdminSsoKeyId(), privateKey };
  } else if (signingAlg === "HS256") {
    if (!legacySecret) {
      throw new Error("[AdminSSO] ADVISOR_ADMIN_SSO_SECRET 未配置");
    }
    if (legacySecret.length < 32) {
      throw new Error("[AdminSSO] ADVISOR_ADMIN_SSO_SECRET 至少需要 32 位");
    }
    signing = { alg: "HS256", secret: legacySecret };
  } else {
    throw new Error(
      "[AdminSSO] 未配置签名密钥：请配置 ADVISOR_ADMIN_SSO_PRIVATE_KEY（RS256）"
    );
  }

  return {
    clientId: readRequired("ADVISOR_ADMIN_SSO_CLIENT_ID"),
    clientSecret,
    redirectUri: readRequired("ADVISOR_ADMIN_SSO_REDIRECT_URI"),
    signing,
  };
}

export function isAdminSsoEnabled(): boolean {
  return process.env.ADVISOR_ADMIN_SSO_ENABLED === "true";
}

/** 子站访问必须已开启 TOTP，不再接受任何宽限期。 */
export function isTotpSatisfied(totpEnabled: boolean): boolean {
  return totpEnabled;
}

export function safeSecretEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  try {
    return timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

export function hashAdminSsoCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export interface CreateAdminSsoCodeParams {
  adminId: string;
  clientId: string;
  redirectUri: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  adminTokenVersion: number;
  mainSessionExp: number;
}

export interface CreatedAdminSsoCode {
  code: string;
  expiresAt: Date;
}

export async function createAdminSsoCode(
  params: CreateAdminSsoCodeParams
): Promise<CreatedAdminSsoCode> {
  const rawCode = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + ADMIN_SSO_CODE_TTL_MS);

  await prisma.adminSsoCode.create({
    data: {
      code: hashAdminSsoCode(rawCode),
      adminId: params.adminId,
      clientId: params.clientId,
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge || null,
      codeChallengeMethod: params.codeChallengeMethod || null,
      adminTokenVersion: params.adminTokenVersion,
      mainSessionExp: params.mainSessionExp,
      expiresAt,
    },
  });

  return { code: rawCode, expiresAt };
}

export interface ConsumedAdminSsoCode {
  id: string;
  adminId: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string | null;
  codeChallengeMethod: string | null;
  adminTokenVersion: number;
  mainSessionExp: number;
}

/**
 * 原子消费一次性 code。先 updateMany 占位，再读取记录；
 * 即使后续 client/redirect/PKCE 校验失败，code 也已作废，防止重放。
 */
export async function consumeAdminSsoCode(rawCode: string): Promise<ConsumedAdminSsoCode | null> {
  const codeHash = hashAdminSsoCode(rawCode);

  const record = await prisma.$transaction(async (tx) => {
    const updated = await tx.adminSsoCode.updateMany({
      where: { code: codeHash, used: false, expiresAt: { gte: new Date() } },
      data: { used: true },
    });
    if (updated.count === 0) return null;
    return tx.adminSsoCode.findUnique({ where: { code: codeHash } });
  });

  if (!record) return null;

  return {
    id: record.id,
    adminId: record.adminId,
    clientId: record.clientId,
    redirectUri: record.redirectUri,
    codeChallenge: record.codeChallenge,
    codeChallengeMethod: record.codeChallengeMethod,
    adminTokenVersion: record.adminTokenVersion,
    mainSessionExp: record.mainSessionExp,
  };
}

export async function cleanupExpiredAdminSsoCodes(): Promise<number> {
  const result = await prisma.adminSsoCode.deleteMany({
    where: {
      OR: [
        { used: false, expiresAt: { lt: new Date() } },
        { used: true, createdAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
      ],
    },
  });
  return result.count;
}

export interface AdminSsoAssertionInput {
  id: string;
  email: string;
  name: string;
  role: AdminRoleValue | string;
  permissionOverrides: string[] | null;
  tokenVersion: number;
  totpEnabled: boolean;
  mainSessionExp: number;
}

/**
 * 签发 60 秒管理员断言。
 *
 * 默认 RS256：子站通过 JWKS 公钥验签，即使子站被攻破也无法伪造其他管理员。
 * 仅迁移窗口内允许显式 HS256 共享密钥回退。
 */
export async function signAdminSsoAssertion(
  admin: AdminSsoAssertionInput,
  config: AdminSsoConfig
): Promise<string> {
  const advisorRole = resolveAdvisorRole(admin.role, admin.permissionOverrides);
  if (!advisorRole) {
    throw new Error("[AdminSSO] admin has no advisor access");
  }

  // 只下发子站需要的权限，避免把主站全量权限（users:delete/admins:write 等）
  // 暴露给子站；子站 resolveLocalAdminRole 仍依赖 advisor:access / advisor:admin。
  const permissions = resolveAdminPermissions(
    admin.role,
    admin.permissionOverrides
  ).filter((permission) => permission.startsWith("advisor:"));

  const assertion = new SignJWT({
    email: admin.email,
    name: admin.name,
    role: admin.role,
    permissions,
    advisorRole,
    ver: admin.tokenVersion,
    totp: admin.totpEnabled,
    mainSessionExp: admin.mainSessionExp,
    token_use: "admin_sso",
  })
    .setIssuer(getIssuer())
    .setAudience(ADMIN_SSO_AUDIENCE)
    .setSubject(admin.id)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${ADMIN_SSO_ASSERTION_TTL_SECONDS}s`);

  if (config.signing.alg === "RS256") {
    const privateKey = await importAdminSsoPrivateKey(config.signing.privateKey);
    return assertion
      .setProtectedHeader({ alg: "RS256", typ: "JWT", kid: config.signing.keyId })
      .sign(privateKey);
  }

  return assertion
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .sign(new TextEncoder().encode(config.signing.secret));
}

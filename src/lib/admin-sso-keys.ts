/**
 * 测肤子站管理员 SSO 的 RS256 密钥处理
 *
 * 主站持有私钥用于签发断言，公钥通过 /api/oauth/jwks 暴露，
 * 子站只保存公钥（或拉取 JWKS），不再共享 HS256 签名密钥。
 */
import { importPKCS8, importSPKI } from "jose";

const privateKeyCache = new Map<string, CryptoKey>();
const publicKeyCache = new Map<string, CryptoKey>();

/** 兼容 .env 中单行 PEM（字面 \n）与多行 PEM 两种写法 */
export function normalizeAdminSsoPem(raw: string): string {
  return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
}

export function getAdminSsoKeyId(): string {
  return process.env.ADVISOR_ADMIN_SSO_KID || "advisor-admin-rs256-v1";
}

export function getPrevAdminSsoKeyId(): string {
  return process.env.ADVISOR_ADMIN_SSO_PREV_KID || "advisor-admin-rs256-v0";
}

export async function importAdminSsoPrivateKey(pem: string): Promise<CryptoKey> {
  const normalized = normalizeAdminSsoPem(pem);
  const cached = privateKeyCache.get(normalized);
  if (cached) return cached;
  try {
    const key = await importPKCS8(normalized, "RS256");
    privateKeyCache.set(normalized, key);
    return key;
  } catch {
    throw new Error("[AdminSSO] ADVISOR_ADMIN_SSO_PRIVATE_KEY 不是有效的 PKCS#8 PEM");
  }
}

export async function importAdminSsoPublicKey(pem: string): Promise<CryptoKey> {
  const normalized = normalizeAdminSsoPem(pem);
  const cached = publicKeyCache.get(normalized);
  if (cached) return cached;
  try {
    const key = await importSPKI(normalized, "RS256");
    publicKeyCache.set(normalized, key);
    return key;
  } catch {
    throw new Error("[AdminSSO] ADVISOR_ADMIN_SSO_PUBLIC_KEY 不是有效的 SPKI PEM");
  }
}

export async function getAdminSsoPublicKey(): Promise<CryptoKey | null> {
  const raw = process.env.ADVISOR_ADMIN_SSO_PUBLIC_KEY;
  return raw ? importAdminSsoPublicKey(raw) : null;
}

export async function getPrevAdminSsoPublicKey(): Promise<CryptoKey | null> {
  const raw = process.env.ADVISOR_ADMIN_SSO_PREV_PUBLIC_KEY;
  return raw ? importAdminSsoPublicKey(raw) : null;
}

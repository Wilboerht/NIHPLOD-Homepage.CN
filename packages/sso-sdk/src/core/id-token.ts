/**
 * ID Token 验证工具（浏览器 / Edge Runtime 通用）
 *
 * 提取 SsoClient 与 Next.js callback 中重复的 ID Token 校验逻辑，
 * 包括 base64url 解码、JWKS 获取、RS256 签名验证、at_hash 计算等。
 */

import { SsoError } from "./errors";

// Node.js <19 兼容：确保 crypto.subtle 可用
const _crypto: Pick<Crypto, "subtle"> =
  typeof crypto !== "undefined" && (crypto as Crypto).subtle
    ? (crypto as Crypto)
    : (() => {
        try {
          return require("crypto").webcrypto as Crypto;
        } catch {
          return null as unknown as Crypto;
        }
      })();

function getCrypto(): Crypto | null {
  return _crypto;
}

export interface JwksKey {
  kty: string;
  kid?: string;
  alg?: string;
  use?: string;
  n?: string;
  e?: string;
  x5c?: string[];
}

export interface Jwks {
  keys: JwksKey[];
}

export interface ValidateIdTokenResult {
  sub: string;
}

export interface ValidateIdTokenOptions {
  /**
   * 发现 SSO 中心已启用 RS256 时，是否拒绝 HS256 ID Token。
   * 默认 true：只要 JWKS 中存在 RS256 签名密钥，就拒绝 HS256（安全推荐）。
   */
  rejectHs256WhenRs256Available?: boolean;
}

function base64UrlDecode(input: string): Uint8Array {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** 解码 JWT payload（不验证签名） */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const json = new TextDecoder().decode(base64UrlDecode(parts[1]));
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** 解码 JWT header */
export function decodeJwtHeader(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const json = new TextDecoder().decode(base64UrlDecode(parts[0]));
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** 标准化 issuer/base URL，去除末尾斜杠 */
function normalizeIssuer(url: string): string {
  return url.replace(/\/+$/, "");
}

let cachedJwks: { baseUrl: string; jwks: Jwks; fetchedAt: number } | null = null;
const JWKS_CACHE_TTL_MS = 5 * 60 * 1000;

/** 从 SSO 中心拉取 JWKS（带内存缓存） */
export async function fetchJwks(baseUrl: string): Promise<Jwks | null> {
  const now = Date.now();
  if (cachedJwks && cachedJwks.baseUrl === baseUrl && now - cachedJwks.fetchedAt < JWKS_CACHE_TTL_MS) {
    return cachedJwks.jwks;
  }

  try {
    const res = await fetch(`${baseUrl}/api/oauth/jwks`);
    if (!res.ok) return null;
    const jwks = (await res.json()) as Jwks;
    cachedJwks = { baseUrl, jwks, fetchedAt: now };
    return jwks;
  } catch {
    return null;
  }
}

/** 使用 RS256 公钥验证 ID Token 签名 */
export async function verifyRs256Signature(token: string, jwk: JwksKey): Promise<boolean> {
  try {
    const [headerB64, payloadB64, signature] = token.split(".");
    if (!signature || !jwk.n || !jwk.e) return false;

    const c = getCrypto();
    if (!c) return false;

    const cryptoKey = await c.subtle.importKey(
      "jwk",
      { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: false },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const signatureBytes = base64UrlDecode(signature);
    const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    return await c.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      cryptoKey,
      signatureBytes as unknown as BufferSource,
      data as unknown as BufferSource
    );
  } catch {
    return false;
  }
}

/** 计算 OIDC at_hash（access_token SHA-256 前 128bit base64url） */
export async function computeAtHash(accessToken: string): Promise<string> {
  const c = getCrypto();
  if (!c) return "";
  const hash = await c.subtle.digest("SHA-256", new TextEncoder().encode(accessToken));
  const bytes = new Uint8Array(hash);
  const half = bytes.slice(0, bytes.length / 2);
  let binary = "";
  for (const b of half) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** 验证 ID Token（iss、aud、exp、sub、签名、at_hash） */
export async function validateIdToken(
  idToken: string,
  accessToken: string,
  expectedIssuer: string,
  expectedClientId: string,
  options: ValidateIdTokenOptions = {}
): Promise<ValidateIdTokenResult> {
  const { rejectHs256WhenRs256Available = true } = options;

  const header = decodeJwtHeader(idToken);
  if (!header) {
    throw new SsoError("id_token_invalid", "ID Token 格式错误");
  }

  const alg = header.alg;
  if (typeof alg !== "string" || (alg !== "RS256" && alg !== "HS256")) {
    throw new SsoError("id_token_unsupported_alg", `不支持的 ID Token 签名算法: ${alg}`);
  }

  const normalizedIssuer = normalizeIssuer(expectedIssuer);

  // RS256：通过 JWKS 验证签名
  if (alg === "RS256") {
    const jwks = await fetchJwks(normalizedIssuer);
    if (!jwks) {
      throw new SsoError("id_token_invalid_signature", "无法获取 JWKS 验证 ID Token 签名");
    }
    const kid = typeof header.kid === "string" ? header.kid : undefined;
    const key = jwks.keys.find(
      (k) =>
        k.kty === "RSA" &&
        k.alg === "RS256" &&
        k.use === "sig" &&
        (kid ? k.kid === kid : true)
    );
    if (!key) {
      throw new SsoError("id_token_invalid_signature", "JWKS 中未找到匹配的 RS256 公钥");
    }
    const validSig = await verifyRs256Signature(idToken, key);
    if (!validSig) {
      throw new SsoError("id_token_invalid_signature", "ID Token 签名验证失败");
    }
  }

  // HS256：对称密钥无法安全分发给 Public Client / BFF。
  // SDK 拒绝 HS256 ID Token：主站需配置 RS256 密钥对以启用安全验证。
  if (alg === "HS256") {
    if (rejectHs256WhenRs256Available) {
      const jwks = await fetchJwks(normalizedIssuer);
      const hasRs256 = jwks?.keys?.some((k) => k.alg === "RS256" && k.use === "sig");
      if (hasRs256) {
        throw new SsoError("id_token_unsupported_alg", "SSO 中心已配置 RS256，拒绝 HS256 ID Token");
      }
    }
    throw new SsoError(
      "id_token_hs256_unsupported",
      "ID Token 使用 HS256 对称签名，SDK 无法安全验证。" +
      "请联系管理员在主站配置 JWT_ID_TOKEN_PRIVATE_KEY / JWT_ID_TOKEN_PUBLIC_KEY 环境变量启用 RS256 非对称签名。" +
      "迁移期间可设置 ALLOW_HS256_FALLBACK=true 临时兼容（不推荐用于生产环境）。"
    );
  }

  const payload = decodeJwtPayload(idToken);
  if (!payload) {
    throw new SsoError("id_token_invalid", "ID Token payload 解析失败");
  }

  const tokenIssuer = typeof payload.iss === "string" ? normalizeIssuer(payload.iss) : "";
  if (tokenIssuer !== normalizedIssuer) {
    throw new SsoError("id_token_issuer_mismatch", "ID Token issuer 不匹配");
  }
  if (
    payload.aud !== expectedClientId &&
    !((payload.aud as string[] | undefined)?.includes(expectedClientId))
  ) {
    throw new SsoError("id_token_audience_mismatch", "ID Token audience 不匹配");
  }
  if (typeof payload.exp === "number" && Date.now() >= payload.exp * 1000) {
    throw new SsoError("id_token_expired", "ID Token 已过期");
  }
  if (typeof payload.sub !== "string" || !payload.sub) {
    throw new SsoError("id_token_missing_sub", "ID Token 缺少 sub");
  }

  // 校验 at_hash：确保 ID Token 与当前 access_token 绑定
  if (typeof payload.at_hash === "string" && payload.at_hash) {
    const actual = await computeAtHash(accessToken);
    if (actual !== payload.at_hash) {
      throw new SsoError("id_token_at_hash_mismatch", "ID Token at_hash 不匹配");
    }
  }

  return { sub: payload.sub };
}

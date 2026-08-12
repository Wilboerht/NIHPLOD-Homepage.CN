/**
 * DPoP (Demonstrating Proof of Possession) — RFC 9449
 *
 * DPoP 将 Access Token 绑定到客户端持有的非对称密钥对，
 * 防止被盗 token 被攻击者从不同客户端使用。
 *
 * 流程：
 * 1. 客户端生成 EC/OKP 密钥对，在 token 请求中发送 DPoP proof JWT
 * 2. 服务端验证 proof，将公钥指纹（jkt）写入 access token 的 cnf claim
 * 3. 后续 API 请求携带 DPoP proof，服务端验证 proof 中的公钥匹配 token 绑定的公钥
 */
import { jwtVerify, importJWK, calculateJwkThumbprint, type JWK } from "jose";
import { LRUCache } from "lru-cache";
import { randomBytes, createHash, createHmac, timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";
import { prisma } from "./prisma";

const DPOP_PROOF_MAX_AGE_MS = 60_000; // 1 分钟
const DPOP_NONCE_TTL_MS = 5 * 60_000; // 5 分钟

const supportedAlgorithms = [
  "ES256",
  "ES384",
  "ES512",
  "EdDSA",
  "RS256",
  "RS384",
  "RS512",
  "PS256",
  "PS384",
  "PS512",
];

// 已使用的 DPoP nonce 缓存（本实例快速路径；跨实例防重放由 DB 唯一约束保证）
// 说明：nonce 为 HMAC 签名的无状态 token，本身可跨实例验证（见 isDpopNonceIssued）。
// 使用记录与 jti 一样落 TokenBlacklist 表（见 recordUsedNonce），内存 LRU 仅作快速路径。
const usedNonces = new LRUCache<string, number>({
  max: 100000,
  ttl: DPOP_NONCE_TTL_MS,
});

// 已使用的 DPoP jti 缓存（本实例快速路径；跨实例防重放由 DB 唯一约束保证）
const usedProofJtis = new LRUCache<string, number>({
  max: 100000,
  ttl: DPOP_PROOF_MAX_AGE_MS * 2,
});

// 每个 client+user 的当前 nonce（旋转用）
const currentNonces = new LRUCache<string, string>({
  max: 50000,
  ttl: DPOP_NONCE_TTL_MS,
});

export interface DPoPProofPayload {
  jti: string;
  htm: string;
  htu: string;
  iat: number;
  ath?: string; // access token hash (base64url)
  nonce?: string;
}

export interface DPoPValidationResult {
  valid: boolean;
  error?: string;
  errorDescription?: string;
  jkt?: string;
  jwk?: JWK;
  newNonce?: string;
}

/**
 * DPoP nonce HMAC 签名密钥：由 JWT_ACCESS_SECRET 派生，多实例共享
 * （nonce 为无状态自包含 token，签发后可被任意实例验证）
 */
function getNonceHmacKey(): Buffer {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) throw new Error("[DPoP] 缺少 JWT_ACCESS_SECRET 用于 DPoP nonce 签名");
  return createHash("sha256").update(`dpop_nonce_hmac_key:${secret}`).digest();
}

/**
 * 生成新的 DPoP nonce（HMAC 签名的无状态 token：base64url(issuedAt:random).sig）
 * 服务端签发后可验证，客户端无法伪造
 */
function generateNonce(): string {
  const payload = `${Date.now()}:${randomBytes(16).toString("base64url")}`;
  const encoded = Buffer.from(payload, "utf8").toString("base64url");
  const sig = createHmac("sha256", getNonceHmacKey()).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

/**
 * 校验 nonce 是否为本服务端签发且未过期（不消费，重放检查由 usedNonces 缓存负责）
 */
export function isDpopNonceIssued(nonce: string): boolean {
  const dotIdx = nonce.lastIndexOf(".");
  if (dotIdx === -1) return false;
  const encoded = nonce.slice(0, dotIdx);
  const sig = nonce.slice(dotIdx + 1);
  const expectedSig = createHmac("sha256", getNonceHmacKey()).update(encoded).digest("base64url");
  try {
    if (
      sig.length !== expectedSig.length ||
      !timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))
    ) {
      return false;
    }
    const payload = Buffer.from(encoded, "base64url").toString("utf8");
    const colonIdx = payload.indexOf(":");
    if (colonIdx === -1) return false;
    const issuedAt = parseInt(payload.slice(0, colonIdx), 10);
    return Number.isFinite(issuedAt) && Date.now() - issuedAt <= DPOP_NONCE_TTL_MS;
  } catch {
    return false;
  }
}

/**
 * 计算 DPoP htu：基于公网 origin（反向代理后 request.url 可能是内网地址，与客户端
 * 公网 URL 永不匹配）。RFC 9449：仅 scheme/host 不区分大小写（URL.origin 已规范化），
 * path 区分大小写，保持原样不做 toLowerCase。
 */
export function getDPoPHtu(request: NextRequest): string {
  const publicOrigin =
    process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || request.nextUrl.origin;
  return `${new URL(publicOrigin).origin}${request.nextUrl.pathname}`;
}

/**
 * 获取指定 client+user 的当前 nonce（不存在则生成新 nonce）
 */
export function getDpopNonce(clientUserId: string): string {
  let nonce = currentNonces.get(clientUserId);
  if (!nonce) {
    nonce = generateNonce();
    currentNonces.set(clientUserId, nonce);
  }
  return nonce;
}

/**
 * 轮换 nonce：消费旧 nonce 并生成新 nonce
 */
function rotateNonce(clientUserId: string): string {
  const newNonce = generateNonce();
  currentNonces.set(clientUserId, newNonce);
  return newNonce;
}

/**
 * 验证 DPoP Proof JWT
 *
 * @param dpopHeader - DPoP header 值（原始 JWT 字符串）
 * @param htm - 期望的 HTTP method（如 "POST"）
 * @param htu - 期望的 HTTP URL（公网 origin + path，path 区分大小写；用 getDPoPHtu 生成）
 * @param expectedAth - 可选的 access token hash（用于 token-bound proof）
 * @param expectedNonce - 可选的期望 nonce
 * @param clientUserId - 用于 nonce 轮换的标识
 */
// 每个 jti/nonce 的互斥锁，防止 TOCTOU 竞态下的重放绕过
const dpopMutexMap = new Map<string, Promise<void>>();

async function withDpopMutex<T>(key: string, fn: () => T | Promise<T>): Promise<T> {
  while (dpopMutexMap.has(key)) {
    await dpopMutexMap.get(key);
  }
  let resolve: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  dpopMutexMap.set(key, promise);
  try {
    return await fn();
  } finally {
    dpopMutexMap.delete(key);
    resolve!();
  }
}

/**
 * 记录 DPoP proof jti（防重放）。
 * - 进程内 LRU 为本实例快速路径；
 * - DB（复用 TokenBlacklist 表，key 前缀 "dpop-jti:"）通过唯一约束实现跨实例原子性，
 *   参照 internal-api.ts checkAndRecordNonce 先例。
 * - DB 不可用时 fail-closed：多实例部署下放开内存缓存会造成跨实例重放窗口。
 *
 * @returns true 表示 jti 首次使用，false 表示已使用（重放）或存储不可用
 */
async function recordProofJti(jti: string): Promise<boolean> {
  // 内存快速检查（本实例已见 → 直接拒绝，省去 DB 往返）
  if (usedProofJtis.has(jti)) return false;

  try {
    await prisma.tokenBlacklist.create({
      data: {
        type: "dpop_jti",
        key: `dpop-jti:${jti}`,
        // proof 最大有效期 60s，记录保留 2 倍窗口即可覆盖重放判定
        expiresAt: new Date(Date.now() + DPOP_PROOF_MAX_AGE_MS * 2),
      },
    });
    usedProofJtis.set(jti, Date.now());
    return true;
  } catch (error) {
    // 唯一约束冲突 = jti 已被使用（含跨实例并发场景）。
    // 注意：proof 本身有 60s maxTokenAge，过期残留记录的 jti 不可能出现在合法新 proof 中，
    // 因此 P2002 一律按重放拒绝，无需区分记录是否过期。
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code: string }).code === "P2002"
    ) {
      usedProofJtis.set(jti, Date.now());
      return false;
    }
    // DB 不可用：fail-closed，拒绝以防止跨实例重放窗口
    return false;
  }
}

/**
 * 记录已使用的 DPoP nonce（防重放），与 recordProofJti 同风格：
 * - 进程内 LRU 为本实例快速路径；
 * - DB（复用 TokenBlacklist 表，type 复用 "dpop_jti" 枚举值，key 前缀 "dpop-nonce:"）
 *   通过唯一约束实现跨实例原子性；
 * - DB 不可用时 fail-closed：多实例部署下放开内存缓存会造成跨实例重放窗口。
 *
 * @returns true 表示 nonce 首次使用，false 表示已使用（重放）或存储不可用
 */
async function recordUsedNonce(nonce: string): Promise<boolean> {
  // 内存快速检查（本实例已见 → 直接拒绝，省去 DB 往返）
  if (usedNonces.has(nonce)) return false;

  try {
    await prisma.tokenBlacklist.create({
      data: {
        type: "dpop_jti",
        key: `dpop-nonce:${nonce}`,
        // nonce 有效期 5 分钟，记录保留至自然过期即可覆盖重放判定
        expiresAt: new Date(Date.now() + DPOP_NONCE_TTL_MS),
      },
    });
    usedNonces.set(nonce, Date.now());
    return true;
  } catch (error) {
    // 唯一约束冲突 = nonce 已被使用（含跨实例并发场景）。
    // nonce 过期后不可能通过 isDpopNonceIssued 校验，因此 P2002 一律按重放拒绝。
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code: string }).code === "P2002"
    ) {
      usedNonces.set(nonce, Date.now());
      return false;
    }
    // DB 不可用：fail-closed，拒绝以防止跨实例重放窗口
    return false;
  }
}

export async function validateDPoPProof(
  dpopHeader: string,
  htm: string,
  htu: string,
  expectedAth?: string,
  expectedNonce?: string,
  clientUserId?: string
): Promise<DPoPValidationResult> {
  if (!dpopHeader) {
    return { valid: false, error: "invalid_dpop_proof", errorDescription: "缺少 DPoP header" };
  }

  let payload: DPoPProofPayload;
  let jwk: JWK;

  try {
    const { payload: rawPayload } = await jwtVerify(
      dpopHeader,
      async (header) => {
        if (!header.jwk) {
          throw new Error("DPoP proof 必须包含 jwk 声明");
        }
        if (!supportedAlgorithms.includes(header.alg as string)) {
          throw new Error(`不支持的 DPoP 算法: ${header.alg}`);
        }
        jwk = header.jwk as JWK;
        const key = await importJWK(jwk, header.alg as string);
        return key;
      },
      {
        algorithms: supportedAlgorithms,
        typ: "dpop+jwt",
        maxTokenAge: DPOP_PROOF_MAX_AGE_MS / 1000,
      }
    );

    payload = rawPayload as unknown as DPoPProofPayload;
  } catch (err) {
    return {
      valid: false,
      error: "invalid_dpop_proof",
      errorDescription: `DPoP proof 验证失败: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // jti 不得重放：进程内互斥锁保证本实例原子性，DB 唯一约束保证跨实例原子性
  const jtiOk = await withDpopMutex(`jti:${payload.jti}`, () => recordProofJti(payload.jti));
  if (!jtiOk) {
    return {
      valid: false,
      error: "invalid_dpop_proof",
      errorDescription: "DPoP proof jti 已被使用",
    };
  }

  // htm 必须匹配实际 HTTP method
  if (payload.htm !== htm) {
    return {
      valid: false,
      error: "invalid_dpop_proof",
      errorDescription: `htm 不匹配 (期望: ${htm}, 实际: ${payload.htm})`,
    };
  }

  // htu 必须匹配实际请求 URL（公网 origin + path，不含 query/fragment）
  if (payload.htu !== htu) {
    return {
      valid: false,
      error: "invalid_dpop_proof",
      errorDescription: `htu 不匹配 (期望: ${htu}, 实际: ${payload.htu})`,
    };
  }

  // 时间窗口检查
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - payload.iat) > DPOP_PROOF_MAX_AGE_MS / 1000) {
    return {
      valid: false,
      error: "invalid_dpop_proof",
      errorDescription: "DPoP proof iat 超出时间窗口",
    };
  }

  // access token hash 绑定
  if (expectedAth && payload.ath !== expectedAth) {
    return {
      valid: false,
      error: "invalid_dpop_proof",
      errorDescription: "DPoP proof ath 与 access token 不匹配",
    };
  }

  // nonce 校验（服务端要求 nonce 时）
  if (expectedNonce && payload.nonce !== expectedNonce) {
    return {
      valid: false,
      error: "use_dpop_nonce",
      errorDescription: "DPoP nonce 无效，请使用服务端返回的 nonce",
      newNonce: clientUserId ? rotateNonce(clientUserId) : generateNonce(),
    };
  }

  // nonce 必须是本服务端签发且在有效期内（防伪造）
  if (payload.nonce && !isDpopNonceIssued(payload.nonce)) {
    return {
      valid: false,
      error: "use_dpop_nonce",
      errorDescription: "DPoP nonce 非服务端签发或已过期，请使用服务端返回的 nonce",
      newNonce: clientUserId ? rotateNonce(clientUserId) : generateNonce(),
    };
  }

  // nonce 不得重放：进程内互斥锁保证本实例原子性，DB 唯一约束保证跨实例原子性
  if (payload.nonce) {
    const nonce = payload.nonce;
    const nonceOk = await withDpopMutex(`nonce:${nonce}`, () => recordUsedNonce(nonce));
    if (!nonceOk) {
      return { valid: false, error: "invalid_dpop_proof", errorDescription: "DPoP nonce 已被使用" };
    }
  }

  // 计算 jkt (JWK Thumbprint)
  const jkt = await calculateJwkThumbprint(jwk!, "sha256");

  // nonce 使用后轮换
  const newNonce = clientUserId ? rotateNonce(clientUserId) : undefined;

  return { valid: true, jkt, jwk: jwk!, newNonce };
}

/**
 * 计算 access token 的 DPoP ath 值
 * ath = base64url(SHA-256(access_token))
 */
export function computeDPoPAth(accessToken: string): string {
  return createHash("sha256").update(accessToken).digest("base64url");
}

/**
 * 构建 DPoP-Nonce 响应头
 */
export function dpopNonceHeader(nonce: string): Record<string, string> {
  return { "DPoP-Nonce": nonce };
}

export { supportedAlgorithms as DPOP_SUPPORTED_ALGORITHMS };

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
import { randomBytes, createHash } from "crypto";

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

// 已使用的 DPoP nonce 缓存（防重放）
const usedNonces = new LRUCache<string, number>({
  max: 100000,
  ttl: DPOP_NONCE_TTL_MS,
});

// 已使用的 DPoP jti 缓存（防重放）
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
 * 生成新的 DPoP nonce
 */
function generateNonce(): string {
  return randomBytes(24).toString("base64url");
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
 * @param htu - 期望的 HTTP URL（完整小写 URL）
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

  // jti 不得重放（互斥锁保护 has→set 原子性）
  const jtiOk = await withDpopMutex(`jti:${payload.jti}`, () => {
    if (usedProofJtis.has(payload.jti)) return false;
    usedProofJtis.set(payload.jti, Date.now());
    return true;
  });
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

  // htu 必须匹配实际请求 URL（小写，不含 query/fragment 的完整 URL）
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

  // nonce 不得重放（互斥锁保护 has→set 原子性）
  if (payload.nonce) {
    const nonce = payload.nonce;
    const nonceOk = await withDpopMutex(`nonce:${nonce}`, () => {
      if (usedNonces.has(nonce)) return false;
      usedNonces.set(nonce, Date.now());
      return true;
    });
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

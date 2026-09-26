/**
 * OIDC Backchannel Logout Token 验证
 *
 * 复用 core/id-token.ts 的 Discovery + JWKS 基建验证 IdP 推送的 logout_token：
 * - alg 仅允许 RS256（logout_token 是服务器间凭证，不接受对称签名）
 * - issuer 以 Discovery 文档为准（防伪站伪造 iss 通过校验）
 * - aud 必须等于本 client、exp 必须有效
 * - events 必须包含 backchannel-logout 事件键
 * - sub / sid 至少居一；jti 必须存在且未重放（进程内 LRU）
 *
 * 与 ID Token 的差异：logout_token 不得要求 nonce（规范明确禁止携带），
 * 也不校验 at_hash / iat。
 */

import { SsoError } from "./errors";
import {
  decodeJwtHeader,
  decodeJwtPayload,
  fetchDiscoveryDoc,
  fetchJwks,
  verifyRs256Signature,
  type Jwks,
  type JwksKey,
} from "./id-token";

/** Backchannel Logout 事件键（OIDC Back-Channel Logout 1.0） */
export const BACKCHANNEL_LOGOUT_EVENT =
  "http://schemas.openid.net/event/backchannel-logout";

/** 验证通过的 logout_token 负载（仅暴露子站清会话所需的标识） */
export interface LogoutTokenPayload {
  sub?: string;
  sid?: string;
}

/** 验证结果：负载 + jti（供调用方在本地处理失败时释放重放标记，允许 IdP 重投） */
export interface VerifiedLogoutToken {
  payload: LogoutTokenPayload;
  jti: string;
}

/** jti 防重放缓存：jti → 过期时间（epoch ms），容量上限 1000 */
const JTI_CACHE_CAPACITY = 1000;
const seenJti = new Map<string, number>();

/** 清空 jti 防重放缓存（测试用） */
export function clearLogoutTokenReplayCache(): void {
  seenJti.clear();
}

/**
 * 释放已记录的 jti。
 *
 * 仅当 logout_token 验证通过、但调用方的本地会话清理（onLogout 钩子）失败、
 * 需要允许 IdP 用同一 logout_token 重投时调用。成功后调用会使重放保护失效，
 * 因此正常成功路径不得调用。
 */
export function releaseLogoutTokenJti(jti: string): void {
  seenJti.delete(jti);
}

/**
 * 记录 jti；返回 false 表示重放（该 jti 尚未过期且已出现过）。
 * 缓存到 token 自身 exp 为止；超过容量时先清理过期项，再按插入序淘汰最旧项。
 */
function recordJti(jti: string, expiresAtMs: number): boolean {
  const now = Date.now();
  const existing = seenJti.get(jti);
  if (existing !== undefined && existing > now) return false;

  // 清理过期项，避免缓存被历史数据撑满
  for (const [key, exp] of seenJti) {
    if (exp <= now) seenJti.delete(key);
  }
  // 仍超容量：淘汰最旧插入项（Map 保持插入序）
  while (seenJti.size >= JTI_CACHE_CAPACITY) {
    const oldest = seenJti.keys().next().value;
    if (oldest === undefined) break;
    seenJti.delete(oldest);
  }
  seenJti.set(jti, expiresAtMs);
  return true;
}

/**
 * 验证 Backchannel Logout Token 并返回负载 + jti
 *
 * @param logoutToken IdP POST 到 backchannelLogoutUri 的 logout_token（JWT）
 * @param ssoBaseUrl SSO 中心地址（Discovery / JWKS 基准）
 * @param clientId 本应用 Client ID（aud 必须等于它）
 * @returns 验证通过的负载与 jti
 * @throws SsoError 任一校验失败
 */
export async function verifyLogoutTokenDetailed(
  logoutToken: string,
  ssoBaseUrl: string,
  clientId: string
): Promise<VerifiedLogoutToken> {
  const baseUrl = ssoBaseUrl.replace(/\/+$/, "");

  const header = decodeJwtHeader(logoutToken);
  if (!header) {
    throw new SsoError("logout_token_invalid", "Logout Token 格式错误");
  }

  // alg 白名单仅 RS256：logout_token 是服务器间凭证，一律拒绝对称签名
  if (header.alg !== "RS256") {
    throw new SsoError(
      "logout_token_unsupported_alg",
      `不支持的 Logout Token 签名算法: ${String(header.alg)}`
    );
  }

  // issuer 以 Discovery 文档为准，回退调用方传入的 ssoBaseUrl
  const discovery = await fetchDiscoveryDoc(baseUrl);
  const normalizedIssuer = (discovery?.issuer || baseUrl).replace(/\/+$/, "");

  // RS256 签名验证（kid 精确匹配；无 kid 时逐个尝试所有 RS256 签名公钥）
  const jwks = await fetchJwks(baseUrl);
  if (!jwks) {
    throw new SsoError(
      "logout_token_invalid_signature",
      "无法获取 JWKS 验证 Logout Token 签名"
    );
  }
  const kid = typeof header.kid === "string" ? header.kid : undefined;
  const matchCandidates = (set: Jwks) =>
    set.keys.filter(
      (k) =>
        k.kty === "RSA" &&
        k.alg === "RS256" &&
        k.use === "sig" &&
        (kid ? k.kid === kid : true)
    );
  const verifyAny = async (keys: JwksKey[]): Promise<boolean> => {
    for (const key of keys) {
      if (await verifyRs256Signature(logoutToken, key)) return true;
    }
    return false;
  };

  let candidates = matchCandidates(jwks);
  let validSig = candidates.length > 0 ? await verifyAny(candidates) : false;

  // 密钥轮换自愈：与 validateIdToken 一致，候选缺失或验签失败时强制重取 JWKS 重试一次
  if (candidates.length === 0 || !validSig) {
    const freshJwks = await fetchJwks(baseUrl, { forceRefresh: true });
    if (freshJwks) {
      candidates = matchCandidates(freshJwks);
      validSig = candidates.length > 0 ? await verifyAny(candidates) : false;
    }
  }

  if (candidates.length === 0) {
    throw new SsoError(
      "logout_token_invalid_signature",
      "JWKS 中未找到匹配的 RS256 公钥"
    );
  }
  if (!validSig) {
    throw new SsoError(
      "logout_token_invalid_signature",
      "Logout Token 签名验证失败"
    );
  }

  const payload = decodeJwtPayload(logoutToken);
  if (!payload) {
    throw new SsoError("logout_token_invalid", "Logout Token payload 解析失败");
  }

  const tokenIssuer =
    typeof payload.iss === "string" ? payload.iss.replace(/\/+$/, "") : "";
  if (tokenIssuer !== normalizedIssuer) {
    throw new SsoError(
      "logout_token_issuer_mismatch",
      "Logout Token issuer 不匹配"
    );
  }

  // aud 校验：单值或数组包含 clientId
  const aud = payload.aud;
  const audList = Array.isArray(aud) ? aud : typeof aud === "string" ? [aud] : [];
  if (!audList.includes(clientId)) {
    throw new SsoError(
      "logout_token_audience_mismatch",
      "Logout Token audience 不匹配"
    );
  }

  // exp 必需且不得过期（允许 60s clock skew，与 ID Token 校验一致）
  if (typeof payload.exp !== "number") {
    throw new SsoError("logout_token_invalid", "Logout Token 缺少 exp 声明");
  }
  if (Date.now() >= payload.exp * 1000 + 60_000) {
    throw new SsoError("logout_token_expired", "Logout Token 已过期");
  }

  // events 必须包含 backchannel-logout 事件键
  const events = payload.events;
  if (
    !events ||
    typeof events !== "object" ||
    !(BACKCHANNEL_LOGOUT_EVENT in (events as Record<string, unknown>))
  ) {
    throw new SsoError(
      "logout_token_invalid",
      "Logout Token 缺少 backchannel-logout events 声明"
    );
  }

  // sub / sid 至少居一
  const sub = typeof payload.sub === "string" && payload.sub ? payload.sub : undefined;
  const sid = typeof payload.sid === "string" && payload.sid ? payload.sid : undefined;
  if (!sub && !sid) {
    throw new SsoError(
      "logout_token_invalid",
      "Logout Token 必须包含 sub 或 sid 至少其一"
    );
  }

  // jti 必须存在且未重放（缓存到 token exp 为止）
  const jti = typeof payload.jti === "string" ? payload.jti : "";
  if (!jti) {
    throw new SsoError("logout_token_invalid", "Logout Token 缺少 jti 声明");
  }
  if (!recordJti(jti, payload.exp * 1000 + 60_000)) {
    throw new SsoError("logout_token_replay", "Logout Token jti 重放");
  }

  return { payload: { sub, sid }, jti };
}

/**
 * 验证 Backchannel Logout Token（仅返回负载，向后兼容入口）
 *
 * 注意：除验证外还会记录 jti 防重放。调用方若在验证通过后本地处理失败，
 * 需改用 verifyLogoutTokenDetailed 获取 jti 并调用 releaseLogoutTokenJti 释放，
 * 以便 IdP 重投。
 */
export async function verifyLogoutToken(
  logoutToken: string,
  ssoBaseUrl: string,
  clientId: string
): Promise<LogoutTokenPayload> {
  const verified = await verifyLogoutTokenDetailed(logoutToken, ssoBaseUrl, clientId);
  return verified.payload;
}

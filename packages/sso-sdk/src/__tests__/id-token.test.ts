/**
 * id-token 模块测试：JWKS 缓存陈旧自愈（密钥轮换场景）
 *
 * 验证 validateIdToken 在「按 kid 过滤无候选」或「所有候选验签失败」时，
 * 通过 fetchJwks(baseUrl, { forceRefresh: true }) 强制重取 JWKS 并重试。
 * ID Token 使用真实生成的 RS256 密钥对签名。
 */
import { describe, it, expect, beforeEach, beforeAll, vi } from "vitest";
import {
  validateIdToken,
  fetchJwks,
  clearIdTokenCaches,
} from "../core/id-token";
import type { JwksKey } from "../core/id-token";

const BASE_URL = "https://nihplod.cn";
const CLIENT_ID = "test-client-id";
const ACCESS_TOKEN = "test-access-token";

const mockDiscovery = {
  issuer: BASE_URL,
  jwks_uri: `${BASE_URL}/api/oauth/jwks.json`,
};

// ============================================
// RS256 密钥对与 ID Token 构造工具
// ============================================

let privateKey: CryptoKey;
let publicJwk: JwksKey;
// 轮换前的旧公钥（与签名私钥不匹配的干扰 key）
let staleJwk: JwksKey;

function base64UrlEncodeStr(str: string): string {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function buildRs256IdToken(
  payload: Record<string, unknown>,
  kid: string
): Promise<string> {
  const headerB64 = base64UrlEncodeStr(JSON.stringify({ alg: "RS256", typ: "JWT", kid }));
  const bodyB64 = base64UrlEncodeStr(JSON.stringify(payload));
  const data = new TextEncoder().encode(`${headerB64}.${bodyB64}`);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, data);
  return `${headerB64}.${bodyB64}.${base64UrlEncodeBytes(new Uint8Array(sig))}`;
}

function validPayload(extra: Record<string, unknown> = {}): Record<string, unknown> {
  const nowSec = Math.floor(Date.now() / 1000);
  return {
    sub: "user123",
    iss: BASE_URL,
    aud: CLIENT_ID,
    iat: nowSec,
    exp: nowSec + 3600,
    ...extra,
  };
}

function jsonResponse(data: unknown): Response {
  return { ok: true, status: 200, json: async () => data } as Response;
}

/**
 * 安装 fetch mock：JWKS 响应按顺序从 jwksResponses 队列取出，
 * 队列耗尽后持续返回最后一个响应。
 */
function installFetchMock(jwksResponses: { keys: JwksKey[] }[]) {
  const jwksCalls: { url: string; init?: RequestInit }[] = [];
  let jwksCallCount = 0;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init?) => {
    const url = String(input);
    if (url.includes("/.well-known/openid-configuration")) {
      return jsonResponse(mockDiscovery);
    }
    if (url.includes("jwks")) {
      jwksCalls.push({ url, init: init as RequestInit | undefined });
      const idx = Math.min(jwksCallCount++, jwksResponses.length - 1);
      return jsonResponse(jwksResponses[idx]);
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  return jwksCalls;
}

describe("id-token JWKS 缓存自愈", () => {
  beforeAll(async () => {
    const keyPair = await crypto.subtle.generateKey(
      { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      true,
      ["sign", "verify"]
    );
    privateKey = keyPair.privateKey;
    publicJwk = {
      ...(await crypto.subtle.exportKey("jwk", keyPair.publicKey)),
      alg: "RS256",
      use: "sig",
      kid: "new-key",
    } as JwksKey;
    // 旧密钥对（密钥轮换前的 JWKS 内容）
    const stale = await crypto.subtle.generateKey(
      { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      true,
      ["sign", "verify"]
    );
    staleJwk = {
      ...(await crypto.subtle.exportKey("jwk", stale.publicKey)),
      alg: "RS256",
      use: "sig",
      kid: "old-key",
    } as JwksKey;
  });

  beforeEach(() => {
    clearIdTokenCaches();
    vi.restoreAllMocks();
  });

  it("首轮 JWKS 无该 kid → 强制刷新后含该 kid → 验签通过", async () => {
    const jwksCalls = installFetchMock([
      { keys: [staleJwk] }, // 陈旧缓存：只有旧 kid
      { keys: [staleJwk, publicJwk] }, // 强制刷新后：包含新 kid
    ]);
    const token = await buildRs256IdToken(validPayload(), "new-key");

    const result = await validateIdToken(token, ACCESS_TOKEN, BASE_URL, CLIENT_ID);

    expect(result.sub).toBe("user123");
    // JWKS 共拉取两次：首轮 + 强制刷新
    expect(jwksCalls.length).toBe(2);
    // 强制刷新必须以 cache: "no-cache" 绕过浏览器 HTTP 缓存
    expect(jwksCalls[1].init?.cache).toBe("no-cache");
    expect(jwksCalls[0].init?.cache).toBeUndefined();
  });

  it("所有候选验签失败（kid 命中错误公钥）→ 强制刷新重试后通过", async () => {
    // 首轮 JWKS 里同名 kid 对应的是旧公钥（验签必败）
    const staleSameKid = { ...staleJwk, kid: "new-key" };
    const jwksCalls = installFetchMock([
      { keys: [staleSameKid] },
      { keys: [publicJwk] },
    ]);
    const token = await buildRs256IdToken(validPayload(), "new-key");

    const result = await validateIdToken(token, ACCESS_TOKEN, BASE_URL, CLIENT_ID);

    expect(result.sub).toBe("user123");
    expect(jwksCalls.length).toBe(2);
    expect(jwksCalls[1].init?.cache).toBe("no-cache");
  });

  it("强制刷新后更新模块级缓存：后续验签不再重复拉取", async () => {
    const jwksCalls = installFetchMock([
      { keys: [staleJwk] },
      { keys: [publicJwk] },
    ]);
    const token = await buildRs256IdToken(validPayload(), "new-key");

    await validateIdToken(token, ACCESS_TOKEN, BASE_URL, CLIENT_ID);
    expect(jwksCalls.length).toBe(2);

    // 第二次验签应命中 forceRefresh 写入的模块级缓存，不再发起请求
    const result = await validateIdToken(token, ACCESS_TOKEN, BASE_URL, CLIENT_ID);
    expect(result.sub).toBe("user123");
    expect(jwksCalls.length).toBe(2);
  });

  it("强制刷新后仍无匹配 kid → 抛出 id_token_invalid_signature", async () => {
    installFetchMock([{ keys: [staleJwk] }]); // 队列耗尽后持续返回旧 JWKS
    const token = await buildRs256IdToken(validPayload(), "new-key");

    await expect(
      validateIdToken(token, ACCESS_TOKEN, BASE_URL, CLIENT_ID)
    ).rejects.toMatchObject({ code: "id_token_invalid_signature" });
  });

  it("首轮验签即通过时不触发强制刷新", async () => {
    const jwksCalls = installFetchMock([{ keys: [publicJwk] }]);
    const token = await buildRs256IdToken(validPayload(), "new-key");

    const result = await validateIdToken(token, ACCESS_TOKEN, BASE_URL, CLIENT_ID);

    expect(result.sub).toBe("user123");
    expect(jwksCalls.length).toBe(1);
  });

  it("fetchJwks forceRefresh 直接调用：绕过内存缓存并带 no-cache", async () => {
    const jwksCalls = installFetchMock([{ keys: [publicJwk] }]);

    await fetchJwks(BASE_URL);
    await fetchJwks(BASE_URL); // 命中内存缓存
    expect(jwksCalls.length).toBe(1);

    const fresh = await fetchJwks(BASE_URL, { forceRefresh: true });
    expect(fresh?.keys[0].kid).toBe("new-key");
    expect(jwksCalls.length).toBe(2);
    expect(jwksCalls[1].init?.cache).toBe("no-cache");
  });
});

/**
 * next/backchannel-logout.ts 测试
 *
 * 使用真实生成的 RS256 密钥对签发 logout_token，按 URL 路由 mock
 * Discovery / JWKS（参照 next-callback.test.ts 的写法）。
 *
 * 覆盖：合法 token 200 且 onLogout 被调用、签名错误 400、aud 不匹配 400、
 * 缺 events 400、type 非 logout_token 400、events 事件值非对象 400、
 * sub/sid 都缺 400、jti 重放 400、GET 405。
 */
import { describe, it, expect, beforeEach, beforeAll, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { createBackchannelLogoutRouteHandler } from "../next/backchannel-logout";
import { clearIdTokenCaches, type JwksKey } from "../core/id-token";
import { clearLogoutTokenReplayCache } from "../core/logout-token";

const config = {
  clientId: "test-client",
  ssoBaseUrl: "https://nihplod.cn",
};

const BACKCHANNEL_LOGOUT_EVENT =
  "http://schemas.openid.net/event/backchannel-logout";

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  } as Response;
}

function buildRequest(
  body?: string,
  method: string = "POST"
): NextRequest {
  return new NextRequest("https://myapp.com/api/auth/backchannel-logout", {
    method,
    headers:
      body !== undefined
        ? { "content-type": "application/x-www-form-urlencoded" }
        : {},
    ...(body !== undefined ? { body } : {}),
  });
}

// ============================================
// RS256 密钥对与 Logout Token 构造工具
// ============================================

let privateKey: CryptoKey;
let otherPrivateKey: CryptoKey;
let publicJwk: JwksKey;

function base64UrlEncodeStr(str: string): string {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function buildLogoutToken(
  payload: Record<string, unknown>,
  key: CryptoKey = privateKey
): Promise<string> {
  const headerB64 = base64UrlEncodeStr(
    JSON.stringify({ alg: "RS256", typ: "JWT", kid: "test-key-1" })
  );
  const bodyB64 = base64UrlEncodeStr(JSON.stringify(payload));
  const data = new TextEncoder().encode(`${headerB64}.${bodyB64}`);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, data);
  return `${headerB64}.${bodyB64}.${base64UrlEncodeBytes(new Uint8Array(sig))}`;
}

let jtiCounter = 0;

/** 合法 logout_token 负载（jti 每次自增，避免防重放缓存干扰其他用例） */
function validLogoutPayload(
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  const nowSec = Math.floor(Date.now() / 1000);
  return {
    iss: "https://nihplod.cn",
    aud: "test-client",
    iat: nowSec,
    exp: nowSec + 120,
    jti: `jti-${++jtiCounter}`,
    sub: "user-123",
    type: "logout_token",
    events: { [BACKCHANNEL_LOGOUT_EVENT]: {} },
    ...extra,
  };
}

/** mock Discovery / JWKS 拉取 */
function installFetchRouter() {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes("/.well-known/openid-configuration")) {
      return jsonResponse({
        issuer: "https://nihplod.cn",
        jwks_uri: "https://nihplod.cn/api/oauth/jwks.json",
      });
    }
    if (url.includes("jwks")) {
      return jsonResponse({ keys: [publicJwk] });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
}

function postWithToken(token: string): NextRequest {
  return buildRequest(new URLSearchParams({ logout_token: token }).toString());
}

describe("createBackchannelLogoutRouteHandler", () => {
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
      kid: "test-key-1",
    } as JwksKey;
    // 另一把私钥：用于"签名错误"用例（用错误私钥签名）
    const other = await crypto.subtle.generateKey(
      { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      true,
      ["sign", "verify"]
    );
    otherPrivateKey = other.privateKey;
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    // discovery / JWKS / jti 防重放均有模块级缓存：用例间必须隔离
    clearIdTokenCaches();
    clearLogoutTokenReplayCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("GET 请求返回 405", async () => {
    const handler = createBackchannelLogoutRouteHandler(config);
    const res = await handler(buildRequest(undefined, "GET"));
    expect(res.status).toBe(405);
  });

  it("缺少 logout_token 时返回 400", async () => {
    const handler = createBackchannelLogoutRouteHandler(config);
    const res = await handler(buildRequest("foo=bar"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error_description).toContain("logout_token");
  });

  it("合法 token：200 空响应、onLogout 被调用、本站 SSO cookie 被清除", async () => {
    installFetchRouter();
    const onLogout = vi.fn();
    const handler = createBackchannelLogoutRouteHandler({ ...config, onLogout });

    const token = await buildLogoutToken(validLogoutPayload({ sid: "sess-1" }));
    const res = await handler(postWithToken(token));

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("");
    expect(onLogout).toHaveBeenCalledWith(
      { sub: "user-123", sid: "sess-1" },
      expect.anything()
    );
    // 本站 SSO cookie 以 maxAge=0 清除
    expect(res.cookies.get("__Host-nihplod_sso_at")?.value).toBe("");
    expect(res.cookies.get("__Host-nihplod_sso_rt")?.value).toBe("");
    expect(res.cookies.get("__Host-nihplod_sso_id")?.value).toBe("");
  });

  it("签名错误（错误私钥签发）时返回 400，不调用 onLogout", async () => {
    installFetchRouter();
    const onLogout = vi.fn();
    const handler = createBackchannelLogoutRouteHandler({ ...config, onLogout });

    const token = await buildLogoutToken(validLogoutPayload(), otherPrivateKey);
    const res = await handler(postWithToken(token));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("logout_token_invalid_signature");
    expect(onLogout).not.toHaveBeenCalled();
  });

  it("aud 不匹配时返回 400", async () => {
    installFetchRouter();
    const handler = createBackchannelLogoutRouteHandler(config);

    const token = await buildLogoutToken(
      validLogoutPayload({ aud: "other-client" })
    );
    const res = await handler(postWithToken(token));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("logout_token_audience_mismatch");
  });

  it("缺少 events 声明时返回 400", async () => {
    installFetchRouter();
    const handler = createBackchannelLogoutRouteHandler(config);

    const payload = validLogoutPayload();
    delete payload.events;
    const token = await buildLogoutToken(payload);
    const res = await handler(postWithToken(token));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("logout_token_invalid");
    expect(body.error_description).toContain("events");
  });

  it("缺少 type 声明（或 type 不是 logout_token）时返回 400", async () => {
    installFetchRouter();
    const handler = createBackchannelLogoutRouteHandler(config);

    // 缺 type
    const payloadNoType = validLogoutPayload();
    delete payloadNoType.type;
    let token = await buildLogoutToken(payloadNoType);
    let res = await handler(postWithToken(token));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("logout_token_invalid");

    // type 错误（其他用途 token 不得冒充 logout_token）
    token = await buildLogoutToken(validLogoutPayload({ type: "access_token" }));
    res = await handler(postWithToken(token));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("logout_token_invalid");
    expect(body.error_description).toContain("type");
  });

  it("events 事件值不是对象时返回 400", async () => {
    installFetchRouter();
    const handler = createBackchannelLogoutRouteHandler(config);

    for (const badEvent of ["yes", 1, null, []]) {
      const token = await buildLogoutToken(
        validLogoutPayload({ events: { [BACKCHANNEL_LOGOUT_EVENT]: badEvent } })
      );
      const res = await handler(postWithToken(token));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("logout_token_invalid");
      expect(body.error_description).toContain("events");
    }
  });

  it("events 本身是数组时返回 400", async () => {
    installFetchRouter();
    const handler = createBackchannelLogoutRouteHandler(config);

    const token = await buildLogoutToken(
      validLogoutPayload({ events: [BACKCHANNEL_LOGOUT_EVENT] })
    );
    const res = await handler(postWithToken(token));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("logout_token_invalid");
  });

  it("sub 与 sid 都缺失时返回 400", async () => {
    installFetchRouter();
    const handler = createBackchannelLogoutRouteHandler(config);

    const payload = validLogoutPayload();
    delete payload.sub;
    const token = await buildLogoutToken(payload);
    const res = await handler(postWithToken(token));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error_description).toContain("sub 或 sid");
  });

  it("仅 sid（无 sub）时验证通过（sub 或 sid 居一即可）", async () => {
    installFetchRouter();
    const onLogout = vi.fn();
    const handler = createBackchannelLogoutRouteHandler({ ...config, onLogout });

    const payload = validLogoutPayload({ sid: "sess-only" });
    delete payload.sub;
    const token = await buildLogoutToken(payload);
    const res = await handler(postWithToken(token));

    expect(res.status).toBe(200);
    expect(onLogout).toHaveBeenCalledWith(
      { sub: undefined, sid: "sess-only" },
      expect.anything()
    );
  });

  it("jti 重放时返回 400", async () => {
    installFetchRouter();
    const handler = createBackchannelLogoutRouteHandler(config);

    const token = await buildLogoutToken(validLogoutPayload());
    const first = await handler(postWithToken(token));
    expect(first.status).toBe(200);

    const second = await handler(postWithToken(token));
    expect(second.status).toBe(400);
    const body = await second.json();
    expect(body.error).toBe("logout_token_replay");
  });

  it("onLogout 抛错时返回 500（让 IdP 重投）", async () => {
    installFetchRouter();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = createBackchannelLogoutRouteHandler({
      ...config,
      onLogout: () => {
        throw new Error("db down");
      },
    });

    const token = await buildLogoutToken(validLogoutPayload());
    const res = await handler(postWithToken(token));

    expect(res.status).toBe(500);
    expect(errorSpy).toHaveBeenCalled();
  });

  it("onLogout 失败后 IdP 重投同一 token 可成功（jti 已释放，非 fail-open）", async () => {
    installFetchRouter();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = createBackchannelLogoutRouteHandler({
      ...config,
      onLogout: () => {
        throw new Error("db down");
      },
    });

    const token = await buildLogoutToken(validLogoutPayload());
    const first = await failing(postWithToken(token));
    expect(first.status).toBe(500);

    // 重投（同一 logout_token）应重新执行验证与钩子，而不是被重放检查 400 拒绝
    const onRetry = vi.fn();
    const succeeding = createBackchannelLogoutRouteHandler({
      ...config,
      onLogout: onRetry,
    });
    const second = await succeeding(postWithToken(token));
    expect(second.status).toBe(200);
    expect(onRetry).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });
});

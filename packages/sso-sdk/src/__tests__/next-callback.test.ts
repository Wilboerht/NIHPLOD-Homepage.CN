/**
 * next/callback.ts 测试
 *
 * 覆盖：state 不匹配拒绝、refresh_token 缺失走错误路径（不写 "undefined" cookie）、
 * 成功路径设置 at/rt cookie 并清除临时 cookie。
 */
import { describe, it, expect, beforeEach, beforeAll, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { createCallbackRouteHandler } from "../next/callback";
import { clearIdTokenCaches, type JwksKey } from "../core/id-token";

const config = {
  clientId: "test-client",
  clientSecret: "test-secret",
  ssoBaseUrl: "https://nihplod.cn",
  redirectUri: "https://myapp.com/api/auth/callback",
  // 多数用例聚焦 cookie/错误路径：使用非 OIDC scope，token 响应无需 id_token。
  // openid 场景（要求 id_token、nonce 校验）由专门用例单独覆盖。
  scopes: "profile membership",
};

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  } as Response;
}

function buildRequest(
  query: Record<string, string>,
  cookies: Record<string, string> = {},
  headers: Record<string, string> = {}
): NextRequest {
  const qs = new URLSearchParams(query).toString();
  const cookieHeader = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
  return new NextRequest(`https://myapp.com/api/auth/callback?${qs}`, {
    headers: { ...(cookieHeader ? { cookie: cookieHeader } : {}), ...headers },
  });
}

// cookie 名含连字符，使用常量引用
const STATE_COOKIE = "__Host-nihplod_sso_state";
const NONCE_COOKIE = "__Host-nihplod_sso_nonce";
const VERIFIER_COOKIE = "__Secure-nihplod_sso_verifier";
const RETURN_COOKIE = "__Host-nihplod_sso_return";

// ============================================
// RS256 密钥对与 ID Token 构造工具（nonce 校验用例）
// ============================================

let privateKey: CryptoKey;
let publicJwk: JwksKey;

function base64UrlEncodeStr(str: string): string {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function buildRs256IdToken(payload: Record<string, unknown>): Promise<string> {
  const headerB64 = base64UrlEncodeStr(JSON.stringify({ alg: "RS256", typ: "JWT", kid: "test-key-1" }));
  const bodyB64 = base64UrlEncodeStr(JSON.stringify(payload));
  const data = new TextEncoder().encode(`${headerB64}.${bodyB64}`);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, data);
  return `${headerB64}.${bodyB64}.${base64UrlEncodeBytes(new Uint8Array(sig))}`;
}

function validIdTokenPayload(extra: Record<string, unknown> = {}): Record<string, unknown> {
  const nowSec = Math.floor(Date.now() / 1000);
  return {
    sub: "user-123",
    iss: "https://nihplod.cn",
    aud: "test-client",
    iat: nowSec,
    exp: nowSec + 3600,
    ...extra,
  };
}

/** 按 URL 路由的 fetch mock：token 交换返回携带 id_token 的响应，另含 discovery / JWKS */
function installFetchRouterWithIdToken(idToken: string) {
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
    if (url.includes("/api/oauth/token")) {
      return jsonResponse({
        access_token: "at-1",
        token_type: "Bearer",
        expires_in: 900,
        refresh_token: "rt-1",
        id_token: idToken,
      });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
}

describe("createCallbackRouteHandler", () => {
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
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    clearIdTokenCaches();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("state 不匹配时返回 400，不发起 token 交换", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const handler = createCallbackRouteHandler(config);
    const res = await handler(
      buildRequest(
        { code: "auth-code", state: "wrong-state" },
        { [STATE_COOKIE]: "saved-state" }
      )
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_request");
    expect(body.error_description).toContain("登录会话校验失败");
    expect(body.error_description).not.toContain("CSRF");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("缺少 PKCE verifier cookie 时返回 400", async () => {
    const handler = createCallbackRouteHandler(config);
    const res = await handler(
      buildRequest(
        { code: "auth-code", state: "saved-state" },
        { [STATE_COOKIE]: "saved-state" }
      )
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error_description).toContain("重新发起登录");
  });

  it("浏览器导航（Accept: text/html）错误时渲染 HTML 错误页而非裸 JSON", async () => {
    const handler = createCallbackRouteHandler(config);
    const res = await handler(
      buildRequest(
        { code: "auth-code", state: "wrong-state" },
        { [STATE_COOKIE]: "saved-state" },
        { accept: "text/html,application/xhtml+xml" }
      )
    );

    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("登录失败");
    expect(html).toContain("重新登录");
    expect(html).toContain("返回首页");
    // 不应把原始 JSON 暴露给用户
    expect(html).not.toContain('"error":');
  });

  it("?format=json 时即使 Accept 为 text/html 也返回 JSON（API 调用方兼容）", async () => {
    const handler = createCallbackRouteHandler(config);
    const res = await handler(
      buildRequest(
        { code: "auth-code", state: "wrong-state", format: "json" },
        { [STATE_COOKIE]: "saved-state" },
        { accept: "text/html" }
      )
    );

    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = await res.json();
    expect(body.error).toBe("invalid_request");
  });

  it("renderErrorPage 自定义渲染优先于默认错误页", async () => {
    const handler = createCallbackRouteHandler({
      ...config,
      renderErrorPage: ({ status: s, error }) =>
        new Response(`custom:${s}:${error}`, { status: s }),
    });
    const res = await handler(
      buildRequest(
        { code: "auth-code", state: "wrong-state" },
        { [STATE_COOKIE]: "saved-state" },
        { accept: "text/html" }
      )
    );

    expect(res.status).toBe(400);
    expect(await res.text()).toBe("custom:400:invalid_request");
  });

  it("Cookie 命名口径不一致（state 以去前缀名存在）：报 invalid_config 而非泛化 state 缺失", async () => {
    const handler = createCallbackRouteHandler(config);
    const res = await handler(
      buildRequest(
        { code: "auth-code", state: "saved-state" },
        // 安全命名应为 __Host-...；这里模拟 insecureLocalDev 口径写入的无前缀 Cookie
        { nihplod_sso_state: "saved-state" }
      )
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("invalid_config");
    expect(body.error_description).toContain("insecureLocalDev");
  });

  it("token 响应缺少 refresh_token 时返回 502，不写入 cookie", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      jsonResponse({
        access_token: "at-1",
        token_type: "Bearer",
        expires_in: 900,
        // refresh_token 缺失（服务端异常）
      })
    );
    const handler = createCallbackRouteHandler(config);
    const res = await handler(
      buildRequest(
        { code: "auth-code", state: "saved-state" },
        { [STATE_COOKIE]: "saved-state", [VERIFIER_COOKIE]: "v" }
      )
    );
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("server_error");
    expect(body.error_description).toContain("不完整");
    // 不应写入任何 token cookie
    expect(res.cookies.get("__Host-nihplod_sso_at")).toBeUndefined();
    expect(res.cookies.get("__Host-nihplod_sso_rt")).toBeUndefined();
  });

  it("token 响应缺少 access_token 时返回 502", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      jsonResponse({
        token_type: "Bearer",
        expires_in: 900,
        refresh_token: "rt-1",
      })
    );
    const handler = createCallbackRouteHandler(config);
    const res = await handler(
      buildRequest(
        { code: "auth-code", state: "saved-state" },
        { [STATE_COOKIE]: "saved-state", [VERIFIER_COOKIE]: "v" }
      )
    );
    expect(res.status).toBe(502);
    expect(res.cookies.get("__Host-nihplod_sso_at")).toBeUndefined();
  });

  it("成功路径：重定向到 returnUrl，设置 at/rt cookie 并清除临时 cookie", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      jsonResponse({
        access_token: "at-1",
        token_type: "Bearer",
        expires_in: 900,
        refresh_token: "rt-1",
      })
    );
    const handler = createCallbackRouteHandler(config);
    const res = await handler(
      buildRequest(
        { code: "auth-code", state: "saved-state" },
        {
          [STATE_COOKIE]: "saved-state",
          [VERIFIER_COOKIE]: "v",
          [RETURN_COOKIE]: "/dashboard",
        }
      )
    );

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://myapp.com/dashboard");

    // token cookie 已写入
    expect(res.cookies.get("__Host-nihplod_sso_at")?.value).toBe("at-1");
    expect(res.cookies.get("__Host-nihplod_sso_rt")?.value).toBe("rt-1");

    // 临时 cookie 已清除（maxAge=0）
    expect(res.cookies.get(STATE_COOKIE)?.value).toBe("");
    expect(res.cookies.get(RETURN_COOKIE)?.value).toBe("");
  });

  it("按 state 后缀读取并清除瞬态 cookie（多标签页隔离格式）", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      jsonResponse({
        access_token: "at-suffixed",
        token_type: "Bearer",
        expires_in: 900,
        refresh_token: "rt-suffixed",
      })
    );
    const handler = createCallbackRouteHandler(config);
    const state = "state-suffixed-1234567890";
    const res = await handler(
      buildRequest(
        { code: "auth-code", state },
        {
          [`${STATE_COOKIE}_${state}`]: state,
          [`${VERIFIER_COOKIE}_${state}`]: "v-suffixed",
          [`${RETURN_COOKIE}_${state}`]: "/dashboard",
        }
      )
    );

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://myapp.com/dashboard");
    expect(res.cookies.get("__Host-nihplod_sso_at")?.value).toBe("at-suffixed");
    // 后缀名与旧固定名均被清除
    expect(res.cookies.get(`${STATE_COOKIE}_${state}`)?.value).toBe("");
    expect(res.cookies.get(STATE_COOKIE)?.value).toBe("");
  });

  it("scope 含 openid 但 token 响应缺少 id_token 时返回 400（fail-closed）", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      jsonResponse({
        access_token: "at-1",
        token_type: "Bearer",
        expires_in: 900,
        refresh_token: "rt-1",
      })
    );
    const handler = createCallbackRouteHandler({ ...config, scopes: "openid profile" });
    const res = await handler(
      buildRequest(
        { code: "auth-code", state: "saved-state" },
        { [STATE_COOKIE]: "saved-state", [VERIFIER_COOKIE]: "v" }
      )
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("id_token_invalid");
  });

  it("未显式配置 scopes 时保持兼容：缺少 id_token 不拒绝（升级平滑）", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      jsonResponse({
        access_token: "at-compat",
        token_type: "Bearer",
        expires_in: 900,
        refresh_token: "rt-compat",
      })
    );
    // 模拟旧接入方：callback 未配置 scopes
    const { scopes: _scopes, ...legacyConfig } = config;
    const handler = createCallbackRouteHandler(legacyConfig);
    const res = await handler(
      buildRequest(
        { code: "auth-code", state: "saved-state" },
        { [STATE_COOKIE]: "saved-state", [VERIFIER_COOKIE]: "v" }
      )
    );

    expect(res.status).toBe(307);
    expect(res.cookies.get("__Host-nihplod_sso_at")?.value).toBe("at-compat");
  });

  it("returnUrl cookie 为跨域地址时回退到 /", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      jsonResponse({
        access_token: "at-1",
        token_type: "Bearer",
        expires_in: 900,
        refresh_token: "rt-1",
      })
    );
    const handler = createCallbackRouteHandler(config);
    const res = await handler(
      buildRequest(
        { code: "auth-code", state: "saved-state" },
        {
          [STATE_COOKIE]: "saved-state",
          [VERIFIER_COOKIE]: "v",
          [RETURN_COOKIE]: "https://evil.com/phish",
        }
      )
    );
    expect(res.headers.get("location")).toBe("https://myapp.com/");
  });

  it("standalone 部署（request.url 为监听地址 0.0.0.0:3002）：跳转基准取 redirectUri 的 origin", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      jsonResponse({
        access_token: "at-1",
        token_type: "Bearer",
        expires_in: 900,
        refresh_token: "rt-1",
      })
    );
    const handler = createCallbackRouteHandler(config);
    const qs = new URLSearchParams({ code: "auth-code", state: "saved-state" }).toString();
    const req = new NextRequest(`http://0.0.0.0:3002/api/auth/callback?${qs}`, {
      headers: {
        cookie: [STATE_COOKIE + "=saved-state", VERIFIER_COOKIE + "=v", RETURN_COOKIE + "=/dashboard"].join("; "),
      },
    });
    const res = await handler(req);
    expect(res.status).toBe(307);
    // 不得跳到 http://0.0.0.0:3002/...
    expect(res.headers.get("location")).toBe("https://myapp.com/dashboard");
  });

  it("standalone 部署下 returnUrl 为同源绝对地址（redirectUri 的 origin）仍被信任", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      jsonResponse({
        access_token: "at-1",
        token_type: "Bearer",
        expires_in: 900,
        refresh_token: "rt-1",
      })
    );
    const handler = createCallbackRouteHandler(config);
    const qs = new URLSearchParams({ code: "auth-code", state: "saved-state" }).toString();
    const req = new NextRequest(`http://0.0.0.0:3002/api/auth/callback?${qs}`, {
      headers: {
        cookie: [STATE_COOKIE + "=saved-state", VERIFIER_COOKIE + "=v", RETURN_COOKIE + "=https%3A%2F%2Fmyapp.com%2Fdashboard"].join("; "),
      },
    });
    const res = await handler(req);
    expect(res.headers.get("location")).toBe("https://myapp.com/dashboard");
  });

  it("insecureLocalDev=true（非生产）：启动时告警并使用无前缀 cookie", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      jsonResponse({
        access_token: "at-1",
        token_type: "Bearer",
        expires_in: 900,
        refresh_token: "rt-1",
      })
    );
    const handler = createCallbackRouteHandler({ ...config, insecureLocalDev: true });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("仅限 http://localhost"));

    // 无前缀 cookie 可被读取（与 middleware 写入的一致）
    const res = await handler(
      buildRequest(
        { code: "auth-code", state: "saved-state" },
        { nihplod_sso_state: "saved-state", nihplod_sso_verifier: "v" }
      )
    );
    expect(res.status).toBe(307);
    expect(res.cookies.get("nihplod_sso_at")?.value).toBe("at-1");
    expect(res.cookies.get("__Host-nihplod_sso_at")).toBeUndefined();
  });

  it("insecureLocalDev=true 但生产环境（NODE_ENV=production 且 ssoBaseUrl 为 https）：强制忽略，仍使用 __Host- 前缀 cookie", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      jsonResponse({
        access_token: "at-1",
        token_type: "Bearer",
        expires_in: 900,
        refresh_token: "rt-1",
      })
    );
    const handler = createCallbackRouteHandler({ ...config, insecureLocalDev: true });
    // 告警明确说明开关被忽略
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("已被忽略"));

    // 守卫生效后仍读取 __Host- 前缀的 state/verifier（若未守卫会因找不到无前缀 cookie 返回 400）
    const res = await handler(
      buildRequest(
        { code: "auth-code", state: "saved-state" },
        { [STATE_COOKIE]: "saved-state", [VERIFIER_COOKIE]: "v" }
      )
    );
    expect(res.status).toBe(307);
    expect(res.cookies.get("__Host-nihplod_sso_at")?.value).toBe("at-1");
    expect(res.cookies.get("nihplod_sso_at")).toBeUndefined();
  });

  describe("OIDC nonce", () => {
    function buildNonceRequest(nonceCookie: string | null) {
      const cookies: Record<string, string> = {
        [STATE_COOKIE]: "saved-state",
        [VERIFIER_COOKIE]: "v",
      };
      if (nonceCookie !== null) cookies[NONCE_COOKIE] = nonceCookie;
      return buildRequest({ code: "auth-code", state: "saved-state" }, cookies);
    }

    it("nonce cookie 与 id_token nonce 一致时登录成功，nonce cookie 被清除", async () => {
      const idToken = await buildRs256IdToken(validIdTokenPayload({ nonce: "nonce-abc" }));
      installFetchRouterWithIdToken(idToken);

      const handler = createCallbackRouteHandler(config);
      const res = await handler(buildNonceRequest("nonce-abc"));

      expect(res.status).toBe(307);
      expect(res.cookies.get("__Host-nihplod_sso_at")?.value).toBe("at-1");
      // 成功后 nonce cookie 一次性清除
      expect(res.cookies.get(NONCE_COOKIE)?.value).toBe("");
    });

    it("id_token nonce 与 cookie 不一致时拒绝登录，不写 token cookie，且清除 nonce cookie", async () => {
      const idToken = await buildRs256IdToken(validIdTokenPayload({ nonce: "attacker-nonce" }));
      installFetchRouterWithIdToken(idToken);

      const handler = createCallbackRouteHandler(config);
      const res = await handler(buildNonceRequest("real-nonce"));

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("id_token_invalid");
      expect(body.error_description).toContain("nonce");
      expect(res.cookies.get("__Host-nihplod_sso_at")).toBeUndefined();
      // 错误路径也清除 nonce cookie，避免残留
      expect(res.cookies.get(NONCE_COOKIE)?.value).toBe("");
    });

    it("nonce cookie 存在但 id_token 缺 nonce claim 时拒绝登录（fail-closed）", async () => {
      const idToken = await buildRs256IdToken(validIdTokenPayload());
      installFetchRouterWithIdToken(idToken);

      const handler = createCallbackRouteHandler(config);
      const res = await handler(buildNonceRequest("real-nonce"));

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("id_token_invalid");
      expect(res.cookies.get("__Host-nihplod_sso_at")).toBeUndefined();
    });

    it("无 nonce cookie（如旧版 middleware 发起的流程）时跳过 nonce 校验", async () => {
      const idToken = await buildRs256IdToken(validIdTokenPayload());
      installFetchRouterWithIdToken(idToken);

      const handler = createCallbackRouteHandler(config);
      const res = await handler(buildNonceRequest(null));

      expect(res.status).toBe(307);
      expect(res.cookies.get("__Host-nihplod_sso_at")?.value).toBe("at-1");
    });

    it("state 不匹配（可能的 CSRF）时 nonce cookie 一并清除", async () => {
      const handler = createCallbackRouteHandler(config);
      const res = await handler(
        buildRequest(
          { code: "auth-code", state: "wrong-state" },
          { [STATE_COOKIE]: "saved-state", [NONCE_COOKIE]: "some-nonce" }
        )
      );

      expect(res.status).toBe(400);
      expect(res.cookies.get(NONCE_COOKIE)?.value).toBe("");
    });
  });
});

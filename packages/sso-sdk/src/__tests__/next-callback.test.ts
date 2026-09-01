/**
 * next/callback.ts 测试
 *
 * 覆盖：state 不匹配拒绝、refresh_token 缺失走错误路径（不写 "undefined" cookie）、
 * 成功路径设置 at/rt cookie 并清除临时 cookie。
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { createCallbackRouteHandler } from "../next/callback";

const config = {
  clientId: "test-client",
  clientSecret: "test-secret",
  ssoBaseUrl: "https://nihplod.cn",
  redirectUri: "https://myapp.com/api/auth/callback",
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
  cookies: Record<string, string> = {}
): NextRequest {
  const qs = new URLSearchParams(query).toString();
  const cookieHeader = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
  return new NextRequest(`https://myapp.com/api/auth/callback?${qs}`, {
    headers: cookieHeader ? { cookie: cookieHeader } : {},
  });
}

// cookie 名含连字符，使用常量引用
const STATE_COOKIE = "__Host-nihplod_sso_state";
const VERIFIER_COOKIE = "__Secure-nihplod_sso_verifier";
const RETURN_COOKIE = "__Host-nihplod_sso_return";

describe("createCallbackRouteHandler", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
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
    expect(body.error_description).toContain("State 参数不匹配");
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
    expect(body.error_description).toContain("PKCE verifier 缺失");
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
    expect(body.error_description).toContain("refresh_token");
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
});

/**
 * next/logout.ts 测试
 *
 * 覆盖：RP-Initiated Logout 回跳的 state 校验（CSRF）、
 * 正常登出流程清除 cookie 并重定向到 SSO 登出页（写 logout state cookie）。
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { createLogoutRouteHandler } from "../next/logout";

const config = {
  clientId: "test-client",
  clientSecret: "test-secret",
  ssoBaseUrl: "https://nihplod.cn",
  redirectUri: "https://myapp.com/api/auth/callback",
  postLogoutRedirectUri: "https://myapp.com/api/auth/logout",
};

const LOGOUT_STATE_COOKIE = "__Host-nihplod_sso_logout_state";

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  } as Response;
}

function buildRequest(
  query: Record<string, string> = {},
  cookies: Record<string, string> = {}
): NextRequest {
  const qs = new URLSearchParams(query).toString();
  const cookieHeader = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
  return new NextRequest(
    `https://myapp.com/api/auth/logout${qs ? `?${qs}` : ""}`,
    { headers: cookieHeader ? { cookie: cookieHeader } : {} }
  );
}

describe("createLogoutRouteHandler", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("回跳 state 不匹配时返回 400（登出 CSRF 防护）", async () => {
    const handler = createLogoutRouteHandler(config);
    const res = await handler(
      buildRequest({ state: "forged-state" }, { [LOGOUT_STATE_COOKIE]: "real-state" })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error_description).toContain("Logout state 不匹配");
  });

  it("回跳缺少已保存的 logout state cookie 时返回 400", async () => {
    const handler = createLogoutRouteHandler(config);
    const res = await handler(buildRequest({ state: "any-state" }));
    expect(res.status).toBe(400);
  });

  it("回跳 state 匹配时重定向到首页并清除 logout state cookie", async () => {
    const handler = createLogoutRouteHandler(config);
    const res = await handler(
      buildRequest({ state: "real-state" }, { [LOGOUT_STATE_COOKIE]: "real-state" })
    );
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://myapp.com/");
    expect(res.cookies.get(LOGOUT_STATE_COOKIE)?.value).toBe("");
  });

  it("standalone 部署（request.url 为监听地址 0.0.0.0:3002）：回跳重定向取 redirectUri 的 origin", async () => {
    const handler = createLogoutRouteHandler(config);
    const req = new NextRequest(
      "http://0.0.0.0:3002/api/auth/logout?state=real-state",
      { headers: { cookie: `${LOGOUT_STATE_COOKIE}=real-state` } }
    );
    const res = await handler(req);
    expect(res.status).toBe(307);
    // 不得跳到 http://0.0.0.0:3002/...
    expect(res.headers.get("location")).toBe("https://myapp.com/");
  });

  it("正常登出：撤销 refresh_token、清除本地 cookie、重定向 SSO 并写 logout state cookie", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/.well-known/openid-configuration")) {
          return jsonResponse({
            end_session_endpoint: "https://nihplod.cn/api/oauth/end-session",
            revocation_endpoint: "https://nihplod.cn/api/oauth/revoke",
          });
        }
        if (url.includes("/api/oauth/revoke")) return jsonResponse({});
        throw new Error(`unexpected fetch: ${url}`);
      });

    const handler = createLogoutRouteHandler(config);
    const res = await handler(
      buildRequest({}, { "__Host-nihplod_sso_rt": "rt-1", "__Host-nihplod_sso_id": "id-token-1" })
    );

    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.origin + location.pathname).toBe(
      "https://nihplod.cn/api/oauth/end-session"
    );
    expect(location.searchParams.get("client_id")).toBe("test-client");
    expect(location.searchParams.get("id_token_hint")).toBe("id-token-1");
    const state = location.searchParams.get("state");
    expect(state).toBeTruthy();

    // logout state cookie 与 URL 中的 state 一致（供回跳校验）
    expect(res.cookies.get(LOGOUT_STATE_COOKIE)?.value).toBe(state);

    // 本地 SSO cookie 已清除
    expect(res.cookies.get("__Host-nihplod_sso_at")?.value).toBe("");
    expect(res.cookies.get("__Host-nihplod_sso_rt")?.value).toBe("");
    expect(res.cookies.get("__Host-nihplod_sso_id")?.value).toBe("");

    // 已调用 revocation 端点撤销 refresh_token
    const revokeCall = fetchSpy.mock.calls.find(([input]) =>
      String(input).includes("/api/oauth/revoke")
    );
    expect(revokeCall).toBeTruthy();
    expect(String(revokeCall![1]?.body)).toContain("token=rt-1");
  });

  it("redirectToSso=false 时仅清除 cookie 并重定向首页", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      jsonResponse({})
    );
    const handler = createLogoutRouteHandler({ ...config, redirectToSso: false });
    const res = await handler(buildRequest());
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://myapp.com/");
    expect(res.cookies.get("__Host-nihplod_sso_at")?.value).toBe("");
  });

  it("Discovery 不可达时回退到 /api/oauth/end-session（与 SsoClient 一致）", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      throw new Error("network down");
    });
    const handler = createLogoutRouteHandler(config);
    const res = await handler(buildRequest());
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.origin + location.pathname).toBe(
      "https://nihplod.cn/api/oauth/end-session"
    );
  });

  it("insecureLocalDev=true（非生产）：启动时告警并清除无前缀 cookie", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      jsonResponse({})
    );
    const handler = createLogoutRouteHandler({
      ...config,
      redirectToSso: false,
      insecureLocalDev: true,
    });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("仅限 http://localhost"));

    const res = await handler(buildRequest());
    expect(res.cookies.get("nihplod_sso_at")?.value).toBe("");
    expect(res.cookies.get("__Host-nihplod_sso_at")).toBeUndefined();
  });

  it("insecureLocalDev=true 但生产环境（NODE_ENV=production 且 ssoBaseUrl 为 https）：强制忽略，仍清除 __Host- 前缀 cookie", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      jsonResponse({})
    );
    const handler = createLogoutRouteHandler({
      ...config,
      redirectToSso: false,
      insecureLocalDev: true,
    });
    // 告警明确说明开关被忽略
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("已被忽略"));

    const res = await handler(buildRequest());
    expect(res.cookies.get("__Host-nihplod_sso_at")?.value).toBe("");
    expect(res.cookies.get("nihplod_sso_at")).toBeUndefined();
  });
});

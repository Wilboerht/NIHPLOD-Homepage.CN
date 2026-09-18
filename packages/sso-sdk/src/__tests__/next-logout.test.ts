/**
 * next/logout.ts 测试
 *
 * 覆盖：RP-Initiated Logout 回跳的 state 校验（CSRF）、
 * GET 无 state 时返回确认页而不执行登出（登出 CSRF 防护）、
 * 正常登出流程（POST）清除 cookie 并重定向到 SSO 登出页（写 logout state cookie）。
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { createLogoutRouteHandler } from "../next/logout";
import { clearDiscoveryCache } from "../core/discovery";

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
  cookies: Record<string, string> = {},
  method: string = "GET",
  body?: string
): NextRequest {
  const qs = new URLSearchParams(query).toString();
  const cookieHeader = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
  const headers: Record<string, string> = {};
  if (cookieHeader) headers.cookie = cookieHeader;
  if (body !== undefined) {
    headers["content-type"] = "application/x-www-form-urlencoded";
  }
  return new NextRequest(
    `https://myapp.com/api/auth/logout${qs ? `?${qs}` : ""}`,
    { method, headers, ...(body !== undefined ? { body } : {}) }
  );
}

describe("createLogoutRouteHandler", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // discovery 有模块级缓存：用例间必须隔离，否则前一个用例的缓存会影响后一个
    clearDiscoveryCache();
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

  it("GET 无 state 时不执行登出：返回确认页 HTML，不撤销 token、不清 cookie", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => jsonResponse({}));

    const handler = createLogoutRouteHandler(config);
    const res = await handler(
      buildRequest({}, { "__Host-nihplod_sso_rt": "rt-1" })
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain('method="post"');
    // 确认页提供"同时退出所有 NIHPLOD 平台"勾选框（勾选后表单携带 global=1）
    expect(html).toContain('name="global"');

    // 不撤销 refresh_token、不清除本地 cookie、不重定向 SSO
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(res.cookies.get("__Host-nihplod_sso_rt")).toBeUndefined();
  });

  it("正常登出（POST + global=1）：撤销 refresh_token、清除本地 cookie、重定向 SSO 并写 logout state cookie", async () => {
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
      buildRequest({}, { "__Host-nihplod_sso_rt": "rt-1", "__Host-nihplod_sso_id": "id-token-1" }, "POST", "global=1")
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
    // nonce cookie（可能因登录流程中断而残留）一并清除
    expect(res.cookies.get("__Host-nihplod_sso_nonce")?.value).toBe("");

    // 已调用 revocation 端点撤销 refresh_token
    const revokeCall = fetchSpy.mock.calls.find(([input]) =>
      String(input).includes("/api/oauth/revoke")
    );
    expect(revokeCall).toBeTruthy();
    expect(String(revokeCall![1]?.body)).toContain("token=rt-1");
  });

  it("默认 local：POST 不带 global 字段时仅退出本站（不跳转 SSO）", async () => {
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
      buildRequest({}, { "__Host-nihplod_sso_rt": "rt-1" }, "POST")
    );

    // local：重定向回本站首页，而非 IdP end-session
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://myapp.com/");
    // 本地 cookie 已清除、refresh_token 已撤销
    expect(res.cookies.get("__Host-nihplod_sso_at")?.value).toBe("");
    expect(res.cookies.get("__Host-nihplod_sso_rt")?.value).toBe("");
    expect(
      fetchSpy.mock.calls.some(([input]) => String(input).includes("/api/oauth/revoke"))
    ).toBe(true);
  });

  it("defaultScope: \"global\" 配置生效：POST 不带 global 字段时走 end-session", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
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

    const handler = createLogoutRouteHandler({ ...config, defaultScope: "global" });
    const res = await handler(buildRequest({}, {}, "POST"));

    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.origin + location.pathname).toBe(
      "https://nihplod.cn/api/oauth/end-session"
    );
  });

  it("表单携带 global=0 时即使 defaultScope 为 global 也按 local 处理（表单优先）", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => jsonResponse({}));

    const handler = createLogoutRouteHandler({ ...config, defaultScope: "global" });
    const res = await handler(buildRequest({}, {}, "POST", "global=0"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://myapp.com/");
  });

  it("redirectToSso 别名兼容：true 映射为 global 并输出弃用告警", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/.well-known/openid-configuration")) {
        return jsonResponse({
          end_session_endpoint: "https://nihplod.cn/api/oauth/end-session",
        });
      }
      return jsonResponse({});
    });

    const handler = createLogoutRouteHandler({ ...config, redirectToSso: true });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("redirectToSso 已弃用"));

    const res = await handler(buildRequest({}, {}, "POST"));
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.origin + location.pathname).toBe(
      "https://nihplod.cn/api/oauth/end-session"
    );
  });

  it("redirectToSso 别名兼容：false 映射为 local 并输出弃用告警", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      jsonResponse({})
    );
    const handler = createLogoutRouteHandler({ ...config, redirectToSso: false });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("redirectToSso 已弃用"));

    const res = await handler(buildRequest({}, {}, "POST"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://myapp.com/");
    expect(res.cookies.get("__Host-nihplod_sso_at")?.value).toBe("");
  });

  it("Discovery 不可达时回退到 /api/oauth/end-session（与 SsoClient 一致）", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      throw new Error("network down");
    });
    const handler = createLogoutRouteHandler(config);
    const res = await handler(buildRequest({}, {}, "POST", "global=1"));
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

    const res = await handler(buildRequest({}, {}, "POST"));
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

    const res = await handler(buildRequest({}, {}, "POST"));
    expect(res.cookies.get("__Host-nihplod_sso_at")?.value).toBe("");
    expect(res.cookies.get("nihplod_sso_at")).toBeUndefined();
  });

  it("serverBaseUrl 配置时：discovery/revoke 走内网，end-session 跳转仍走公网", async () => {
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

    const handler = createLogoutRouteHandler({
      ...config,
      serverBaseUrl: "http://127.0.0.1:3000",
    });
    const res = await handler(
      buildRequest({}, { "__Host-nihplod_sso_rt": "rt-1" }, "POST", "global=1")
    );

    // 配置内网地址时 revoke 直连内网默认端点（不使用 discovery 里的公网 URL）
    const revokeCall = fetchSpy.mock.calls.find(([input]) =>
      String(input).includes("/api/oauth/revoke")
    );
    expect(revokeCall).toBeTruthy();
    expect(String(revokeCall![0])).toBe("http://127.0.0.1:3000/api/oauth/revoke");

    // end-session 是浏览器跳转目标：必须使用公网地址
    const location = new URL(res.headers.get("location")!);
    expect(location.origin).toBe("https://nihplod.cn");
  });

  it("discovery 缓存：连续两次登出只拉取一次 discovery", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/.well-known/openid-configuration")) {
          return jsonResponse({
            end_session_endpoint: "https://nihplod.cn/api/oauth/end-session",
          });
        }
        if (url.includes("/api/oauth/revoke")) return jsonResponse({});
        throw new Error(`unexpected fetch: ${url}`);
      });

    const handler = createLogoutRouteHandler(config);
    await handler(buildRequest({}, { "__Host-nihplod_sso_rt": "rt-1" }, "POST", "global=1"));
    await handler(buildRequest({}, { "__Host-nihplod_sso_rt": "rt-2" }, "POST", "global=1"));

    const discoveryCalls = fetchSpy.mock.calls.filter(([input]) =>
      String(input).includes("/.well-known/openid-configuration")
    );
    expect(discoveryCalls.length).toBe(1);
  });
});

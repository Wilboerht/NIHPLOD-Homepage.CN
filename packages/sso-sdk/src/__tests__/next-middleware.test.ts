/**
 * next/middleware.ts 测试
 *
 * 覆盖：静态资源放行、未认证重定向 authorize + 写 state/verifier cookie、
 * introspection 缓存命中（同一 token 第二次请求不再调用 SSO 中心）。
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { createSsoMiddleware } from "../next/middleware";

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

describe("createSsoMiddleware", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("静态资源与 Next.js 内部路由直接放行", async () => {
    const middleware = createSsoMiddleware(config);
    for (const path of [
      "/_next/static/chunk.js",
      "/favicon.ico",
      "/images/logo.png",
      "/styles/app.css",
    ]) {
      const res = await middleware(new NextRequest(`https://myapp.com${path}`));
      expect(res.headers.get("location")).toBeNull();
    }
  });

  it("公开路径不需要认证", async () => {
    const middleware = createSsoMiddleware({
      ...config,
      publicPaths: ["/", "/docs"],
    });
    const res = await middleware(new NextRequest("https://myapp.com/docs/guide"));
    expect(res.headers.get("location")).toBeNull();
  });

  it("未认证请求重定向到 authorize 并写入 state/verifier/return cookie", async () => {
    const middleware = createSsoMiddleware(config);
    const res = await middleware(
      new NextRequest("https://myapp.com/dashboard?tab=1")
    );

    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.origin).toBe("https://nihplod.cn");
    expect(location.pathname).toBe("/api/oauth/authorize");
    expect(location.searchParams.get("client_id")).toBe("test-client");
    expect(location.searchParams.get("redirect_uri")).toBe(
      "https://myapp.com/api/auth/callback"
    );
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");
    const state = location.searchParams.get("state");
    expect(state).toBeTruthy();
    const nonce = location.searchParams.get("nonce");
    expect(nonce).toBeTruthy();

    // 瞬态 cookie 以本次 state 为后缀（多标签页隔离）；state cookie 值与 authorize URL 一致
    expect(res.cookies.get(`__Host-nihplod_sso_state_${state}`)?.value).toBe(state);
    // nonce cookie 与 authorize URL 中的 nonce 一致（__Host- httpOnly，与 state 同规格）
    expect(res.cookies.get(`__Host-nihplod_sso_nonce_${state}`)?.value).toBe(nonce);
    // PKCE verifier cookie（httpOnly，供 callback 使用）
    expect(res.cookies.get(`__Secure-nihplod_sso_verifier_${state}`)?.value).toBeTruthy();
    // return URL cookie 记录原始路径
    expect(res.cookies.get(`__Host-nihplod_sso_return_${state}`)?.value).toBe(
      "/dashboard?tab=1"
    );
    // 不再写入固定名称（避免并发登录互相覆盖）
    expect(res.cookies.get("__Host-nihplod_sso_state")).toBeUndefined();
    expect(res.cookies.get("__Secure-nihplod_sso_verifier")).toBeUndefined();
  });

  it("主站会话 Cookie（__Host-user_token）不再参与判定：不发起 introspection，直接重定向登录", async () => {
    // __Host-user_token 是主站内部 token（type="user"），introspect 恒返回 inactive；
    // 且 __Host- Cookie 不下发到子域。该快速通道已移除，会话检测只认本站
    // access_token Cookie（__Host-nihplod_sso_at）。
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      jsonResponse({ active: true })
    );
    const middleware = createSsoMiddleware(config);
    const req = new NextRequest("https://myapp.com/dashboard", {
      headers: { cookie: "__Host-user_token=token-active-1" },
    });
    const res = await middleware(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/api/oauth/authorize");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("本站 access_token Cookie 有效（introspection active）时放行", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      jsonResponse({ active: true })
    );
    const middleware = createSsoMiddleware(config);
    const req = new NextRequest("https://myapp.com/dashboard", {
      headers: { cookie: "__Host-nihplod_sso_at=token-active-1" },
    });
    const res = await middleware(req);
    expect(res.headers.get("location")).toBeNull();
  });

  it("introspection 缓存命中：同一 token 第二次请求不再调用 SSO 中心", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => jsonResponse({ active: true }));
    const middleware = createSsoMiddleware(config);

    const makeReq = () =>
      new NextRequest("https://myapp.com/dashboard", {
        headers: { cookie: "__Host-nihplod_sso_at=token-cache-hit" },
      });

    await middleware(makeReq());
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // 缓存命中：不再发起 introspection 请求
    await middleware(makeReq());
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("introspect 请求携带超时 AbortSignal", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => jsonResponse({ active: true }));
    const middleware = createSsoMiddleware(config);
    const req = new NextRequest("https://myapp.com/dashboard", {
      headers: { cookie: "__Host-nihplod_sso_at=token-timeout-check" },
    });
    await middleware(req);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/api/oauth/introspect"),
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it("introspect 不可达（网络异常）且持有 access token cookie：fail-open 放行并告警一次", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const middleware = createSsoMiddleware(config);
    const req = new NextRequest("https://myapp.com/dashboard", {
      headers: { cookie: "__Host-nihplod_sso_at=token-net-down" },
    });
    const res = await middleware(req);
    // fail-open：不重定向、不清除 cookie（token 可能仍有效，只是 SSO 暂时不可达）
    expect(res.headers.get("location")).toBeNull();
    expect(res.cookies.get("__Host-nihplod_sso_at")).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("fail-open"));
  });

  it("introspect 返回 5xx（未确证 token 无效）：fail-open 放行且不缓存失败结论", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => jsonResponse({}, 500));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const middleware = createSsoMiddleware(config);
    const makeReq = () =>
      new NextRequest("https://myapp.com/dashboard", {
        headers: { cookie: "__Host-nihplod_sso_at=token-5xx" },
      });

    const res = await middleware(makeReq());
    expect(res.headers.get("location")).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("fail-open"));

    // 5xx 结论不缓存：第二次请求重新调用 introspection
    await middleware(makeReq());
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("introspect 确证 token 无效（active:false）：access token cookie 仍被清除并重定向", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      jsonResponse({ active: false })
    );
    const middleware = createSsoMiddleware(config);
    const req = new NextRequest("https://myapp.com/dashboard", {
      headers: { cookie: "__Host-nihplod_sso_at=token-confirmed-inactive" },
    });
    const res = await middleware(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/api/oauth/authorize");
    // 过期/无效的 access token cookie 被立即清除
    expect(res.cookies.get("__Host-nihplod_sso_at")?.value).toBe("");
  });

  it("introspect 不可达但请求无任何 SSO cookie：维持 302 重定向", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    const middleware = createSsoMiddleware(config);
    const res = await middleware(new NextRequest("https://myapp.com/dashboard"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/api/oauth/authorize");
    // 无 cookie 不触发 introspection
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("failClosedOnIntrospectionError=true：introspect 不可达且持有 access token cookie 时返回 502", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const middleware = createSsoMiddleware({
      ...config,
      failClosedOnIntrospectionError: true,
    });
    const req = new NextRequest("https://myapp.com/dashboard", {
      headers: { cookie: "__Host-nihplod_sso_at=token-net-down-fc" },
    });
    const res = await middleware(req);
    // fail-closed：不放行、不重定向登录，返回 502
    expect(res.status).toBe(502);
    expect(res.headers.get("location")).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("fail-closed"));
  });

  it("failClosedOnIntrospectionError=true：introspect 确证 token 无效（active:false）仍清除 cookie 并重定向", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      jsonResponse({ active: false })
    );
    const middleware = createSsoMiddleware({
      ...config,
      failClosedOnIntrospectionError: true,
    });
    const req = new NextRequest("https://myapp.com/dashboard", {
      headers: { cookie: "__Host-nihplod_sso_at=token-fc-inactive" },
    });
    const res = await middleware(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/api/oauth/authorize");
    expect(res.cookies.get("__Host-nihplod_sso_at")?.value).toBe("");
  });

  it("failClosedOnIntrospectionError=true：无 cookie 的请求不受影响，仍重定向登录", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    const middleware = createSsoMiddleware({
      ...config,
      failClosedOnIntrospectionError: true,
    });
    const res = await middleware(new NextRequest("https://myapp.com/dashboard"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/api/oauth/authorize");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("已废弃的 validateSsoCookie / ssoCookieName 配置触发废弃告警", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    createSsoMiddleware({ ...config, validateSsoCookie: false });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("已废弃"));
    warnSpy.mockClear();
    createSsoMiddleware({ ...config, ssoCookieName: "custom_session" });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("已废弃"));
  });

  it("insecureLocalDev=true：Cookie 去除 __Host-/__Secure- 前缀且不设置 Secure", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const middleware = createSsoMiddleware({ ...config, insecureLocalDev: true });
    expect(warnSpy).toHaveBeenCalled();

    const res = await middleware(
      new NextRequest("http://localhost:3002/dashboard")
    );
    expect(res.status).toBe(307);
    const state = new URL(res.headers.get("location")!).searchParams.get("state")!;

    // 前缀已去除，浏览器在 HTTP 下可写入；瞬态 cookie 带 state 后缀
    expect(res.cookies.get(`nihplod_sso_state_${state}`)?.value).toBeTruthy();
    expect(res.cookies.get(`nihplod_sso_nonce_${state}`)?.value).toBeTruthy();
    expect(res.cookies.get(`nihplod_sso_verifier_${state}`)?.value).toBeTruthy();
    expect(res.cookies.get(`nihplod_sso_return_${state}`)?.value).toBe("/dashboard");
    expect(res.cookies.get("__Host-nihplod_sso_state")).toBeUndefined();
    expect(res.cookies.get("__Host-nihplod_sso_nonce")).toBeUndefined();
    // Secure 属性已关闭
    const setCookies =
      typeof res.headers.getSetCookie === "function"
        ? res.headers.getSetCookie()
        : [res.headers.get("set-cookie") ?? ""];
    expect(setCookies.join("\n")).not.toMatch(/;\s*secure\b/i);
  });

  it("insecureLocalDev=true 但生产环境（NODE_ENV=production 且 ssoBaseUrl 为 https）：强制忽略，仍走 secure cookie", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const middleware = createSsoMiddleware({ ...config, insecureLocalDev: true });
    // 告警明确说明开关被忽略
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("已被忽略"));

    const res = await middleware(
      new NextRequest("https://myapp.com/dashboard")
    );
    expect(res.status).toBe(307);
    const state = new URL(res.headers.get("location")!).searchParams.get("state")!;

    // 前缀保留、Secure 仍开启；瞬态 cookie 带 state 后缀
    expect(res.cookies.get(`__Host-nihplod_sso_state_${state}`)?.value).toBeTruthy();
    expect(res.cookies.get(`__Secure-nihplod_sso_verifier_${state}`)?.value).toBeTruthy();
    expect(res.cookies.get("nihplod_sso_state")).toBeUndefined();
    const setCookies =
      typeof res.headers.getSetCookie === "function"
        ? res.headers.getSetCookie()
        : [res.headers.get("set-cookie") ?? ""];
    expect(setCookies.join("\n")).toMatch(/;\s*secure\b/i);
  });

  it("弱配置告警在生产环境同样输出（风险最高处不应静默）", () => {
    vi.stubEnv("NODE_ENV", "production");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    createSsoMiddleware({
      clientId: "test-client",
      // 无 clientSecret + 显式传入已废弃的 validateSsoCookie：两个告警都应在生产环境输出
      ssoBaseUrl: "https://nihplod.cn",
      redirectUri: "https://myapp.com/api/auth/callback",
      validateSsoCookie: false,
    });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("validateSsoCookie / ssoCookieName 已废弃")
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("未配置 clientSecret")
    );
  });

  it("insecureLocalDev=true 且 ssoBaseUrl 为 http（如本地 http SSO）：生产环境也不触发守卫", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const middleware = createSsoMiddleware({
      ...config,
      ssoBaseUrl: "http://localhost:3000",
      insecureLocalDev: true,
    });
    // http 地址不触发生产守卫，走常规开发告警
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("仅限 http://localhost"));

    const res = await middleware(
      new NextRequest("http://localhost:3002/dashboard")
    );
    const state = new URL(res.headers.get("location")!).searchParams.get("state")!;
    expect(res.cookies.get(`nihplod_sso_state_${state}`)?.value).toBeTruthy();
    expect(res.cookies.get("__Host-nihplod_sso_state")).toBeUndefined();
  });
});

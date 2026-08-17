/**
 * next/middleware.ts 测试
 *
 * 覆盖：静态资源放行、未认证重定向 authorize + 写 state/verifier cookie、
 * introspection 缓存命中（同一 token 第二次请求不再调用 SSO 中心）。
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
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

    // state cookie 与 authorize URL 中的 state 一致
    expect(res.cookies.get("__Host-nihplod_sso_state")?.value).toBe(state);
    // PKCE verifier cookie（httpOnly，供 callback 使用）
    expect(res.cookies.get("__Secure-nihplod_sso_verifier")?.value).toBeTruthy();
    // return URL cookie 记录原始路径
    expect(res.cookies.get("__Host-nihplod_sso_return")?.value).toBe(
      "/dashboard?tab=1"
    );
  });

  it("主站 SSO cookie 有效（introspection active）时放行", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      jsonResponse({ active: true })
    );
    const middleware = createSsoMiddleware(config);
    const req = new NextRequest("https://myapp.com/dashboard", {
      headers: { cookie: "__Host-user_token=token-active-1" },
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
        headers: { cookie: "__Host-user_token=token-cache-hit" },
      });

    await middleware(makeReq());
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // 缓存命中：不再发起 introspection 请求
    await middleware(makeReq());
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("introspection 判定 token 无效时重定向到 SSO", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      jsonResponse({ active: false })
    );
    const middleware = createSsoMiddleware(config);
    const req = new NextRequest("https://myapp.com/dashboard", {
      headers: { cookie: "__Host-user_token=token-inactive" },
    });
    const res = await middleware(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/api/oauth/authorize");
  });

  it("insecureLocalDev=true：Cookie 去除 __Host-/__Secure- 前缀且不设置 Secure", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const middleware = createSsoMiddleware({ ...config, insecureLocalDev: true });
    expect(warnSpy).toHaveBeenCalled();

    const res = await middleware(
      new NextRequest("http://localhost:3002/dashboard")
    );
    expect(res.status).toBe(307);

    // 前缀已去除，浏览器在 HTTP 下可写入
    expect(res.cookies.get("nihplod_sso_state")?.value).toBeTruthy();
    expect(res.cookies.get("nihplod_sso_verifier")?.value).toBeTruthy();
    expect(res.cookies.get("nihplod_sso_return")?.value).toBe("/dashboard");
    expect(res.cookies.get("__Host-nihplod_sso_state")).toBeUndefined();
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

    // 前缀保留、Secure 仍开启
    expect(res.cookies.get("__Host-nihplod_sso_state")?.value).toBeTruthy();
    expect(res.cookies.get("__Secure-nihplod_sso_verifier")?.value).toBeTruthy();
    expect(res.cookies.get("nihplod_sso_state")).toBeUndefined();
    const setCookies =
      typeof res.headers.getSetCookie === "function"
        ? res.headers.getSetCookie()
        : [res.headers.get("set-cookie") ?? ""];
    expect(setCookies.join("\n")).toMatch(/;\s*secure\b/i);
  });

  it("insecureLocalDev=true 且 ssoBaseUrl 为 http（如本地 http SSO）：生产环境也不触发守卫", async () => {
    vi.stubEnv("NODE_ENV", "production");
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
    expect(res.cookies.get("nihplod_sso_state")?.value).toBeTruthy();
    expect(res.cookies.get("__Host-nihplod_sso_state")).toBeUndefined();
  });
});

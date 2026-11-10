/**
 * Next.js Refresh Route Handler 测试
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { createRefreshRouteHandler } from "../next/refresh";

const handler = createRefreshRouteHandler({
  clientId: "test-client",
  ssoBaseUrl: "https://nihplod.cn",
  redirectUri: "https://app.example.com/api/auth/callback",
  clientSecret: "secret",
});

function createRequest(cookie?: string, origin = "https://app.example.com"): NextRequest {
  return new NextRequest("https://app.example.com/api/auth/refresh", {
    method: "POST",
    headers: {
      origin,
      ...(cookie ? { cookie } : {}),
    },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createRefreshRouteHandler", () => {
  it("跨站 Origin 返回 403", async () => {
    const res = await handler(createRequest("__Host-nihplod_sso_rt=rt-1", "https://evil.com"));
    expect(res.status).toBe(403);
  });

  it("Origin 与 Sec-Fetch-Site 均缺失时拒绝", async () => {
    const res = await handler(
      new NextRequest("https://app.example.com/api/auth/refresh", { method: "POST" })
    );
    expect(res.status).toBe(403);
  });

  it("缺少 refresh cookie 返回 401", async () => {
    const res = await handler(createRequest());
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("no_refresh_token");
  });

  it("刷新成功时更新 access/refresh cookie，且不向 JS 返回 token", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: "new-at",
          token_type: "Bearer",
          expires_in: 900,
          refresh_token: "new-rt",
          refresh_expires_in: 3600,
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const res = await handler(createRequest("__Host-nihplod_sso_rt=rt-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, expires_in: 900 });
    expect(body).not.toHaveProperty("access_token");

    const cookies = res.headers.getSetCookie();
    expect(cookies.some((c) => c.startsWith("__Host-nihplod_sso_at=new-at"))).toBe(true);
    expect(cookies.some((c) => c.startsWith("__Host-nihplod_sso_rt=new-rt"))).toBe(true);
  });

  it("invalid_grant 时清除认证 cookie", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "invalid_grant", error_description: "expired" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      })
    );

    const res = await handler(createRequest("__Host-nihplod_sso_rt=rt-1"));
    expect(res.status).toBe(401);
    const cookies = res.headers.getSetCookie();
    expect(cookies.some((c) => c.startsWith("__Host-nihplod_sso_at=;"))).toBe(true);
  });
});

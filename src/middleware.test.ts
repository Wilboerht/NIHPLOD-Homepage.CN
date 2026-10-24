/**
 * Next.js middleware 测试
 *
 * 覆盖：
 * - 未登录访问 /admin/** 必须保留 307 重定向（此前 applyCspNonce 会丢弃 redirect）
 * - 普通页面注入 CSP nonce
 * - 专用密钥端点 /api/cron、/api/baidu 直通（由路由校验 CRON_SECRET）
 * - 未知写 API 未登录 → 401；/api/admin/** → 401
 */
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";

describe("middleware", () => {
  it("未登录 GET /admin/** 保留 307 重定向到 /admin-login，并附加 CSP", async () => {
    const res = await middleware(new NextRequest("https://nihplod.cn/admin/users"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/admin-login");
    expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'self'");
    expect(res.headers.get("x-nonce")).toBeTruthy();
  });

  it("未登录访问带 query 的 /admin/** 时保留 query（管理员 SSO authorize 依赖）", async () => {
    const res = await middleware(
      new NextRequest(
        "https://nihplod.cn/admin/sso/authorize?client_id=skin-advisor-admin&state=abc&code_challenge=xyz"
      )
    );

    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).toBeTruthy();
    const redirect = new URL(location!).searchParams.get("redirect");
    expect(redirect).toBe(
      "/admin/sso/authorize?client_id=skin-advisor-admin&state=abc&code_challenge=xyz"
    );
  });

  it("普通页面 GET 返回 next 响应并注入 CSP nonce", async () => {
    const res = await middleware(new NextRequest("https://nihplod.cn/"));

    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(res.headers.get("content-security-policy")).toContain("script-src");
    expect(res.headers.get("x-nonce")).toBeTruthy();
  });

  it("POST /api/cron/run 直通（由路由校验 CRON_SECRET）", async () => {
    const res = await middleware(
      new NextRequest("https://nihplod.cn/api/cron/run", { method: "POST" })
    );

    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(res.status).not.toBe(401);
  });

  it("POST /api/baidu/push 直通", async () => {
    const res = await middleware(
      new NextRequest("https://nihplod.cn/api/baidu/push", { method: "POST" })
    );

    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(res.status).not.toBe(401);
  });

  it("未登录 POST 未知 API 返回 401（Secure by Default）", async () => {
    const res = await middleware(
      new NextRequest("https://nihplod.cn/api/unknown-write", { method: "POST" })
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("未登录访问 /api/admin/** 返回 401", async () => {
    const res = await middleware(
      new NextRequest("https://nihplod.cn/api/admin/users", { method: "GET" })
    );

    expect(res.status).toBe(401);
  });

  it("历史公开简历目录返回 410 且不缓存", async () => {
    const res = await middleware(
      new NextRequest("https://nihplod.cn/uploads/resumes/legacy.pdf")
    );

    expect(res.status).toBe(410);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });
});

import { describe, it, expect } from "vitest";
import { generateCSRFToken, validateCSRFToken } from "@/lib/csrf";
import { NextRequest } from "next/server";

describe("csrf", () => {
  it("应能生成 CSRF token", () => {
    const token = generateCSRFToken();
    expect(token).toBeDefined();
    expect(token.length).toBeGreaterThan(0);
  });

  it("应验证匹配的 CSRF token", () => {
    const token = generateCSRFToken();
    const request = new NextRequest("http://localhost/api/test", {
      headers: { "X-CSRF-Token": token },
    });
    // 手动设置 cookie
    request.cookies.set("__Host-csrf_token", token);

    expect(validateCSRFToken(request)).toBe(true);
  });

  it("应拒绝不匹配的 CSRF token", () => {
    const token1 = generateCSRFToken();
    const token2 = generateCSRFToken();
    const request = new NextRequest("http://localhost/api/test", {
      headers: { "X-CSRF-Token": token1 },
    });
    request.cookies.set("__Host-csrf_token", token2);

    expect(validateCSRFToken(request)).toBe(false);
  });

  it("应拒绝缺少 header 的请求", () => {
    const token = generateCSRFToken();
    const request = new NextRequest("http://localhost/api/test");
    request.cookies.set("__Host-csrf_token", token);

    expect(validateCSRFToken(request)).toBe(false);
  });

  it("应拒绝缺少 cookie 的请求", () => {
    const token = generateCSRFToken();
    const request = new NextRequest("http://localhost/api/test", {
      headers: { "X-CSRF-Token": token },
    });

    expect(validateCSRFToken(request)).toBe(false);
  });
});

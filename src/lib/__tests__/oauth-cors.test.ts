/**
 * OAuth CORS 白名单单元测试
 * src/lib/oauth-cors.ts
 *
 * 覆盖：无 Origin、允许的已注册 origin、未注册 origin、停用 client、缓存命中。
 * 模块级 origin 缓存（10s）通过 vi.resetModules() + 动态 import 隔离。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    oAuthClient: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}));

function createRequest(origin?: string): NextRequest {
  return new NextRequest("https://nihplod.cn/api/oauth/token", {
    headers: origin ? { origin } : {},
  });
}

async function loadCors() {
  vi.resetModules();
  return import("@/lib/oauth-cors");
}

describe("getOAuthCorsHeaders", () => {
  beforeEach(() => {
    mockFindMany.mockReset();
    mockFindMany.mockResolvedValue([
      {
        redirectUris: [
          "https://advisor.nihplod.cn/api/auth/callback",
          "https://mall.nihplod.cn/callback",
        ],
      },
    ]);
  });

  it("无 Origin 头（同源/非浏览器请求）不返回 CORS 头", async () => {
    const { getOAuthCorsHeaders } = await loadCors();
    expect(await getOAuthCorsHeaders(createRequest())).toEqual({});
  });

  it("已注册 redirect_uri 的 origin 返回精确反射的白名单头，且不含 credentials", async () => {
    const { getOAuthCorsHeaders } = await loadCors();
    const headers = await getOAuthCorsHeaders(createRequest("https://advisor.nihplod.cn"));

    expect(headers["Access-Control-Allow-Origin"]).toBe("https://advisor.nihplod.cn");
    expect(headers["Access-Control-Allow-Methods"]).toContain("POST");
    expect(headers["Access-Control-Allow-Headers"]).toContain("DPoP");
    expect(headers.Vary).toBe("Origin");
    // 不含 credentials：浏览器不携带主站 Cookie
    expect(headers["Access-Control-Allow-Credentials"]).toBeUndefined();
  });

  it("未注册的 origin 不返回 CORS 头（浏览器侧拒绝跨域读取）", async () => {
    const { getOAuthCorsHeaders } = await loadCors();
    const headers = await getOAuthCorsHeaders(createRequest("https://evil.com"));
    expect(headers["Access-Control-Allow-Origin"]).toBeUndefined();
  });

  it("端口/协议不同视为不同 origin（精确匹配）", async () => {
    const { getOAuthCorsHeaders } = await loadCors();
    expect(
      (await getOAuthCorsHeaders(createRequest("https://advisor.nihplod.cn:8443")))[
        "Access-Control-Allow-Origin"
      ]
    ).toBeUndefined();
    expect(
      (await getOAuthCorsHeaders(createRequest("http://advisor.nihplod.cn")))[
        "Access-Control-Allow-Origin"
      ]
    ).toBeUndefined();
  });

  it("origin 白名单仅来自 isActive=true 的 client", async () => {
    const { getOAuthCorsHeaders } = await loadCors();
    await getOAuthCorsHeaders(createRequest("https://advisor.nihplod.cn"));

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { isActive: true },
      select: { redirectUris: true },
    });
  });

  it("10s 内命中缓存，不重复查库", async () => {
    const { getOAuthCorsHeaders } = await loadCors();
    await getOAuthCorsHeaders(createRequest("https://advisor.nihplod.cn"));
    await getOAuthCorsHeaders(createRequest("https://mall.nihplod.cn"));

    expect(mockFindMany).toHaveBeenCalledTimes(1);
  });
});

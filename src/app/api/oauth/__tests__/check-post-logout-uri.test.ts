/**
 * GET /api/oauth/check-post-logout-uri 单元测试
 *
 * 覆盖：站内相对路径可信、已注册绝对地址可信、未注册/跨 client 拒绝、
 * 反斜杠与控制字符绕过拒绝、限流。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockFindFirst = vi.fn();
const mockRateLimit = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    oAuthClient: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
    },
  },
}));

vi.mock("@/lib/ratelimit", () => ({
  rateLimit: (...args: unknown[]) => mockRateLimit(...args),
  getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
}));

function createRequest(uri: string, clientId?: string): NextRequest {
  const url = new URL("https://nihplod.cn/api/oauth/check-post-logout-uri");
  url.searchParams.set("post_logout_redirect_uri", uri);
  if (clientId) url.searchParams.set("client_id", clientId);
  return new NextRequest(url);
}

describe("GET /api/oauth/check-post-logout-uri", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimit.mockResolvedValue({ success: true, remaining: 19, reset: 0, limit: 20 });
    mockFindFirst.mockResolvedValue({
      postLogoutRedirectUris: ["https://advisor.nihplod.cn/logged-out"],
    });
  });

  it("站内相对路径返回 trusted=true（不查库）", async () => {
    const { GET } = await import("@/app/api/oauth/check-post-logout-uri/route");
    const res = await GET(createRequest("/logout/done"));
    expect(res.status).toBe(200);
    expect((await res.json()).trusted).toBe(true);
    expect(mockFindFirst).not.toHaveBeenCalled();
  });

  it("已注册的 postLogoutRedirectUri 返回 trusted=true", async () => {
    const { GET } = await import("@/app/api/oauth/check-post-logout-uri/route");
    const res = await GET(
      createRequest("https://advisor.nihplod.cn/logged-out", "advisor-client")
    );
    expect((await res.json()).trusted).toBe(true);
  });

  it("未注册地址/缺少 client_id 返回 trusted=false", async () => {
    const { GET } = await import("@/app/api/oauth/check-post-logout-uri/route");
    expect(
      (await (await GET(createRequest("https://evil.com/x", "advisor-client"))).json()).trusted
    ).toBe(false);
    expect(
      (await (await GET(createRequest("https://advisor.nihplod.cn/logged-out"))).json()).trusted
    ).toBe(false);
  });

  it.each([
    "/\\evil.com",
    "/\n//evil.com",
    "/\t//evil.com",
    "//evil.com",
  ])("开放重定向向量 %j 返回 trusted=false", async (uri) => {
    const { GET } = await import("@/app/api/oauth/check-post-logout-uri/route");
    const res = await GET(createRequest(uri, "advisor-client"));
    expect(res.status).toBe(200);
    expect((await res.json()).trusted).toBe(false);
  });

  it("限流触发返回 429", async () => {
    mockRateLimit.mockResolvedValue({ success: false, remaining: 0, reset: 0, limit: 20 });
    const { GET } = await import("@/app/api/oauth/check-post-logout-uri/route");
    const res = await GET(createRequest("/logout/done"));
    expect(res.status).toBe(429);
  });
});

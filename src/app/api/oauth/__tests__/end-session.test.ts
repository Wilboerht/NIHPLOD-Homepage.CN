/**
 * OIDC RP-Initiated Logout 端点单元测试
 * GET /api/oauth/end-session
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// === Mock post-logout-redirect ===
const mockIsTrusted = vi.fn();
vi.mock("@/lib/post-logout-redirect", () => ({
  isTrustedPostLogoutRedirectUri: (...args: unknown[]) => mockIsTrusted(...args),
}));

// === Mock jwt（verifyIdToken：从 id_token_hint 解析 client_id）===
const mockVerifyIdToken = vi.fn();
vi.mock("@/lib/jwt", () => ({
  verifyIdToken: (...args: unknown[]) => mockVerifyIdToken(...args),
}));

// === Mock ratelimit ===
vi.mock("@/lib/ratelimit", () => ({
  rateLimit: vi.fn().mockResolvedValue({ success: true }),
  getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
}));

// === Mock logger ===
vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { GET } from "../end-session/route";

function createRequest(params: Record<string, string>): NextRequest {
  const url = new URL("http://localhost/api/oauth/end-session");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url.toString());
}

describe("GET /api/oauth/end-session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsTrusted.mockResolvedValue(true);
    mockVerifyIdToken.mockResolvedValue(null);
  });

  it("id_token_hint 经 fragment 透传到 /logout，不进入 query", async () => {
    const res = await GET(
      createRequest({
        client_id: "client-1",
        id_token_hint: "header.payload.signature",
        state: "state-1",
      })
    );
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/logout");
    // 凭证不进入 query（浏览器历史/日志）
    expect(location.searchParams.get("id_token_hint")).toBeNull();
    // 其余参数保持 query 透传
    expect(location.searchParams.get("client_id")).toBe("client-1");
    expect(location.searchParams.get("state")).toBe("state-1");
    // hint 在 fragment 中，由 /logout 页客户端脚本读取
    const fragmentParams = new URLSearchParams(location.hash.slice(1));
    expect(fragmentParams.get("id_token_hint")).toBe("header.payload.signature");
  });

  it("client_id 缺失时从 id_token_hint 的 aud 解析，并用于回跳地址校验", async () => {
    mockVerifyIdToken.mockResolvedValue({ sub: "user-1", aud: "client-from-hint" });
    const res = await GET(
      createRequest({
        id_token_hint: "some-id-token",
        post_logout_redirect_uri: "https://a.com/done",
      })
    );
    expect(res.status).toBe(302);
    expect(mockVerifyIdToken).toHaveBeenCalledWith("some-id-token");
    // 校验回跳地址时绑定解析出的 client_id（不再跨 client 匹配）
    expect(mockIsTrusted).toHaveBeenCalledWith("https://a.com/done", "client-from-hint");
    const location = new URL(res.headers.get("location")!);
    expect(location.searchParams.get("client_id")).toBe("client-from-hint");
    expect(location.searchParams.get("post_logout_redirect_uri")).toBe("https://a.com/done");
  });

  it("显式 client_id 优先于 id_token_hint 的 aud（不再验签解析）", async () => {
    const res = await GET(
      createRequest({
        client_id: "explicit-client",
        id_token_hint: "some-id-token",
        post_logout_redirect_uri: "https://a.com/done",
      })
    );
    expect(res.status).toBe(302);
    expect(mockVerifyIdToken).not.toHaveBeenCalled();
    expect(mockIsTrusted).toHaveBeenCalledWith("https://a.com/done", "explicit-client");
  });

  it("client_id 缺失且 hint 无法解析时拒绝回跳（不透传 post_logout_redirect_uri）", async () => {
    mockVerifyIdToken.mockResolvedValue(null);
    mockIsTrusted.mockResolvedValue(false); // clientId 为 null → 校验函数拒绝
    const res = await GET(
      createRequest({ post_logout_redirect_uri: "https://a.com/done", state: "s" })
    );
    expect(res.status).toBe(302);
    expect(mockIsTrusted).toHaveBeenCalledWith("https://a.com/done", null);
    const location = new URL(res.headers.get("location")!);
    expect(location.searchParams.get("post_logout_redirect_uri")).toBeNull();
    expect(location.searchParams.get("state")).toBe("s");
  });

  it("回跳地址不可信时不透传，仅记录告警", async () => {
    mockIsTrusted.mockResolvedValue(false);
    const res = await GET(
      createRequest({
        client_id: "client-1",
        post_logout_redirect_uri: "https://evil.com/steal",
      })
    );
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("location")!);
    expect(location.searchParams.get("post_logout_redirect_uri")).toBeNull();
  });
});

/**
 * RP-Initiated Logout 返回地址校验单元测试
 * src/lib/post-logout-redirect.ts
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// === Mock Prisma ===
vi.mock("@/lib/prisma", () => ({
  prisma: {
    oAuthClient: {
      findFirst: vi.fn(),
    },
  },
}));

import { isTrustedPostLogoutRedirectUri } from "@/lib/post-logout-redirect";
import { prisma } from "@/lib/prisma";

const mockFindFirst = prisma.oAuthClient.findFirst as ReturnType<typeof vi.fn>;

describe("isTrustedPostLogoutRedirectUri", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("空值或站内相对路径直接信任，不查库", async () => {
    expect(await isTrustedPostLogoutRedirectUri("")).toBe(true);
    expect(await isTrustedPostLogoutRedirectUri("/logout/done")).toBe(true);
    expect(mockFindFirst).not.toHaveBeenCalled();
  });

  it("协议相对的 // 路径不信任", async () => {
    expect(await isTrustedPostLogoutRedirectUri("//evil.com", "client-1")).toBe(false);
  });

  it("client_id 缺失时拒绝绝对 URL 回跳（调用方兜底跳首页）", async () => {
    expect(await isTrustedPostLogoutRedirectUri("https://a.com/done")).toBe(false);
    expect(await isTrustedPostLogoutRedirectUri("https://a.com/done", null)).toBe(false);
    expect(mockFindFirst).not.toHaveBeenCalled();
  });

  it("精确匹配该 client 注册的 postLogoutRedirectUris 时放行", async () => {
    mockFindFirst.mockResolvedValue({
      postLogoutRedirectUris: ["https://a.com/logout-done"],
    });
    expect(await isTrustedPostLogoutRedirectUri("https://a.com/logout-done", "client-1")).toBe(true);
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { clientId: "client-1", isActive: true },
      select: { postLogoutRedirectUris: true },
    });
  });

  it("注册地址的前缀+子路径不再放行（去掉宽松匹配）", async () => {
    mockFindFirst.mockResolvedValue({
      postLogoutRedirectUris: ["https://a.com/app"],
    });
    expect(await isTrustedPostLogoutRedirectUri("https://a.com/app/sub", "client-1")).toBe(false);
    expect(await isTrustedPostLogoutRedirectUri("https://a.com/app-evil", "client-1")).toBe(false);
  });

  it("仅匹配该 client 注册地址：其它 client 注册的 URI 对本 client 不可信（防跨 client 借用）", async () => {
    // client-1 未注册该 URI（它属于 client-2）
    mockFindFirst.mockResolvedValue({
      postLogoutRedirectUris: ["https://a.com/mine"],
    });
    expect(await isTrustedPostLogoutRedirectUri("https://b.com/theirs", "client-1")).toBe(false);
  });

  it("client 不存在或已停用（查不到活跃记录）时拒绝", async () => {
    mockFindFirst.mockResolvedValue(null);
    expect(await isTrustedPostLogoutRedirectUri("https://a.com/logout-done", "gone-client")).toBe(
      false
    );
  });
});

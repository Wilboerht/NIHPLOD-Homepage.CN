/**
 * OAuth 会话级联撤销（登出闭环）单元测试
 * 覆盖：OAuthSession + 该 client refresh token 撤销、携带 sid 的 backchannel 广播、
 *       无活跃会话时的幂等行为
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    oAuthSession: { findMany: vi.fn(), updateMany: vi.fn() },
  },
}));

vi.mock("@/lib/auth-security", () => ({
  revokeRefreshToken: vi.fn().mockResolvedValue(1),
}));

vi.mock("@/lib/backchannel-logout", () => ({
  sendBackchannelLogout: vi.fn().mockResolvedValue(undefined),
}));

import { revokeOAuthClientSessions } from "../oauth-session-revoke";
import { prisma } from "@/lib/prisma";
import { revokeRefreshToken } from "@/lib/auth-security";
import { sendBackchannelLogout } from "@/lib/backchannel-logout";

const mockFindMany = prisma.oAuthSession.findMany as ReturnType<typeof vi.fn>;
const mockUpdateMany = prisma.oAuthSession.updateMany as ReturnType<typeof vi.fn>;
const mockRevokeRefreshToken = revokeRefreshToken as ReturnType<typeof vi.fn>;
const mockSendBackchannel = sendBackchannelLogout as ReturnType<typeof vi.fn>;

describe("revokeOAuthClientSessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindMany.mockResolvedValue([{ sessionId: "sid-1" }]);
    mockUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("撤销该 client 的 OAuthSession 与 refresh token，并携带最新 sid 广播 backchannel logout", async () => {
    const result = await revokeOAuthClientSessions("user-1", "client-1", { reason: "logout" });

    expect(result).toEqual({ sessionCount: 1, latestSid: "sid-1" });
    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        clientId: "client-1",
        revokedAt: null,
        expiresAt: { gt: expect.any(Date) },
      },
      select: { sessionId: true },
      orderBy: { createdAt: "desc" },
    });
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", clientId: "client-1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(mockRevokeRefreshToken).toHaveBeenCalledWith("user-1", undefined, "client-1", "logout");
    expect(mockSendBackchannel).toHaveBeenCalledWith("user-1", ["client-1"], {
      sids: { "client-1": "sid-1" },
    });
  });

  it("无活跃会话时幂等：不广播，仍撤销该 client 的 refresh token（可能残留有效 token）", async () => {
    mockFindMany.mockResolvedValue([]);

    const result = await revokeOAuthClientSessions("user-1", "client-1", { reason: "logout" });

    expect(result).toEqual({ sessionCount: 0, latestSid: null });
    expect(mockSendBackchannel).not.toHaveBeenCalled();
    expect(mockRevokeRefreshToken).toHaveBeenCalledWith("user-1", undefined, "client-1", "logout");
    expect(mockUpdateMany).toHaveBeenCalled();
  });

  it("省略 reason 时按默认口径撤销 refresh token", async () => {
    await revokeOAuthClientSessions("user-1", "client-1");

    expect(mockRevokeRefreshToken).toHaveBeenCalledWith("user-1", undefined, "client-1", undefined);
  });
});

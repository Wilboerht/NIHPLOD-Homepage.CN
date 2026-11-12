/**
 * OAuth 会话级联撤销（登出闭环）单元测试
 * 覆盖：OAuthSession + 该 client refresh token 撤销、携带 sid 的 backchannel 广播、
 *       无活跃会话时的幂等行为
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    oAuthSession: { findMany: vi.fn(), updateMany: vi.fn() },
    refreshToken: { updateMany: vi.fn() },
    oAuthAuthorizationCode: { deleteMany: vi.fn() },
    oAuthClient: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/auth-security", () => ({
  revokeRefreshToken: vi.fn().mockResolvedValue(1),
}));

vi.mock("@/lib/backchannel-logout", () => ({
  enqueueBackchannelLogoutNotifications: vi.fn().mockResolvedValue(1),
  scheduleBackchannelRedelivery: vi.fn(),
}));

import { revokeOAuthClientSessions } from "../oauth-session-revoke";
import { prisma } from "@/lib/prisma";
import { revokeRefreshToken } from "@/lib/auth-security";
import {
  enqueueBackchannelLogoutNotifications,
  scheduleBackchannelRedelivery,
} from "@/lib/backchannel-logout";

const mockFindMany = prisma.oAuthSession.findMany as ReturnType<typeof vi.fn>;
const mockUpdateMany = prisma.oAuthSession.updateMany as ReturnType<typeof vi.fn>;
const mockRefreshTokenUpdateMany = prisma.refreshToken.updateMany as ReturnType<typeof vi.fn>;
const mockCodeDeleteMany = prisma.oAuthAuthorizationCode.deleteMany as ReturnType<typeof vi.fn>;
const mockClientFindUnique = prisma.oAuthClient.findUnique as ReturnType<typeof vi.fn>;
const mockRevokeRefreshToken = revokeRefreshToken as ReturnType<typeof vi.fn>;
const mockEnqueueBackchannel = enqueueBackchannelLogoutNotifications as ReturnType<typeof vi.fn>;
const mockScheduleRedelivery = scheduleBackchannelRedelivery as ReturnType<typeof vi.fn>;

describe("revokeOAuthClientSessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindMany.mockResolvedValue([{ sessionId: "sid-1" }]);
    mockUpdateMany.mockResolvedValue({ count: 1 });
    mockClientFindUnique.mockResolvedValue({
      backchannelLogoutUri: "https://rp.example.com/slo",
    });
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
    expect(mockEnqueueBackchannel).toHaveBeenCalledWith([
      {
        userId: "user-1",
        clientId: "client-1",
        sid: null,
        logoutUri: "https://rp.example.com/slo",
      },
    ]);
    expect(mockScheduleRedelivery).toHaveBeenCalled();
  });

  it("无活跃会话时幂等：不广播，仍撤销该 client 的 refresh token（可能残留有效 token）", async () => {
    mockFindMany.mockResolvedValue([]);

    const result = await revokeOAuthClientSessions("user-1", "client-1", { reason: "logout" });

    expect(result).toEqual({ sessionCount: 0, latestSid: null });
    expect(mockEnqueueBackchannel).not.toHaveBeenCalled();
    expect(mockRevokeRefreshToken).toHaveBeenCalledWith("user-1", undefined, "client-1", "logout");
    expect(mockUpdateMany).toHaveBeenCalled();
  });

  it("指定 sid 时只撤销该会话与该会话的 refresh token，并按 sid 通知 RP", async () => {
    mockRefreshTokenUpdateMany.mockResolvedValue({ count: 1 });

    const result = await revokeOAuthClientSessions("user-1", "client-1", {
      reason: "logout",
      sid: "sid-1",
    });

    expect(result).toEqual({ sessionCount: 1, latestSid: "sid-1" });
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        clientId: "client-1",
        sessionId: "sid-1",
        revokedAt: null,
      },
      data: { revokedAt: expect.any(Date) },
    });
    expect(mockRefreshTokenUpdateMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        clientId: "client-1",
        oauthSessionId: "sid-1",
        revokedAt: null,
      },
      data: { revokedAt: expect.any(Date), revokedReason: "logout" },
    });
    expect(mockRevokeRefreshToken).not.toHaveBeenCalled();
    expect(mockCodeDeleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1", clientId: "client-1", used: false },
    });
    expect(mockEnqueueBackchannel).toHaveBeenCalledWith(
      [
        {
          userId: "user-1",
          clientId: "client-1",
          sid: "sid-1",
          logoutUri: "https://rp.example.com/slo",
        },
      ],
      { perSession: true }
    );
    expect(mockScheduleRedelivery).toHaveBeenCalled();
  });

  it("省略 reason 时按默认口径撤销 refresh token", async () => {
    await revokeOAuthClientSessions("user-1", "client-1");

    expect(mockRevokeRefreshToken).toHaveBeenCalledWith("user-1", undefined, "client-1", undefined);
  });
});

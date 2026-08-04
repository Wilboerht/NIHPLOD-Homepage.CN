import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFindMany = vi.fn();
const mockSignLogoutToken = vi.fn();
const mockRecordSsoEvent = vi.fn();
const globalFetch = vi.fn();

global.fetch = globalFetch as unknown as typeof fetch;

vi.mock("@/lib/prisma", () => ({
  prisma: {
    oAuthClient: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}));

vi.mock("@/lib/jwt", () => ({
  signLogoutToken: (...args: unknown[]) => mockSignLogoutToken(...args),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { warn: vi.fn() },
}));

vi.mock("@/lib/sso-audit", () => ({
  recordSsoEvent: (...args: unknown[]) => mockRecordSsoEvent(...args),
}));

import { sendBackchannelLogout } from "@/lib/backchannel-logout";

describe("backchannel-logout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalFetch.mockResolvedValue({ ok: true });
  });

  it("空 clientIds 时不应查询", async () => {
    await sendBackchannelLogout("user-1", []);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("应只通知配置了 backchannelLogoutUri 的活跃 client", async () => {
    mockFindMany.mockResolvedValue([
      {
        clientId: "client-with-logout",
        backchannelLogoutUri: "https://client.example.com/logout",
      },
    ]);
    mockSignLogoutToken.mockResolvedValue("logout-token-jwt");

    await sendBackchannelLogout("user-1", ["client-with-logout", "client-no-logout"]);

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clientId: { in: ["client-with-logout", "client-no-logout"] },
          isActive: true,
          backchannelLogoutUri: { not: null },
        }),
      })
    );
    expect(mockSignLogoutToken).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: "user-1",
        aud: "client-with-logout",
        events: { "http://schemas.openid.net/event/backchannel-logout": {} },
        jti: expect.any(String),
      })
    );
    expect(globalFetch).toHaveBeenCalledWith(
      "https://client.example.com/logout",
      expect.objectContaining({
        method: "POST",
        body: expect.any(URLSearchParams),
      })
    );
  });

  it("HTTP 通知失败时不应阻塞其他 client", async () => {
    mockFindMany.mockResolvedValue([
      {
        clientId: "client-1",
        backchannelLogoutUri: "https://client.example.com/logout",
      },
    ]);
    mockSignLogoutToken.mockResolvedValue("logout-token-jwt");
    globalFetch.mockRejectedValue(new Error("network error"));

    await expect(sendBackchannelLogout("user-1", ["client-1"])).resolves.not.toThrow();
    expect(globalFetch).toHaveBeenCalled();
  });

  it("includeInactive=true 时应包含停用 client", async () => {
    mockFindMany.mockResolvedValue([
      {
        clientId: "client-inactive",
        backchannelLogoutUri: "https://client.example.com/logout",
      },
    ]);
    mockSignLogoutToken.mockResolvedValue("logout-token-jwt");

    await sendBackchannelLogout("user-1", ["client-inactive"], { includeInactive: true });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({ isActive: true }),
      })
    );
  });
});

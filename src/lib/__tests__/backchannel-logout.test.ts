import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFindMany = vi.fn();
const mockClientFindUnique = vi.fn();
const mockSessionFindMany = vi.fn();
const mockFailureCreate = vi.fn();
const mockFailureFindMany = vi.fn();
const mockFailureDelete = vi.fn();
const mockFailureUpdate = vi.fn();
const mockSignLogoutToken = vi.fn();
const mockRecordSsoEvent = vi.fn();
const globalFetch = vi.fn();

global.fetch = globalFetch as unknown as typeof fetch;

vi.mock("@/lib/prisma", () => ({
  prisma: {
    oAuthClient: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      findUnique: (...args: unknown[]) => mockClientFindUnique(...args),
    },
    oAuthSession: {
      findMany: (...args: unknown[]) => mockSessionFindMany(...args),
    },
    backchannelLogoutFailure: {
      create: (...args: unknown[]) => mockFailureCreate(...args),
      findMany: (...args: unknown[]) => mockFailureFindMany(...args),
      delete: (...args: unknown[]) => mockFailureDelete(...args),
      update: (...args: unknown[]) => mockFailureUpdate(...args),
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

import { sendBackchannelLogout, retryFailedBackchannelLogouts } from "@/lib/backchannel-logout";

describe("backchannel-logout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalFetch.mockResolvedValue({ ok: true });
    mockSessionFindMany.mockResolvedValue([]);
    mockFailureCreate.mockResolvedValue({});
    mockFailureDelete.mockResolvedValue({});
    mockFailureUpdate.mockResolvedValue({});
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
        sid: undefined,
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

  it("RP 返回非 2xx 时应重试、记录失败审计并落库补偿队列", async () => {
    mockFindMany.mockResolvedValue([
      {
        clientId: "client-1",
        backchannelLogoutUri: "https://client.example.com/logout",
      },
    ]);
    mockSignLogoutToken.mockResolvedValue("logout-token-jwt");
    globalFetch.mockResolvedValue({ ok: false, status: 500 });

    await sendBackchannelLogout("user-1", ["client-1"]);

    // 非 2xx 视为投递失败：初次 + 1 次重试
    expect(globalFetch).toHaveBeenCalledTimes(2);
    expect(mockRecordSsoEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "backchannel_logout",
        userId: "user-1",
        clientId: "client-1",
        success: false,
        detail: { reason: "http_500_after_retry" },
      })
    );
    // 同步重试耗尽后落库，等待 cron 周期重投
    expect(mockFailureCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-1",
          clientId: "client-1",
          nextRetryAt: expect.any(Date),
        }),
      })
    );
  });

  it("投递成功时应记录成功审计事件", async () => {
    mockFindMany.mockResolvedValue([
      {
        clientId: "client-1",
        backchannelLogoutUri: "https://client.example.com/logout",
      },
    ]);
    mockSignLogoutToken.mockResolvedValue("logout-token-jwt");
    globalFetch.mockResolvedValue({ ok: true, status: 200 });

    await sendBackchannelLogout("user-1", ["client-1"]);

    expect(globalFetch).toHaveBeenCalledTimes(1);
    expect(mockRecordSsoEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "backchannel_logout",
        userId: "user-1",
        clientId: "client-1",
        success: true,
      })
    );
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

  it("未传 sids 时回库查询活跃 session（含 expiresAt 过滤）并携带 sid", async () => {
    mockFindMany.mockResolvedValue([
      {
        clientId: "client-1",
        backchannelLogoutUri: "https://client.example.com/logout",
      },
    ]);
    mockSessionFindMany.mockResolvedValue([{ clientId: "client-1", sessionId: "sid-123" }]);
    mockSignLogoutToken.mockResolvedValue("logout-token-jwt");

    await sendBackchannelLogout("user-1", ["client-1"]);

    expect(mockSessionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "user-1",
          revokedAt: null,
          expiresAt: { gt: expect.any(Date) },
        }),
      })
    );
    expect(mockSignLogoutToken).toHaveBeenCalledWith(
      expect.objectContaining({ sid: "sid-123" })
    );
  });

  it("调用方传入 sids 时不再回库查询，logout_token 直接携带 sid（撤销路径）", async () => {
    mockFindMany.mockResolvedValue([
      {
        clientId: "client-1",
        backchannelLogoutUri: "https://client.example.com/logout",
      },
    ]);
    mockSignLogoutToken.mockResolvedValue("logout-token-jwt");

    // 模拟"先撤销再通知"的调用点：撤销前查出的 sid 通过 options 传入
    await sendBackchannelLogout("user-1", ["client-1"], { sids: { "client-1": "sid-before-revoke" } });

    expect(mockSessionFindMany).not.toHaveBeenCalled();
    expect(mockSignLogoutToken).toHaveBeenCalledWith(
      expect.objectContaining({ sid: "sid-before-revoke" })
    );
  });
});

describe("retryFailedBackchannelLogouts", () => {
  const failureRecord = {
    id: "failure-1",
    userId: "user-1",
    clientId: "client-1",
    payload: { sid: "sid-123" },
    attempts: 0,
    nextRetryAt: new Date(Date.now() - 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFailureDelete.mockResolvedValue({});
    mockFailureUpdate.mockResolvedValue({});
    mockSignLogoutToken.mockResolvedValue("logout-token-jwt");
  });

  it("重投成功后删除记录并写成功审计", async () => {
    mockFailureFindMany.mockResolvedValue([failureRecord]);
    mockClientFindUnique.mockResolvedValue({
      clientId: "client-1",
      backchannelLogoutUri: "https://client.example.com/logout",
    });
    globalFetch.mockResolvedValue({ ok: true, status: 200 });

    const result = await retryFailedBackchannelLogouts();

    expect(result).toEqual({ delivered: 1, failed: 0, dropped: 0 });
    // 重新签发 token 时携带落库保存的 sid
    expect(mockSignLogoutToken).toHaveBeenCalledWith(
      expect.objectContaining({ sub: "user-1", aud: "client-1", sid: "sid-123" })
    );
    expect(globalFetch).toHaveBeenCalledTimes(1);
    expect(mockFailureDelete).toHaveBeenCalledWith({ where: { id: "failure-1" } });
    expect(mockRecordSsoEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "backchannel_logout",
        success: true,
        detail: expect.objectContaining({ redelivered: true }),
      })
    );
  });

  it("重投失败时 attempts+1 并按指数退避更新 nextRetryAt", async () => {
    mockFailureFindMany.mockResolvedValue([{ ...failureRecord, attempts: 2 }]);
    mockClientFindUnique.mockResolvedValue({
      clientId: "client-1",
      backchannelLogoutUri: "https://client.example.com/logout",
    });
    globalFetch.mockResolvedValue({ ok: false, status: 502 });

    const before = Date.now();
    const result = await retryFailedBackchannelLogouts();

    expect(result).toEqual({ delivered: 0, failed: 1, dropped: 0 });
    const updateCall = mockFailureUpdate.mock.calls[0][0];
    expect(updateCall.where).toEqual({ id: "failure-1" });
    expect(updateCall.data.attempts).toBe(3);
    // 指数退避：1 分钟 * 2^3 = 8 分钟
    const nextRetryAt = updateCall.data.nextRetryAt as Date;
    expect(nextRetryAt.getTime()).toBeGreaterThanOrEqual(before + 8 * 60 * 1000 - 1000);
    expect(nextRetryAt.getTime()).toBeLessThanOrEqual(Date.now() + 8 * 60 * 1000 + 1000);
    expect(mockFailureDelete).not.toHaveBeenCalled();
  });

  it("超过重投上限时删除记录并写失败审计", async () => {
    mockFailureFindMany.mockResolvedValue([{ ...failureRecord, attempts: 9 }]);
    mockClientFindUnique.mockResolvedValue({
      clientId: "client-1",
      backchannelLogoutUri: "https://client.example.com/logout",
    });
    globalFetch.mockRejectedValue(new Error("network error"));

    const result = await retryFailedBackchannelLogouts();

    expect(result).toEqual({ delivered: 0, failed: 0, dropped: 1 });
    expect(mockFailureDelete).toHaveBeenCalledWith({ where: { id: "failure-1" } });
    expect(mockRecordSsoEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "backchannel_logout",
        success: false,
        detail: expect.objectContaining({ reason: "max_retries_exceeded", attempts: 10 }),
      })
    );
  });

  it("client 已删除或未配置 URI 时直接丢弃记录", async () => {
    mockFailureFindMany.mockResolvedValue([failureRecord]);
    mockClientFindUnique.mockResolvedValue(null);

    const result = await retryFailedBackchannelLogouts();

    expect(result).toEqual({ delivered: 0, failed: 0, dropped: 1 });
    expect(globalFetch).not.toHaveBeenCalled();
    expect(mockFailureDelete).toHaveBeenCalledWith({ where: { id: "failure-1" } });
  });

  it("只取 nextRetryAt 已到期且未超上限的记录", async () => {
    mockFailureFindMany.mockResolvedValue([]);

    await retryFailedBackchannelLogouts();

    expect(mockFailureFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          nextRetryAt: { lte: expect.any(Date) },
          attempts: { lt: 10 },
        },
      })
    );
  });
});

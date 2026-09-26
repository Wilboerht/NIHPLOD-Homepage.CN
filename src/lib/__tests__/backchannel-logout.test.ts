import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFindMany = vi.fn();
const mockClientFindUnique = vi.fn();
const mockSessionFindMany = vi.fn();
const mockFailureCreate = vi.fn();
const mockFailureCreateMany = vi.fn();
const mockFailureFindMany = vi.fn();
const mockFailureDelete = vi.fn();
const mockFailureUpdate = vi.fn();
const mockFailureUpdateMany = vi.fn();
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
      createMany: (...args: unknown[]) => mockFailureCreateMany(...args),
      findMany: (...args: unknown[]) => mockFailureFindMany(...args),
      delete: (...args: unknown[]) => mockFailureDelete(...args),
      update: (...args: unknown[]) => mockFailureUpdate(...args),
      updateMany: (...args: unknown[]) => mockFailureUpdateMany(...args),
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

import {
  sendBackchannelLogout,
  retryFailedBackchannelLogouts,
  enqueueBackchannelLogoutNotifications,
  enqueueBackchannelLogoutForActiveSessions,
} from "@/lib/backchannel-logout";

describe("backchannel-logout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalFetch.mockResolvedValue({ ok: true });
    mockSessionFindMany.mockResolvedValue([]);
    mockFailureCreate.mockResolvedValue({});
    mockFailureCreateMany.mockResolvedValue({ count: 1 });
    mockFailureDelete.mockResolvedValue({});
    mockFailureUpdate.mockResolvedValue({});
    // 乐观锁认领默认成功（单实例语义），多实例竞争场景单独覆盖
    mockFailureUpdateMany.mockResolvedValue({ count: 1 });
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
    // 乐观锁认领默认成功（单实例语义），多实例竞争场景单独覆盖
    mockFailureUpdateMany.mockResolvedValue({ count: 1 });
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

  it("client 已删除但 payload 带 URI 快照时仍投递（级联删除场景）", async () => {
    mockFailureFindMany.mockResolvedValue([
      {
        ...failureRecord,
        payload: { sid: "sid-123", logoutUri: "https://deleted-client.example.com/slo" },
      },
    ]);
    mockClientFindUnique.mockResolvedValue(null);
    globalFetch.mockResolvedValue({ ok: true, status: 200 });

    const result = await retryFailedBackchannelLogouts();

    expect(result).toEqual({ delivered: 1, failed: 0, dropped: 0 });
    expect(globalFetch).toHaveBeenCalledWith(
      "https://deleted-client.example.com/slo",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("client 仍存在但 URI 已被清空时丢弃记录（管理员止损语义）", async () => {
    mockFailureFindMany.mockResolvedValue([
      {
        ...failureRecord,
        payload: { sid: "sid-123", logoutUri: "https://snapshot.example.com/slo" },
      },
    ]);
    mockClientFindUnique.mockResolvedValue({
      clientId: "client-1",
      backchannelLogoutUri: null,
    });

    const result = await retryFailedBackchannelLogouts();

    expect(result).toEqual({ delivered: 0, failed: 0, dropped: 1 });
    expect(globalFetch).not.toHaveBeenCalled();
    expect(mockFailureDelete).toHaveBeenCalledWith({ where: { id: "failure-1" } });
  });

  it("乐观锁认领失败（其他实例已接管）时跳过该记录", async () => {
    mockFailureFindMany.mockResolvedValue([failureRecord]);
    mockFailureUpdateMany.mockResolvedValue({ count: 0 });

    const result = await retryFailedBackchannelLogouts();

    expect(result).toEqual({ delivered: 0, failed: 0, dropped: 0 });
    expect(mockClientFindUnique).not.toHaveBeenCalled();
    expect(globalFetch).not.toHaveBeenCalled();
    expect(mockFailureDelete).not.toHaveBeenCalled();
    // 认领请求必须携带原 nextRetryAt 作为乐观锁条件
    expect(mockFailureUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "failure-1", nextRetryAt: failureRecord.nextRetryAt },
      })
    );
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

  describe("enqueueBackchannelLogoutNotifications", () => {
    it("按 user+client 去重后批量入队，nextRetryAt 立即到期", async () => {
      const count = await enqueueBackchannelLogoutNotifications([
        { userId: "user-1", clientId: "client-a", sid: "sid-1" },
        { userId: "user-1", clientId: "client-a", sid: "sid-2" },
        { userId: "user-1", clientId: "client-b", sid: "sid-3" },
      ]);

      expect(count).toBe(2);
      expect(mockFailureCreateMany).toHaveBeenCalledTimes(1);
      const arg = mockFailureCreateMany.mock.calls[0][0] as {
        data: { userId: string; clientId: string; payload: { sid: string | null } }[];
      };
      expect(arg.data).toHaveLength(2);
      expect(arg.data[0]).toMatchObject({
        userId: "user-1",
        clientId: "client-a",
        payload: { sid: "sid-1" },
      });
      expect(arg.data[1]).toMatchObject({ clientId: "client-b", payload: { sid: "sid-3" } });
    });

    it("空列表不写库", async () => {
      expect(await enqueueBackchannelLogoutNotifications([])).toBe(0);
      expect(mockFailureCreateMany).not.toHaveBeenCalled();
    });
  });

  describe("enqueueBackchannelLogoutForActiveSessions", () => {
    const clientUriA = "https://rp-a.example.com/slo";
    const clientUriB = "https://rp-b.example.com/slo";

    it("分页扫描活跃会话并入队（payload 带 URI 快照），返回会话数与去重通知数", async () => {
      mockFindMany.mockResolvedValue([
        { clientId: "client-a", backchannelLogoutUri: clientUriA },
        { clientId: "client-b", backchannelLogoutUri: clientUriB },
      ]);
      mockSessionFindMany
        .mockResolvedValueOnce([
          { id: "s1", userId: "user-1", clientId: "client-a", sessionId: "sid-1" },
          { id: "s2", userId: "user-1", clientId: "client-a", sessionId: "sid-2" },
        ])
        .mockResolvedValueOnce([
          { id: "s3", userId: "user-1", clientId: "client-b", sessionId: "sid-3" },
        ]);

      const result = await enqueueBackchannelLogoutForActiveSessions({
        clientId: "client-a",
        pageSize: 2,
      });

      expect(result).toEqual({ sessionCount: 3, userClientCount: 2 });
      expect(mockSessionFindMany).toHaveBeenCalledTimes(2);
      // 第二页必须带 cursor（分页，避免一次性全量读入内存）
      expect(mockSessionFindMany.mock.calls[1][0]).toMatchObject({
        cursor: { id: "s2" },
        skip: 1,
      });
      // URI 快照随 payload 落库：client 删除后仍可投递
      expect(mockFailureCreateMany).toHaveBeenCalledTimes(2);
      const firstBatch = mockFailureCreateMany.mock.calls[0][0] as {
        data: { payload: { sid: string | null; logoutUri: string | null } }[];
      };
      expect(firstBatch.data[0].payload).toEqual({ sid: "sid-1", logoutUri: clientUriA });
      const secondBatch = mockFailureCreateMany.mock.calls[1][0] as {
        data: { payload: { logoutUri: string | null } }[];
      };
      expect(secondBatch.data[0].payload.logoutUri).toBe(clientUriB);
    });

    it("未配置 backchannelLogoutUri 的 client 不入队", async () => {
      mockFindMany.mockResolvedValue([]);
      mockSessionFindMany.mockResolvedValue([
        { id: "s1", userId: "user-1", clientId: "client-no-uri", sessionId: "sid-1" },
      ]);

      const result = await enqueueBackchannelLogoutForActiveSessions({});

      expect(result).toEqual({ sessionCount: 0, userClientCount: 0 });
      expect(mockSessionFindMany).not.toHaveBeenCalled();
      expect(mockFailureCreateMany).not.toHaveBeenCalled();
    });

    it("无活跃会话时不入队", async () => {
      mockFindMany.mockResolvedValue([
        { clientId: "client-a", backchannelLogoutUri: clientUriA },
      ]);
      mockSessionFindMany.mockResolvedValue([]);

      const result = await enqueueBackchannelLogoutForActiveSessions({ clientId: "client-a" });

      expect(result).toEqual({ sessionCount: 0, userClientCount: 0 });
      expect(mockFailureCreateMany).not.toHaveBeenCalled();
    });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockConsentFindMany = vi.fn();
const mockConsentFindUnique = vi.fn();
const mockUserFindUnique = vi.fn();
const mockClientFindMany = vi.fn();
const mockClientFindUnique = vi.fn();
const mockFailureCreate = vi.fn();
const mockFailureFindMany = vi.fn();
const mockFailureDelete = vi.fn();
const mockFailureUpdate = vi.fn();
const mockFailureUpdateMany = vi.fn();
const mockSignProfileEventToken = vi.fn();
const mockRecordSsoEvent = vi.fn();
const globalFetch = vi.fn();

global.fetch = globalFetch as unknown as typeof fetch;

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
    },
    userConsent: {
      findMany: (...args: unknown[]) => mockConsentFindMany(...args),
      findUnique: (...args: unknown[]) => mockConsentFindUnique(...args),
    },
    oAuthClient: {
      findMany: (...args: unknown[]) => mockClientFindMany(...args),
      findUnique: (...args: unknown[]) => mockClientFindUnique(...args),
    },
    webhookDeliveryFailure: {
      create: (...args: unknown[]) => mockFailureCreate(...args),
      findMany: (...args: unknown[]) => mockFailureFindMany(...args),
      delete: (...args: unknown[]) => mockFailureDelete(...args),
      update: (...args: unknown[]) => mockFailureUpdate(...args),
      updateMany: (...args: unknown[]) => mockFailureUpdateMany(...args),
    },
  },
}));

vi.mock("@/lib/jwt", () => ({
  signProfileEventToken: (...args: unknown[]) => mockSignProfileEventToken(...args),
  // backchannel-logout.ts 在模块顶层引用 signLogoutToken，mock 需保留该导出
  signLogoutToken: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { warn: vi.fn() },
}));

vi.mock("@/lib/sso-audit", () => ({
  recordSsoEvent: (...args: unknown[]) => mockRecordSsoEvent(...args),
}));

import {
  sendProfileUpdateWebhook,
  retryFailedWebhookDeliveries,
  PROFILE_UPDATE_EVENT_URI,
} from "@/lib/profile-webhook";

const PROFILE = {
  nickname: "新昵称",
  avatar: "https://cdn.example.com/a.png",
  birthday: null,
  gender: "female" as const,
};

describe("profile-webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalFetch.mockResolvedValue({ ok: true });
    mockFailureCreate.mockResolvedValue({});
    mockFailureDelete.mockResolvedValue({});
    mockFailureUpdate.mockResolvedValue({});
    // 乐观锁认领默认成功（单实例语义），多实例竞争场景单独覆盖
    mockFailureUpdateMany.mockResolvedValue({ count: 1 });
    // 重投前置检查默认通过：用户 ACTIVE、consent 未撤销
    mockUserFindUnique.mockResolvedValue({ status: "ACTIVE" });
    mockConsentFindUnique.mockResolvedValue({ revokedAt: null });
  });

  it("用户无任何有效授权时不查询 client、不投递", async () => {
    mockConsentFindMany.mockResolvedValue([]);

    await sendProfileUpdateWebhook("user-1", PROFILE);

    expect(mockClientFindMany).not.toHaveBeenCalled();
    expect(globalFetch).not.toHaveBeenCalled();
  });

  it("仅投递给该用户已授权且配置了 webhookUri 的活跃 client", async () => {
    // user-1 授权过 client-a（配 webhook）、client-b（未配 webhook，由 DB where 过滤）
    mockConsentFindMany.mockResolvedValue([
      { clientId: "client-a", scopes: ["profile", "birthday"] },
      { clientId: "client-b", scopes: ["profile"] },
    ]);
    mockClientFindMany.mockResolvedValue([
      { clientId: "client-a", webhookUri: "https://a.example.com/webhook" },
    ]);
    mockSignProfileEventToken.mockResolvedValue("event-token-jwt");

    await sendProfileUpdateWebhook("user-1", PROFILE);

    // consent 查询限定未撤销授权
    expect(mockConsentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1", revokedAt: null },
      })
    );
    // client 查询限定已授权 + 活跃 + 已配置 webhookUri
    expect(mockClientFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clientId: { in: ["client-a", "client-b"] },
          isActive: true,
          webhookUri: { not: null },
        }),
      })
    );
    // 事件 token 载荷：sub/aud/events/jti/profile
    expect(mockSignProfileEventToken).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: "user-1",
        aud: "client-a",
        events: { [PROFILE_UPDATE_EVENT_URI]: {} },
        jti: expect.any(String),
        profile: PROFILE,
      })
    );
    expect(globalFetch).toHaveBeenCalledTimes(1);
    expect(globalFetch).toHaveBeenCalledWith(
      "https://a.example.com/webhook",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_token: "event-token-jwt" }),
      })
    );
  });

  it("仅授权 openid 的 client：不投递任何资料字段、不落失败队列", async () => {
    mockConsentFindMany.mockResolvedValue([{ clientId: "client-a", scopes: ["openid"] }]);
    mockClientFindMany.mockResolvedValue([
      { clientId: "client-a", webhookUri: "https://a.example.com/webhook" },
    ]);

    await sendProfileUpdateWebhook("user-1", PROFILE);

    expect(mockSignProfileEventToken).not.toHaveBeenCalled();
    expect(globalFetch).not.toHaveBeenCalled();
    expect(mockFailureCreate).not.toHaveBeenCalled();
  });

  it("仅 birthday scope：只投递 birthday，昵称/头像/性别置 null", async () => {
    mockConsentFindMany.mockResolvedValue([{ clientId: "client-a", scopes: ["birthday"] }]);
    mockClientFindMany.mockResolvedValue([
      { clientId: "client-a", webhookUri: "https://a.example.com/webhook" },
    ]);
    mockSignProfileEventToken.mockResolvedValue("event-token-jwt");

    const profileWithBirthday = { ...PROFILE, birthday: "1990-01-01T00:00:00.000Z" };
    await sendProfileUpdateWebhook("user-1", profileWithBirthday);

    expect(mockSignProfileEventToken).toHaveBeenCalledWith(
      expect.objectContaining({
        profile: {
          nickname: null,
          avatar: null,
          gender: null,
          birthday: "1990-01-01T00:00:00.000Z",
        },
      })
    );
  });

  it("仅 membership scope：投递 membership，profile 为全 null 占位", async () => {
    mockConsentFindMany.mockResolvedValue([{ clientId: "client-a", scopes: ["membership"] }]);
    mockClientFindMany.mockResolvedValue([
      { clientId: "client-a", webhookUri: "https://a.example.com/webhook" },
    ]);
    mockSignProfileEventToken.mockResolvedValue("event-token-jwt");

    await sendProfileUpdateWebhook("user-1", PROFILE, { level: "GOLD", totalSpent: 1000 });

    expect(mockSignProfileEventToken).toHaveBeenCalledWith(
      expect.objectContaining({
        profile: { nickname: null, avatar: null, gender: null, birthday: null },
        membership: { level: "GOLD", totalSpent: 1000 },
      })
    );
  });

  it("有 profile 但未授权 membership：membership 不随事件投递", async () => {
    mockConsentFindMany.mockResolvedValue([{ clientId: "client-a", scopes: ["profile"] }]);
    mockClientFindMany.mockResolvedValue([
      { clientId: "client-a", webhookUri: "https://a.example.com/webhook" },
    ]);
    mockSignProfileEventToken.mockResolvedValue("event-token-jwt");

    await sendProfileUpdateWebhook("user-1", PROFILE, { level: "GOLD", totalSpent: 1000 });

    const callArg = mockSignProfileEventToken.mock.calls[0][0] as Record<string, unknown>;
    expect(callArg.membership).toBeUndefined();
    expect(callArg.profile).toMatchObject({
      nickname: PROFILE.nickname,
      avatar: PROFILE.avatar,
      gender: PROFILE.gender,
      birthday: null,
    });
  });

  it("RP 返回非 2xx 时应重试、记录失败审计并落库补偿队列", async () => {
    mockConsentFindMany.mockResolvedValue([
      { clientId: "client-a", scopes: ["profile", "birthday", "membership"] },
    ]);
    mockClientFindMany.mockResolvedValue([
      { clientId: "client-a", webhookUri: "https://a.example.com/webhook" },
    ]);
    mockSignProfileEventToken.mockResolvedValue("event-token-jwt");
    globalFetch.mockResolvedValue({ ok: false, status: 500 });

    await sendProfileUpdateWebhook("user-1", PROFILE);

    // 非 2xx 视为投递失败：初次 + 1 次重试
    expect(globalFetch).toHaveBeenCalledTimes(2);
    expect(mockRecordSsoEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "profile_webhook",
        userId: "user-1",
        clientId: "client-a",
        success: false,
        detail: { reason: "http_500_after_retry" },
      })
    );
    // 同步重试耗尽后落库，等待 cron 周期重投
    expect(mockFailureCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-1",
          clientId: "client-a",
          payload: { event: "profile_update", profile: PROFILE },
          nextRetryAt: expect.any(Date),
        }),
      })
    );
  });

  it("投递成功时应记录成功审计事件且不落库", async () => {
    mockConsentFindMany.mockResolvedValue([
      { clientId: "client-a", scopes: ["profile", "birthday", "membership"] },
    ]);
    mockClientFindMany.mockResolvedValue([
      { clientId: "client-a", webhookUri: "https://a.example.com/webhook" },
    ]);
    mockSignProfileEventToken.mockResolvedValue("event-token-jwt");
    globalFetch.mockResolvedValue({ ok: true, status: 200 });

    await sendProfileUpdateWebhook("user-1", PROFILE);

    expect(globalFetch).toHaveBeenCalledTimes(1);
    expect(mockRecordSsoEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "profile_webhook",
        userId: "user-1",
        clientId: "client-a",
        success: true,
      })
    );
    expect(mockFailureCreate).not.toHaveBeenCalled();
  });

  it("webhookUri 为私网地址时不投递", async () => {
    mockConsentFindMany.mockResolvedValue([
      { clientId: "client-a", scopes: ["profile", "birthday", "membership"] },
    ]);
    mockClientFindMany.mockResolvedValue([
      { clientId: "client-a", webhookUri: "https://192.168.1.10/webhook" },
    ]);

    await sendProfileUpdateWebhook("user-1", PROFILE);

    expect(globalFetch).not.toHaveBeenCalled();
    expect(mockSignProfileEventToken).not.toHaveBeenCalled();
  });

  it("携带 membership 时透传进事件 token 与失败落库 payload", async () => {
    mockConsentFindMany.mockResolvedValue([
      { clientId: "client-a", scopes: ["profile", "birthday", "membership"] },
    ]);
    mockClientFindMany.mockResolvedValue([
      { clientId: "client-a", webhookUri: "https://a.example.com/webhook" },
    ]);
    mockSignProfileEventToken.mockResolvedValue("event-token-jwt");
    globalFetch.mockResolvedValue({ ok: false, status: 500 });

    const membership = { level: "SILVER", totalSpent: 2500 };
    await sendProfileUpdateWebhook("user-1", PROFILE, membership);

    // 事件 token 载荷携带 membership
    expect(mockSignProfileEventToken).toHaveBeenCalledWith(
      expect.objectContaining({ sub: "user-1", aud: "client-a", profile: PROFILE, membership })
    );
    // 失败落库 payload 补存 membership，供 cron 重投时读回
    expect(mockFailureCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          payload: { event: "profile_update", profile: PROFILE, membership },
        }),
      })
    );
  });

  it("不传 membership 时事件 token 与落库 payload 均不含该字段", async () => {
    mockConsentFindMany.mockResolvedValue([
      { clientId: "client-a", scopes: ["profile", "birthday", "membership"] },
    ]);
    mockClientFindMany.mockResolvedValue([
      { clientId: "client-a", webhookUri: "https://a.example.com/webhook" },
    ]);
    mockSignProfileEventToken.mockResolvedValue("event-token-jwt");
    globalFetch.mockResolvedValue({ ok: false, status: 500 });

    await sendProfileUpdateWebhook("user-1", PROFILE);

    const signPayload = mockSignProfileEventToken.mock.calls[0][0];
    expect("membership" in signPayload).toBe(false);
    expect(mockFailureCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          payload: { event: "profile_update", profile: PROFILE },
        }),
      })
    );
  });
});

describe("retryFailedWebhookDeliveries", () => {
  const failureRecord = {
    id: "failure-1",
    userId: "user-1",
    clientId: "client-a",
    payload: { event: "profile_update", profile: PROFILE },
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
    mockSignProfileEventToken.mockResolvedValue("event-token-jwt");
  });

  it("重投成功后删除记录并写成功审计", async () => {
    mockFailureFindMany.mockResolvedValue([failureRecord]);
    mockClientFindUnique.mockResolvedValue({
      clientId: "client-a",
      webhookUri: "https://a.example.com/webhook",
    });
    globalFetch.mockResolvedValue({ ok: true, status: 200 });

    const result = await retryFailedWebhookDeliveries();

    expect(result).toEqual({ delivered: 1, failed: 0, dropped: 0 });
    // 重新签发 token 时携带落库保存的资料快照
    expect(mockSignProfileEventToken).toHaveBeenCalledWith(
      expect.objectContaining({ sub: "user-1", aud: "client-a", profile: PROFILE })
    );
    expect(globalFetch).toHaveBeenCalledTimes(1);
    expect(mockFailureDelete).toHaveBeenCalledWith({ where: { id: "failure-1" } });
    expect(mockRecordSsoEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "profile_webhook",
        success: true,
        detail: expect.objectContaining({ redelivered: true }),
      })
    );
  });

  it("重投时从落库 payload 读回 membership 一并重新签发", async () => {
    const membership = { level: "GOLD", totalSpent: 5200 };
    mockFailureFindMany.mockResolvedValue([
      { ...failureRecord, payload: { event: "profile_update", profile: PROFILE, membership } },
    ]);
    mockClientFindUnique.mockResolvedValue({
      clientId: "client-a",
      webhookUri: "https://a.example.com/webhook",
    });
    globalFetch.mockResolvedValue({ ok: true, status: 200 });

    const result = await retryFailedWebhookDeliveries();

    expect(result).toEqual({ delivered: 1, failed: 0, dropped: 0 });
    expect(mockSignProfileEventToken).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: "user-1",
        aud: "client-a",
        profile: PROFILE,
        membership,
      })
    );
  });

  it("落库 payload 无 membership 字段（旧记录）时重投不携带该字段", async () => {
    mockFailureFindMany.mockResolvedValue([failureRecord]);
    mockClientFindUnique.mockResolvedValue({
      clientId: "client-a",
      webhookUri: "https://a.example.com/webhook",
    });
    globalFetch.mockResolvedValue({ ok: true, status: 200 });

    await retryFailedWebhookDeliveries();

    const signPayload = mockSignProfileEventToken.mock.calls[0][0];
    expect("membership" in signPayload).toBe(false);
  });

  it("重投失败时 attempts+1 并按指数退避更新 nextRetryAt", async () => {
    mockFailureFindMany.mockResolvedValue([{ ...failureRecord, attempts: 2 }]);
    mockClientFindUnique.mockResolvedValue({
      clientId: "client-a",
      webhookUri: "https://a.example.com/webhook",
    });
    globalFetch.mockResolvedValue({ ok: false, status: 502 });

    const before = Date.now();
    const result = await retryFailedWebhookDeliveries();

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
      clientId: "client-a",
      webhookUri: "https://a.example.com/webhook",
    });
    globalFetch.mockRejectedValue(new Error("network error"));

    const result = await retryFailedWebhookDeliveries();

    expect(result).toEqual({ delivered: 0, failed: 0, dropped: 1 });
    expect(mockFailureDelete).toHaveBeenCalledWith({ where: { id: "failure-1" } });
    expect(mockRecordSsoEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "profile_webhook",
        success: false,
        detail: expect.objectContaining({ reason: "max_retries_exceeded", attempts: 10 }),
      })
    );
  });

  it("client 已删除或未配置 webhookUri 时直接丢弃记录", async () => {
    mockFailureFindMany.mockResolvedValue([failureRecord]);
    mockClientFindUnique.mockResolvedValue(null);

    const result = await retryFailedWebhookDeliveries();

    expect(result).toEqual({ delivered: 0, failed: 0, dropped: 1 });
    expect(globalFetch).not.toHaveBeenCalled();
    expect(mockFailureDelete).toHaveBeenCalledWith({ where: { id: "failure-1" } });
  });

  it("乐观锁认领失败（其他实例已接管）时跳过该记录", async () => {
    mockFailureFindMany.mockResolvedValue([failureRecord]);
    mockFailureUpdateMany.mockResolvedValue({ count: 0 });

    const result = await retryFailedWebhookDeliveries();

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

    await retryFailedWebhookDeliveries();

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

import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  oAuthFindUnique: vi.fn(),
  fetch: vi.fn(),
  record: vi.fn(),
  notify: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    webhookDeliveryFailure: {
      findMany: (...args: unknown[]) => mocks.findMany(...args),
      findUnique: (...args: unknown[]) => mocks.findUnique(...args),
      updateMany: (...args: unknown[]) => mocks.updateMany(...args),
      update: (...args: unknown[]) => mocks.update(...args),
      delete: (...args: unknown[]) => mocks.delete(...args),
    },
    oAuthClient: {
      findUnique: (...args: unknown[]) => mocks.oAuthFindUnique(...args),
    },
  },
}));

vi.mock("@/lib/outbound-http", () => ({
  postPublicHttps: (...args: unknown[]) => mocks.fetch(...args),
}));

vi.mock("@/lib/sso-audit", () => ({
  recordSsoEvent: (...args: unknown[]) => mocks.record(...args),
}));

vi.mock("@/lib/admin-alert", () => ({
  notifyWebhookFailureDrop: (...args: unknown[]) => mocks.notify(...args),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  retryFailedStatusWebhooks,
  retryStatusWebhookFailureById,
} from "@/lib/webhook";

const targetUrl = "https://smart.nihplod.cn/api/auth/status-webhook";

function failure(overrides: Record<string, unknown> = {}) {
  return {
    id: "failure-1",
    userId: "user-1",
    clientId: "smart.nihplod.cn",
    targetUrl,
    payload: { event: "account_status_change", sub: "user-1" },
    attempts: 0,
    nextRetryAt: new Date(0),
    ...overrides,
  };
}

describe("status webhook retry target", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetch.mockResolvedValue({ ok: true, status: 200 });
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.update.mockResolvedValue({});
    mocks.delete.mockResolvedValue({});
  });

  it("优先使用 targetUrl 重投，不再依赖 OAuthClient", async () => {
    mocks.findMany.mockResolvedValue([failure()]);

    const delivered = await retryFailedStatusWebhooks();

    expect(delivered).toBe(1);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.fetch.mock.calls[0][0]).toBe(targetUrl);
    expect(mocks.oAuthFindUnique).not.toHaveBeenCalled();
    expect(mocks.delete).toHaveBeenCalledWith({ where: { id: "failure-1" } });
  });

  it("旧记录没有 targetUrl 时回退查 OAuthClient.webhookUri", async () => {
    mocks.findMany.mockResolvedValue([failure({ targetUrl: null })]);
    mocks.oAuthFindUnique.mockResolvedValue({
      clientId: "advisor",
      name: "Advisor",
      webhookUri: targetUrl,
      isActive: true,
    });

    const delivered = await retryFailedStatusWebhooks();

    expect(delivered).toBe(1);
    expect(mocks.oAuthFindUnique).toHaveBeenCalledWith({
      where: { clientId: "smart.nihplod.cn" },
      select: { clientId: true, name: true, webhookUri: true, isActive: true },
    });
    expect(mocks.fetch.mock.calls[0][0]).toBe(targetUrl);
  });

  it("手动重投同样优先使用 targetUrl", async () => {
    mocks.findUnique.mockResolvedValue(failure());

    const result = await retryStatusWebhookFailureById("failure-1");

    expect(result).toMatchObject({ ok: true, status: "delivered" });
    expect(mocks.fetch.mock.calls[0][0]).toBe(targetUrl);
    expect(mocks.oAuthFindUnique).not.toHaveBeenCalled();
    expect(mocks.delete).toHaveBeenCalledWith({ where: { id: "failure-1" } });
  });
});

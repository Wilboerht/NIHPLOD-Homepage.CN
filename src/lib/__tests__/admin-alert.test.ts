/**
 * 管理端系统告警测试：定时任务失败、Webhook 放弃、队列积压、安全事件。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

const prismaMock = vi.hoisted(() => {
  const state = new Map<string, { lastSentAt: Date; lastCount: number }>();
  return {
    state,
    auditAlertState: {
      findUnique: vi.fn(async ({ where }: { where: { ruleKey: string } }) => {
        const row = state.get(where.ruleKey);
        return row ? { ruleKey: where.ruleKey, ...row } : null;
      }),
      upsert: vi.fn(
        async ({
          where,
          create,
        }: {
          where: { ruleKey: string };
          create: { lastSentAt: Date; lastCount: number };
        }) => {
          state.set(where.ruleKey, {
            lastSentAt: create.lastSentAt,
            lastCount: create.lastCount,
          });
          return { ruleKey: where.ruleKey, ...create };
        }
      ),
    },
    user: { findUnique: vi.fn() },
    webhookDeliveryFailure: { count: vi.fn() },
    backchannelLogoutFailure: { count: vi.fn() },
  };
});
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const mockSend = vi.hoisted(() => vi.fn());
vi.mock("@/lib/wecom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/wecom")>();
  return { ...actual, sendWecomNotification: mockSend };
});

import {
  notifyAccountDeletionFailure,
  notifyCronFailure,
  notifyRefreshTokenReuse,
  notifyWebhookFailureDrop,
  scanWebhookFailureQueues,
} from "@/lib/admin-alert";

describe("admin-alert", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.state.clear();
    mockSend.mockResolvedValue({ success: true });
    prismaMock.webhookDeliveryFailure.count.mockResolvedValue(0);
    prismaMock.backchannelLogoutFailure.count.mockResolvedValue(0);
  });

  it("手动触发的定时任务失败不发通知", async () => {
    notifyCronFailure("Test Task", "manual", "boom");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("cron 触发的定时任务失败发送综合管理群告警", async () => {
    notifyCronFailure("Test Task", "cron", "boom");

    await vi.waitFor(() => expect(mockSend).toHaveBeenCalledTimes(1));
    expect(mockSend.mock.calls[0][1]).toBe("admin");
    const content = mockSend.mock.calls[0][0] as string;
    expect(content).toContain("## 定时任务失败");
    expect(content).toContain("Test Task");
    expect(content).toContain("boom");
  });

  it("Webhook 重试耗尽发送放弃告警", async () => {
    notifyWebhookFailureDrop({
      kind: "profile_update",
      clientId: "client-1",
      userId: "user-1",
      attempts: 10,
      error: "http_500",
    });

    await vi.waitFor(() => expect(mockSend).toHaveBeenCalledTimes(1));
    expect(mockSend.mock.calls[0][1]).toBe("admin");
    const content = mockSend.mock.calls[0][0] as string;
    expect(content).toContain("## Webhook 投递已放弃");
    expect(content).toContain("client-1");
    expect(content).toContain("10 次");
  });

  it("失败队列非空时发送堆积告警", async () => {
    prismaMock.webhookDeliveryFailure.count.mockResolvedValueOnce(4).mockResolvedValueOnce(1);
    prismaMock.backchannelLogoutFailure.count.mockResolvedValueOnce(2).mockResolvedValueOnce(0);

    await scanWebhookFailureQueues();

    await vi.waitFor(() => expect(mockSend).toHaveBeenCalledTimes(1));
    const content = mockSend.mock.calls[0][0] as string;
    expect(content).toContain("## Webhook 投递失败堆积");
    expect(content).toContain("4 条");
    expect(content).toContain("2 条");
  });

  it("注销失败达到上限时发送脱敏用户告警", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ nickname: null, phone: "13800138000" });

    notifyAccountDeletionFailure({
      requestId: "req-1",
      userId: "user-1",
      attempts: 5,
      error: "subsite purge failed",
    });

    await vi.waitFor(() => expect(mockSend).toHaveBeenCalledTimes(1));
    const content = mockSend.mock.calls[0][0] as string;
    expect(content).toContain("## 账号注销执行失败");
    expect(content).toContain("138****8000");
    expect(content).toContain("5 次");
  });

  it("Refresh Token 重用发送脱敏安全告警", async () => {
    notifyRefreshTokenReuse({
      userId: "user-1",
      phone: "13800138000",
      reason: "revoked",
      ip: "1.2.3.4",
      channel: "web",
    });

    await vi.waitFor(() => expect(mockSend).toHaveBeenCalledTimes(1));
    const content = mockSend.mock.calls[0][0] as string;
    expect(content).toContain("## 检测到 Refresh Token 重用");
    expect(content).toContain("138****8000");
    expect(content).toContain("1.2.3.*");
  });
});

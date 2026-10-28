/**
 * 告警基础设施测试：冷却去重、异步发送、重复告警抑制。
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
  };
});
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const mockSend = vi.hoisted(() => vi.fn());
vi.mock("@/lib/wecom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/wecom")>();
  return { ...actual, sendWecomNotification: mockSend };
});

import { claimAlert, notifyWithCooldown } from "@/lib/alert-notify";

describe("alert-notify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.state.clear();
    mockSend.mockResolvedValue({ success: true });
  });

  it("冷却期内同一 ruleKey 只 claim 成功一次", async () => {
    const now = new Date("2026-10-28T00:00:00Z");
    expect(await claimAlert("test-key", 1, 60_000, now)).toBe(true);
    expect(await claimAlert("test-key", 1, 60_000, new Date(now.getTime() + 30_000))).toBe(false);
    expect(await claimAlert("test-key", 1, 60_000, new Date(now.getTime() + 61_000))).toBe(true);
  });

  it("notifyWithCooldown 首次发送，冷却期内不重复发送", async () => {
    notifyWithCooldown({
      ruleKey: "cron-failure:test",
      count: 1,
      cooldownMs: 60_000,
      type: "admin",
      title: "定时任务失败",
      lines: ["- 任务：test"],
    });

    await vi.waitFor(() => expect(mockSend).toHaveBeenCalledTimes(1));
    expect(mockSend.mock.calls[0][1]).toBe("admin");
    expect(mockSend.mock.calls[0][0]).toContain("## 定时任务失败");

    notifyWithCooldown({
      ruleKey: "cron-failure:test",
      count: 1,
      cooldownMs: 60_000,
      type: "admin",
      title: "定时任务失败",
      lines: ["- 任务：test"],
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockSend).toHaveBeenCalledTimes(1);
  });
});

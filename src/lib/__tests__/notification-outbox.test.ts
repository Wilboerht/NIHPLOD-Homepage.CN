import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreate = vi.fn();
const mockUpdateMany = vi.fn();
const mockQueryRaw = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    notificationOutbox: {
      create: (...args: unknown[]) => mockCreate(...args),
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
  },
}));

const mockDispatch = vi.fn();
vi.mock("@/lib/notification-adapters", () => ({
  dispatchNotificationOutbox: (...args: unknown[]) => mockDispatch(...args),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

import {
  discardNotificationOutbox,
  enqueueNotification,
  processNotificationOutbox,
  requeueNotificationOutbox,
} from "@/lib/notification-outbox";

describe("notification outbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockResolvedValue({ id: "outbox-1" });
    mockUpdateMany.mockResolvedValue({ count: 1 });
    mockQueryRaw.mockResolvedValue([]);
    mockDispatch.mockResolvedValue({ ok: true });
  });

  it("enqueue 写入唯一幂等键", async () => {
    const id = await enqueueNotification({
      idempotencyKey: "event:1:sms",
      channel: "SMS",
      eventType: "test",
      payload: { a: 1 },
      userId: "user-1",
      recipient: { phone: "13800138000" },
    });

    expect(id).toBe("outbox-1");
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          idempotencyKey: "event:1:sms",
          channel: "SMS",
        }),
      })
    );
  });

  it("claim 后发送成功标记 SENT", async () => {
    mockQueryRaw.mockResolvedValue([
      {
        id: "outbox-1",
        channel: "SMS",
        eventType: "test",
        userId: "user-1",
        recipient: { phone: "13800138000" },
        templateKey: "test",
        payload: { a: 1 },
        attempts: 1,
        maxAttempts: 6,
      },
    ]);

    const stats = await processNotificationOutbox({ limit: 10 });

    expect(stats).toMatchObject({ claimed: 1, sent: 1 });
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "outbox-1", status: "SENDING" }),
        data: expect.objectContaining({ status: "SENT" }),
      })
    );
  });

  it("重试后仍失败则回到 PENDING 并设置下次时间", async () => {
    mockQueryRaw.mockResolvedValue([
      {
        id: "outbox-1",
        channel: "SMS",
        eventType: "test",
        userId: "user-1",
        recipient: { phone: "13800138000" },
        templateKey: "test",
        payload: {},
        attempts: 2,
        maxAttempts: 6,
      },
    ]);
    mockDispatch.mockResolvedValue({ ok: false, retryable: true, error: "network" });

    const stats = await processNotificationOutbox({ limit: 10 });

    expect(stats).toMatchObject({ claimed: 1, retried: 1 });
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "PENDING",
          nextAttemptAt: expect.any(Date),
        }),
      })
    );
  });

  it("重试/丢弃只允许终态", async () => {
    await expect(requeueNotificationOutbox("outbox-1")).resolves.toBe(true);
    await expect(discardNotificationOutbox("outbox-1")).resolves.toBe(true);
    expect(mockUpdateMany).toHaveBeenCalledTimes(2);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
  },
}));

import prisma from "@/lib/prisma";
import { acquireCronLock, startCronLockHeartbeat } from "@/lib/cron-lock";

describe("cron-lock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("数据库异常时拒绝无锁执行", async () => {
    vi.mocked(prisma.$queryRaw).mockRejectedValue(new Error("db down"));

    await expect(acquireCronLock("task")).rejects.toThrow("db down");
  });

  it("按 owner 续租，锁被抢占后标记丢失并停止", async () => {
    vi.useFakeTimers();
    vi.mocked(prisma.$executeRaw).mockResolvedValue(1);
    const heartbeat = startCronLockHeartbeat("task", "owner", 3000);

    await vi.advanceTimersByTimeAsync(1000);
    expect(prisma.$executeRaw).toHaveBeenCalled();

    vi.mocked(prisma.$executeRaw).mockResolvedValue(0);
    await vi.advanceTimersByTimeAsync(1000);
    await heartbeat.stop();
    expect(heartbeat.hasLostLock()).toBe(true);
  });
});

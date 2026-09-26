import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { rateLimit, dualRateLimit } from "@/lib/ratelimit";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
    rateLimitRecord: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

describe("rateLimit", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("应在限制内允许请求", async () => {
    const result = await rateLimit("ip-1", "default", { maxRequests: 3, windowMs: 60000 });
    expect(result.success).toBe(true);
  });

  it("超过限制后应拒绝请求", async () => {
    const options = { maxRequests: 2, windowMs: 60000 };

    await rateLimit("ip-2", "default", options);
    await rateLimit("ip-2", "default", options);
    const result = await rateLimit("ip-2", "default", options);

    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("不同标识符应独立计数", async () => {
    const options = { maxRequests: 1, windowMs: 60000 };

    await rateLimit("ip-a", "default", options);
    const result = await rateLimit("ip-b", "default", options);

    expect(result.success).toBe(true);
  });

  it("数据库模式应在限制内允许请求（原子 upsert 返回计数）", async () => {
    process.env.RATE_LIMIT_STORAGE = "database";
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ count: 1 }] as never);

    const result = await rateLimit("ip-db-1", "default", { maxRequests: 3, windowMs: 60000 });
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(2);
    expect(prisma.$queryRaw).toHaveBeenCalled();
  });

  it("数据库模式应拒绝超过限制的请求", async () => {
    process.env.RATE_LIMIT_STORAGE = "database";
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ count: 4 }] as never);

    const result = await rateLimit("ip-db-2", "default", { maxRequests: 3, windowMs: 60000 });
    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("数据库模式：并发自增累计后超额即拒绝（原子计数）", async () => {
    process.env.RATE_LIMIT_STORAGE = "database";
    let counter = 0;
    vi.mocked(prisma.$queryRaw).mockImplementation((async () => {
      counter += 1;
      return [{ count: counter }];
    }) as never);

    const options = { maxRequests: 3, windowMs: 60000 };
    const results = [];
    for (let i = 0; i < 5; i++) {
      results.push(await rateLimit("ip-db-3", "default", options));
    }

    expect(results.map((r) => r.success)).toEqual([true, true, true, false, false]);
  });

  it("数据库异常时降级内存限流（仍按限制判定）", async () => {
    process.env.RATE_LIMIT_STORAGE = "database";
    vi.mocked(prisma.$queryRaw).mockRejectedValue(new Error("db down") as never);

    const options = { maxRequests: 1, windowMs: 60000 };
    const first = await rateLimit("ip-db-fallback", "default", options);
    const second = await rateLimit("ip-db-fallback", "default", options);

    expect(first.success).toBe(true);
    expect(second.success).toBe(false);
  });
});

describe("dualRateLimit", () => {
  it("应同时检查 IP 和用户级限制", async () => {
    // 使用 chat / chat-user 预设，maxRequests 分别为 10 和 15，这里不会触发限制
    const first = await dualRateLimit("ip-3", "user-1");
    expect(first.success).toBe(true);
    expect(first.limitedBy).toBeNull();
  });
});

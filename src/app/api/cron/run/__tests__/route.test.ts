/**
 * POST /api/cron/run 测试：鉴权、advisory lock 并发保护、任务结果映射
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const mockQueryRaw = vi.fn();
const mockRunCleanupCronTasks = vi.fn();
const mockRunCronTask = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) =>
      cb({ $queryRaw: (...args: unknown[]) => mockQueryRaw(...args) })
    ),
  },
}));

vi.mock("@/lib/cron-tasks", () => ({
  runCleanupCronTasks: (...args: unknown[]) => mockRunCleanupCronTasks(...args),
  runCronTask: (...args: unknown[]) => mockRunCronTask(...args),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

import { POST } from "@/app/api/cron/run/route";

const SECRET = "test-cron-secret-1234567890abcdef";

function createRequest(options?: { body?: string; auth?: string }): NextRequest {
  return new NextRequest(new URL("/api/cron/run", "http://localhost:3000"), {
    method: "POST",
    headers: {
      ...(options?.auth ? { authorization: options.auth } : {}),
      "Content-Type": "application/json",
    },
    body: options?.body,
  } as never);
}

describe("POST /api/cron/run", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CRON_SECRET", SECRET);
    mockQueryRaw.mockResolvedValue([{ locked: true }]);
    mockRunCleanupCronTasks.mockResolvedValue([{ taskName: "t1", ok: true }]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("未配置 CRON_SECRET 返回 500", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const res = await POST(createRequest({ auth: `Bearer ${SECRET}` }));
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe("CRON_SECRET_NOT_CONFIGURED");
  });

  it("未授权返回 401", async () => {
    const res = await POST(createRequest({ auth: "Bearer wrong-secret" }));
    expect(res.status).toBe(401);
    expect(mockRunCleanupCronTasks).not.toHaveBeenCalled();
  });

  it("拿到锁：依次执行全部清理任务并返回 200", async () => {
    const res = await POST(createRequest({ auth: `Bearer ${SECRET}` }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
    expect(mockRunCleanupCronTasks).toHaveBeenCalledTimes(1);
  });

  it("未拿到锁（其他实例执行中）返回 409 且不执行任务", async () => {
    mockQueryRaw.mockResolvedValue([{ locked: false }]);

    const res = await POST(createRequest({ auth: `Bearer ${SECRET}` }));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error.code).toBe("ALREADY_RUNNING");
    expect(mockRunCleanupCronTasks).not.toHaveBeenCalled();
  });

  it("指定任务：不存在返回 404，失败返回 500", async () => {
    mockRunCronTask.mockResolvedValueOnce({ ok: false, error: "任务不存在" });
    let res = await POST(
      createRequest({ auth: `Bearer ${SECRET}`, body: JSON.stringify({ taskName: "nope" }) })
    );
    expect(res.status).toBe(404);

    mockRunCronTask.mockResolvedValueOnce({ ok: false, error: "boom" });
    res = await POST(
      createRequest({ auth: `Bearer ${SECRET}`, body: JSON.stringify({ taskName: "t1" }) })
    );
    expect(res.status).toBe(500);
    expect(mockQueryRaw).toHaveBeenCalledTimes(2);
  });
});

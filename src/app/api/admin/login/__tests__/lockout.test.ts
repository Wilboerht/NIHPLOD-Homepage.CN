/**
 * 管理员登录账户级锁定窗口测试
 * checkAdminLockout（lib/admin-lockout.ts，供 POST /api/admin/login 使用）
 *
 * 覆盖（锁定窗口 bug 修复）：
 * - 计数窗口至少覆盖锁定周期（30min）：15 分钟前的失败记录仍应计入，
 *   否则 30 分钟锁定最多只生效 15 分钟（失败记录滑出计数窗口后锁定提前解除）
 * - 早于锁定周期的失败记录不计入，不锁定
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => {
  const prisma: Record<string, unknown> = {
    loginAttempt: {
      count: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  };
  return { prisma, default: prisma };
});

vi.mock("@/lib/auth-security", () => ({
  hashIdentifier: (id: string) => `hashed:${id}`,
}));

import { checkAdminLockout } from "@/lib/admin-lockout";
import { prisma } from "@/lib/prisma";

const mockCount = prisma.loginAttempt.count as ReturnType<typeof vi.fn>;
const mockFindFirst = prisma.loginAttempt.findFirst as ReturnType<typeof vi.fn>;

describe("checkAdminLockout 锁定窗口", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("5 次失败发生在 16 分钟前（15min 计数窗口外、30min 锁定周期内）：仍应锁定", async () => {
    mockCount.mockResolvedValue(5);
    // 最近一次失败在 16 分钟前：锁定 30 分钟 → 剩余约 14 分钟
    mockFindFirst.mockResolvedValue({ createdAt: new Date(Date.now() - 16 * 60 * 1000) });

    const result = await checkAdminLockout("admin@test.com");

    expect(result.locked).toBe(true);
    expect(result.remainingMinutes).toBe(14);
    // 计数与最近失败查询的窗口都必须覆盖锁定周期（30 分钟），而非仅 15 分钟
    const expectedWindowStart = Date.now() - 30 * 60 * 1000;
    const countArgs = mockCount.mock.calls[0][0];
    expect(countArgs.where.createdAt.gte.getTime()).toBeGreaterThanOrEqual(
      expectedWindowStart - 1000
    );
    expect(countArgs.where.createdAt.gte.getTime()).toBeLessThanOrEqual(
      expectedWindowStart + 1000
    );
    const findArgs = mockFindFirst.mock.calls[0][0];
    expect(findArgs.where.createdAt.gte.getTime()).toBeGreaterThanOrEqual(
      expectedWindowStart - 1000
    );
  });

  it("失败记录全部早于 30 分钟：不锁定", async () => {
    // 早于锁定周期的失败已滑出有效计数窗口，计数为 0
    mockCount.mockResolvedValue(0);

    const result = await checkAdminLockout("admin@test.com");

    expect(result.locked).toBe(false);
    expect(result.remainingMinutes).toBe(0);
    expect(mockFindFirst).not.toHaveBeenCalled();
  });

  it("窗口内计数达阈值但最近一次失败已超过 30 分钟：锁定已过期，放行", async () => {
    mockCount.mockResolvedValue(5);
    mockFindFirst.mockResolvedValue({ createdAt: new Date(Date.now() - 31 * 60 * 1000) });

    const result = await checkAdminLockout("admin@test.com");

    expect(result.locked).toBe(false);
  });
});

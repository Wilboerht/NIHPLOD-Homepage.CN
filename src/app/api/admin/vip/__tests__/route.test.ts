/**
 * 管理端会员/积分 API 测试
 * POST /api/admin/vip - 手动调整用户积分
 *
 * 覆盖（B2 整改：调分流水记录实际生效增量）：
 * - 扣分被钳制到 0 时，流水记录 effectiveDelta（新余额-旧余额）而非请求值
 * - effectiveDelta 为 0 时仍记录一条 0 增量流水（与外部同步行为一致，保留审计痕迹）
 * - 调分后失效用户资料缓存
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// === Mock Prisma ===
vi.mock("@/lib/prisma", () => {
  const prisma = {
    user: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    pointTransaction: {
      create: vi.fn().mockResolvedValue({}),
    },
    membershipBenefit: {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn(prisma)
  );
  return { prisma, default: prisma };
});

// === Mock auth ===
vi.mock("@/lib/auth", () => ({
  verifyAuth: vi.fn(),
  checkAdminRateLimit: vi.fn().mockResolvedValue(null),
}));

// === Mock CSRF ===
vi.mock("@/lib/csrf", () => ({
  validateCSRFToken: vi.fn().mockReturnValue(true),
  csrfForbiddenResponse: () =>
    NextResponse.json(
      { success: false, error: { code: "CSRF_INVALID", message: "CSRF 验证失败" } },
      { status: 403 }
    ),
}));

// === Mock validation（放宽 cuid 校验，测试用短 id） ===
vi.mock("@/lib/validation", async () => {
  const { z } = await import("zod");
  return { cuidSchema: z.string().min(1) };
});

// === Mock 审计 ===
vi.mock("@/lib/audit", () => ({
  createAuditLog: vi.fn().mockResolvedValue(true),
}));

// === Mock points（验证缓存失效入口被调用） ===
vi.mock("@/lib/points", () => ({
  invalidateProfileCache: vi.fn(),
}));

// === Mock logger ===
vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), log: vi.fn() },
  logError: vi.fn(),
}));

import { POST } from "../route";
import { verifyAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";
import { invalidateProfileCache } from "@/lib/points";

const OWNER = { id: "admin-1", email: "owner@test.com", name: "Owner", role: "owner" };

function createRequest(body: unknown) {
  return new NextRequest("http://localhost/api/admin/vip", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  } as never);
}

describe("POST /api/admin/vip（手动调整积分）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAuth).mockResolvedValue(OWNER as never);
  });

  it("非 owner 角色应返回 403", async () => {
    vi.mocked(verifyAuth).mockResolvedValue({ ...OWNER, role: "admin" } as never);
    const res = await POST(createRequest({ userId: "u1", points: 100, note: "测试" }));
    expect(res.status).toBe(403);
  });

  it("缺少调整原因应返回 400", async () => {
    const res = await POST(createRequest({ userId: "u1", points: 100 }));
    expect(res.status).toBe(400);
  });

  it("扣分被钳制到 0 时流水应记录实际生效增量而非请求值", async () => {
    // 余额 100，请求扣 500 → 新余额 0，effectiveDelta = -100
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "user-1",
      totalPoints: 100,
    });

    const res = await POST(createRequest({ userId: "user-1", points: -500, note: "违规扣回" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.previousPoints).toBe(100);
    expect(data.data.newPoints).toBe(0);
    // 流水记录实际生效增量 -100，保证「流水合计 == 余额」
    expect(prisma.pointTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "user-1", points: -100, type: "ADMIN_ADJUST" }),
      })
    );
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "user-1" }, data: { totalPoints: 0 } })
    );
    // 审计 detail 同时保留请求值与实际生效增量
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({ points: -500, effectiveDelta: -100, newTotal: 0 }),
      })
    );
    // 调分后失效用户资料缓存
    expect(invalidateProfileCache).toHaveBeenCalled();
  });

  it("余额已为 0 再扣分时仍记录一条 0 增量流水（与外部同步行为一致）", async () => {
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "user-1",
      totalPoints: 0,
    });

    const res = await POST(createRequest({ userId: "user-1", points: -100, note: "测试扣回" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.newPoints).toBe(0);
    expect(prisma.pointTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ points: 0, type: "ADMIN_ADJUST" }),
      })
    );
  });

  it("正常加分时流水增量与请求值一致", async () => {
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "user-1",
      totalPoints: 50,
    });

    const res = await POST(createRequest({ userId: "user-1", points: 200, note: "补偿" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.newPoints).toBe(250);
    expect(prisma.pointTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ points: 200, type: "ADMIN_ADJUST" }),
      })
    );
  });

  it("用户不存在应返回 404", async () => {
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await POST(createRequest({ userId: "ghost", points: 100, note: "测试" }));
    expect(res.status).toBe(404);
  });
});

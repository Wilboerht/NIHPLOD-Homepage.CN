/**
 * /api/user/account/deletion 路由测试（账号自助注销申请/查询/撤回）
 * 覆盖：未登录 401、密码错误 403、申请成功与幂等重复提交、撤回成功、
 *       重复撤回/无进行中申请 409、用户级频控 429、查询进行中的申请
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { UserJWTPayload } from "@/types/auth";

const mockUserFindUnique = vi.fn();
const mockDeletionFindUnique = vi.fn();
const mockDeletionCreate = vi.fn();
const mockDeletionUpdate = vi.fn();
const mockDeletionUpdateMany = vi.fn();
const mockPointRedemptionCount = vi.fn();
const mockPointBalanceFindUnique = vi.fn();
const mockRateLimit = vi.fn();
const mockVerifyPassword = vi.fn();
const mockCreateAuditLog = vi.fn();
const mockLogAuthEvent = vi.fn();

// 可变的登录态：null 表示未登录（withUserAuth 返回 401）
let authedUser: UserJWTPayload | null = { id: "user-1", type: "user" } as UserJWTPayload;

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => mockUserFindUnique(...args) },
    accountDeletionRequest: {
      findUnique: (...args: unknown[]) => mockDeletionFindUnique(...args),
      create: (...args: unknown[]) => mockDeletionCreate(...args),
      update: (...args: unknown[]) => mockDeletionUpdate(...args),
      updateMany: (...args: unknown[]) => mockDeletionUpdateMany(...args),
    },
    pointRedemption: { count: (...args: unknown[]) => mockPointRedemptionCount(...args) },
    pointBalance: { findUnique: (...args: unknown[]) => mockPointBalanceFindUnique(...args) },
  },
}));

vi.mock("@/lib/auth", () => ({
  // 跳过真实 JWT/CSRF 校验，按 authedUser 模拟登录态
  withUserAuth:
    (handler: (request: NextRequest, user: UserJWTPayload) => Promise<Response>) =>
    async (request: NextRequest) => {
      if (!authedUser) {
        return NextResponse.json(
          { success: false, error: { code: "UNAUTHORIZED", message: "请先登录" } },
          { status: 401 }
        );
      }
      return handler(request, authedUser);
    },
}));

vi.mock("@/lib/ratelimit", () => ({
  rateLimit: (...args: unknown[]) => mockRateLimit(...args),
  getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@/lib/password", () => ({
  verifyPassword: (...args: unknown[]) => mockVerifyPassword(...args),
}));

vi.mock("@/lib/audit", () => ({
  createAuditLog: (...args: unknown[]) => mockCreateAuditLog(...args),
}));

vi.mock("@/lib/auth-logger", () => ({
  logAuthEvent: (...args: unknown[]) => mockLogAuthEvent(...args),
}));

vi.mock("@/lib/auth-security", () => ({
  hashIdentifier: (s: string) => `hmac-${s}`,
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

import { GET, POST, DELETE } from "@/app/api/user/account/deletion/route";

const activeUser = {
  id: "user-1",
  phone: "13800138000",
  password: "hashed-password",
  status: "ACTIVE",
};

const pendingRequest = {
  id: "req-1",
  userId: "user-1",
  status: "PENDING",
  requestedAt: new Date("2026-09-29T00:00:00Z"),
  scheduledAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
};

function postRequest(body: unknown): NextRequest {
  return new NextRequest(new URL("/api/user/account/deletion", "http://localhost:3000"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  } as never);
}

function deleteRequest(): NextRequest {
  return new NextRequest(new URL("/api/user/account/deletion", "http://localhost:3000"), {
    method: "DELETE",
  } as never);
}

function getRequest(): NextRequest {
  return new NextRequest(new URL("/api/user/account/deletion", "http://localhost:3000"), {
    method: "GET",
  } as never);
}

describe("/api/user/account/deletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authedUser = { id: "user-1", type: "user" } as UserJWTPayload;
    mockRateLimit.mockResolvedValue({ success: true, remaining: 2, reset: 0, limit: 3 });
    mockUserFindUnique.mockResolvedValue(activeUser);
    mockVerifyPassword.mockResolvedValue(true);
    mockDeletionFindUnique.mockResolvedValue(null);
    mockDeletionCreate.mockResolvedValue(pendingRequest);
    mockPointRedemptionCount.mockResolvedValue(0);
    mockPointBalanceFindUnique.mockResolvedValue({ available: 0 });
    mockCreateAuditLog.mockResolvedValue(true);
  });

  describe("POST 提交申请", () => {
    it("未登录返回 401", async () => {
      authedUser = null;
      const res = await POST(postRequest({ password: "Pass1234" }));
      expect(res.status).toBe(401);
      expect(mockDeletionCreate).not.toHaveBeenCalled();
    });

    it("密码错误返回 403，且不落库", async () => {
      mockVerifyPassword.mockResolvedValue(false);
      const res = await POST(postRequest({ password: "WrongPass1" }));
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.code).toBe("PASSWORD_INCORRECT");
      expect(mockDeletionCreate).not.toHaveBeenCalled();
      expect(mockLogAuthEvent).toHaveBeenCalledWith(
        "user_account_deletion_request",
        expect.objectContaining({ success: false, reason: "password_incorrect" })
      );
    });

    it("触发用户级频控返回 429", async () => {
      mockRateLimit.mockResolvedValue({ success: false, remaining: 0, reset: 0, limit: 3 });
      const res = await POST(postRequest({ password: "Pass1234" }));
      expect(res.status).toBe(429);
      expect(mockDeletionCreate).not.toHaveBeenCalled();
    });

    it("申请成功：scheduledAt 为默认冷静期 7 天后，写审计日志", async () => {
      const before = Date.now();
      const res = await POST(postRequest({ password: "Pass1234", reason: "不用了" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.request.status).toBe("PENDING");

      const createArgs = mockDeletionCreate.mock.calls[0][0];
      const scheduledAt = createArgs.data.scheduledAt as Date;
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      expect(scheduledAt.getTime()).toBeGreaterThanOrEqual(before + sevenDays - 1000);
      expect(scheduledAt.getTime()).toBeLessThanOrEqual(Date.now() + sevenDays + 1000);
      // 申请时手机号哈希落库（供执行时清理换绑前号码的衍生数据），不落明文
      expect(createArgs.data.phoneHash).toBe("hmac-13800138000");
      expect(JSON.stringify(createArgs.data)).not.toContain('"13800138000"');

      expect(mockCreateAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: "account_deletion_request", targetType: "user", userId: "user-1" })
      );
      expect(mockLogAuthEvent).toHaveBeenCalledWith(
        "user_account_deletion_request",
        expect.objectContaining({ userId: "user-1", success: true })
      );
    });

    it("幂等：已有 PENDING 申请时返回既有申请，不重复创建", async () => {
      mockDeletionFindUnique.mockResolvedValue(pendingRequest);
      const res = await POST(postRequest({ password: "Pass1234" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.request.status).toBe("PENDING");
      expect(mockDeletionCreate).not.toHaveBeenCalled();
      expect(mockDeletionUpdate).not.toHaveBeenCalled();
    });

    it("存在未履约权益时返回 warnings 提示但不阻断", async () => {
      mockPointRedemptionCount.mockResolvedValue(2);
      mockPointBalanceFindUnique.mockResolvedValue({ available: 100 });
      const res = await POST(postRequest({ password: "Pass1234" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.warnings).toHaveLength(2);
    });

    it("微信占位手机号账号返回明确错误（引导客服注销）", async () => {
      mockUserFindUnique.mockResolvedValue({ ...activeUser, phone: "wx_abc123", password: null });
      const res = await POST(postRequest({}));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe("PLACEHOLDER_ACCOUNT_UNSUPPORTED");
      expect(mockDeletionCreate).not.toHaveBeenCalled();
    });

    it("findUnique→create 竞态（P2002）：回读既有申请幂等返回，不报 500", async () => {
      const { Prisma } = await import("@/generated/prisma/client");
      mockDeletionCreate.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
          code: "P2002",
          clientVersion: "7.9.1",
        })
      );
      // 竞态另一方创建成功的申请
      mockDeletionFindUnique
        .mockResolvedValueOnce(null) // 提交时的幂等检查
        .mockResolvedValueOnce(pendingRequest); // P2002 后回读

      const res = await POST(postRequest({ password: "Pass1234" }));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.request.status).toBe("PENDING");
    });

    it("P2002 竞态回读到 RUNNING：返回 409 注销执行中", async () => {
      const { Prisma } = await import("@/generated/prisma/client");
      mockDeletionCreate.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
          code: "P2002",
          clientVersion: "7.9.1",
        })
      );
      mockDeletionFindUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ ...pendingRequest, status: "RUNNING" });

      const res = await POST(postRequest({ password: "Pass1234" }));

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error.code).toBe("DELETION_IN_PROGRESS");
    });

    it("原位重置历史申请时同步更新 phoneHash", async () => {
      mockDeletionFindUnique.mockResolvedValue({ ...pendingRequest, status: "CANCELLED" });
      mockDeletionUpdate.mockResolvedValue(pendingRequest);

      const res = await POST(postRequest({ password: "Pass1234" }));

      expect(res.status).toBe(200);
      expect(mockDeletionUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "PENDING", phoneHash: "hmac-13800138000" }),
        })
      );
    });
  });

  describe("DELETE 撤回申请", () => {
    it("撤回成功（条件更新命中 PENDING）", async () => {
      mockDeletionUpdateMany.mockResolvedValue({ count: 1 });
      const res = await DELETE(deleteRequest());
      expect(res.status).toBe(200);
      // 撤回走独立的用户级频控桶（不消耗申请额度）
      expect(mockRateLimit).toHaveBeenCalledWith("user:user-1", "account-deletion-cancel");
      expect(mockDeletionUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: "user-1", status: "PENDING" },
          data: expect.objectContaining({ status: "CANCELLED" }),
        })
      );
      expect(mockCreateAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: "account_deletion_cancel", userId: "user-1" })
      );
    });

    it("触发撤回频控返回 429，不执行撤回", async () => {
      mockRateLimit.mockResolvedValue({ success: false, remaining: 0, reset: 0, limit: 5 });
      const res = await DELETE(deleteRequest());
      expect(res.status).toBe(429);
      const body = await res.json();
      expect(body.error.code).toBe("TOO_MANY_REQUESTS");
      expect(mockDeletionUpdateMany).not.toHaveBeenCalled();
    });

    it("重复撤回/无进行中申请返回 409", async () => {
      mockDeletionUpdateMany.mockResolvedValue({ count: 0 });
      const res = await DELETE(deleteRequest());
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error.code).toBe("NO_PENDING_REQUEST");
      expect(mockCreateAuditLog).not.toHaveBeenCalled();
    });
  });

  describe("GET 查询申请状态", () => {
    it("无申请返回 request: null", async () => {
      mockDeletionFindUnique.mockResolvedValue(null);
      const res = await GET(getRequest());
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.request).toBeNull();
    });

    it("进行中的申请返回状态与剩余天数", async () => {
      mockDeletionFindUnique.mockResolvedValue(pendingRequest);
      const res = await GET(getRequest());
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.request.status).toBe("PENDING");
      expect(body.data.request.remainingDays).toBe(7);
    });
  });
});

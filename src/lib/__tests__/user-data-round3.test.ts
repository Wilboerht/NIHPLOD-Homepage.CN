/**
 * 用户系统第三轮修复 · 数据一致性与用户中心测试
 * 覆盖：
 * - addresses POST：条数上限（20）、"清默认→创建"事务化
 * - devices DELETE：越权撤销返回 404、禁止撤销当前会话自身
 * - points：credit/refund 使用原子 increment/decrement（防并发丢失更新）
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createHash } from "crypto";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    address: { count: vi.fn(), create: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
    refreshToken: { findFirst: vi.fn(), update: vi.fn() },
    oAuthSession: { updateMany: vi.fn() },
    pointCampaign: { findMany: vi.fn().mockResolvedValue([]) },
    pointTransaction: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn(prisma)
  );
  return { prisma };
});

vi.mock("@/lib/csrf", () => ({
  validateCSRFToken: vi.fn().mockReturnValue(true),
  csrfForbiddenResponse: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  verifyUserAuth: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/auth-logger", () => ({
  logAuthEvent: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { verifyUserAuth } from "@/lib/auth";
import { creditPointsForOrder, refundPointsForOrder } from "@/lib/points";
import { USER_REFRESH_COOKIE_NAME } from "@/types/auth";
import { POST as addressesPost } from "@/app/api/user/addresses/route";
import { DELETE as deviceDelete } from "@/app/api/user/devices/[id]/route";

const mockVerifyUserAuth = verifyUserAuth as ReturnType<typeof vi.fn>;
const mockAddrCount = prisma.address.count as ReturnType<typeof vi.fn>;
const mockAddrCreate = prisma.address.create as ReturnType<typeof vi.fn>;
const mockAddrUpdateMany = prisma.address.updateMany as ReturnType<typeof vi.fn>;
const mockRtFindFirst = prisma.refreshToken.findFirst as ReturnType<typeof vi.fn>;
const mockUserFindUnique = prisma.user.findUnique as ReturnType<typeof vi.fn>;
const mockUserUpdate = prisma.user.update as ReturnType<typeof vi.fn>;
const mockPtFindFirst = prisma.pointTransaction.findFirst as ReturnType<typeof vi.fn>;
const mockPtFindMany = prisma.pointTransaction.findMany as ReturnType<typeof vi.fn>;
const mockPtCreate = prisma.pointTransaction.create as ReturnType<typeof vi.fn>;

function createJsonRequest(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(new URL(url, "http://localhost:3000"), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  } as never);
}

const addressBody = {
  name: "张三",
  phone: "13800138000",
  province: "北京市",
  city: "北京市",
  district: "朝阳区",
  detail: "某路 1 号",
  isDefault: true,
};

describe("POST /api/user/addresses（第三轮修复）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyUserAuth.mockResolvedValue({ id: "user-1", phone: "13800138000" });
  });

  it("地址数量达到上限（20）应返回 400 且不写入", async () => {
    mockAddrCount.mockResolvedValueOnce(20);

    const res = await addressesPost(createJsonRequest("/api/user/addresses", addressBody));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error.code).toBe("ADDRESS_LIMIT");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("新建默认地址应在事务内先清默认再创建", async () => {
    mockAddrCount.mockResolvedValueOnce(3);
    mockAddrCreate.mockResolvedValueOnce({ id: "addr-new", ...addressBody });

    const res = await addressesPost(createJsonRequest("/api/user/addresses", addressBody));

    expect(res.status).toBe(200);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    // 事务内先清掉其他默认地址，保证唯一默认
    expect(mockAddrUpdateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", isDefault: true },
      data: { isDefault: false },
    });
    expect(mockAddrCreate).toHaveBeenCalled();
  });
});

describe("DELETE /api/user/devices/:id（第三轮修复）", () => {
  const deviceId = "c" + "a".repeat(24);

  function createDeleteRequest(headers: Record<string, string> = {}) {
    return new NextRequest(new URL(`/api/user/devices/${deviceId}`, "http://localhost:3000"), {
      method: "DELETE",
      headers,
    } as never);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyUserAuth.mockResolvedValue({ id: "user-1", phone: "13800138000" });
  });

  it("目标会话不属于当前用户时应返回 404（越权不泄露存在性）", async () => {
    mockRtFindFirst.mockResolvedValueOnce(null);

    const res = await deviceDelete(createDeleteRequest(), {
      params: Promise.resolve({ id: deviceId }),
    } as never);
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error.code).toBe("NOT_FOUND");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("不允许撤销当前会话自身", async () => {
    const currentToken = "current-rt";
    mockRtFindFirst.mockResolvedValueOnce({
      id: deviceId,
      token: createHash("sha256").update(currentToken).digest("hex"),
      clientId: null,
    });

    const res = await deviceDelete(
      createDeleteRequest({ cookie: `${USER_REFRESH_COOKIE_NAME}=${currentToken}` }),
      { params: Promise.resolve({ id: deviceId }) } as never
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error.code).toBe("CURRENT_SESSION");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("积分原子增减（第三轮修复）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.pointCampaign.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  });

  it("creditPointsForOrder 应使用 increment 原子累加积分与消费", async () => {
    mockPtFindFirst.mockResolvedValueOnce(null); // 幂等检查：未发放过
    mockUserFindUnique.mockResolvedValueOnce({
      membershipLevel: "REGULAR",
      totalPoints: 5,
      totalSpent: 100,
      birthday: null,
    });
    mockPtCreate.mockResolvedValueOnce({});
    mockUserUpdate.mockResolvedValueOnce({});

    const result = await creditPointsForOrder({
      tx: prisma as never,
      orderId: "order-1",
      userId: "user-1",
      payAmount: 200,
      orderNo: "NO123",
    });

    expect(result?.points).toBe(20); // 200 / 10
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        totalPoints: { increment: 20 },
        totalSpent: { increment: 200 },
        membershipLevel: expect.any(String),
      },
    });
  });

  it("refundPointsForOrder 应使用 decrement 原子扣回积分与消费", async () => {
    mockPtFindFirst.mockResolvedValueOnce(null); // 幂等检查：未扣回过
    mockPtFindMany.mockResolvedValueOnce([{ points: 20 }]);
    mockUserFindUnique.mockResolvedValueOnce({ totalPoints: 25, totalSpent: 300 });
    mockPtCreate.mockResolvedValueOnce({});
    mockUserUpdate.mockResolvedValueOnce({});

    const result = await refundPointsForOrder({
      tx: prisma as never,
      orderId: "order-1",
      userId: "user-1",
      orderNo: "NO123",
      refundAmount: 200,
    });

    expect(result?.deductedPoints).toBe(20);
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        totalPoints: { decrement: 20 },
        totalSpent: { decrement: 200 },
        membershipLevel: expect.any(String),
      },
    });
  });
});

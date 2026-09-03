/**
 * GET /api/user/points/gifts 路由测试（可兑换产品列表 + 个性化折算 + 兑换记录）
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  withUserAuth:
    (handler: (req: NextRequest, payload: { id: string }) => unknown) =>
    (req: NextRequest) =>
      handler(req, { id: "user-1" }),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/point-gifts", () => ({
  listRedeemableProducts: vi.fn(),
  giftCostForUser: vi.fn(),
}));

vi.mock("@/lib/points-ledger", () => ({
  getPointBalanceView: vi.fn(),
}));

const { txClient } = vi.hoisted(() => ({
  txClient: {
    user: { findUnique: vi.fn() },
    pointRedemption: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (fn: (tx: typeof txClient) => Promise<unknown>) => fn(txClient)),
  },
}));

import { listRedeemableProducts, giftCostForUser } from "@/lib/point-gifts";
import { getPointBalanceView } from "@/lib/points-ledger";
import { Prisma } from "@/generated/prisma/client";
import { GET } from "@/app/api/user/points/gifts/route";

const mockListProducts = listRedeemableProducts as ReturnType<typeof vi.fn>;
const mockCost = giftCostForUser as ReturnType<typeof vi.fn>;
const mockBalance = getPointBalanceView as ReturnType<typeof vi.fn>;

function createRequest(): NextRequest {
  return new NextRequest(new URL("/api/user/points/gifts", "http://localhost:3000"), {
    method: "GET",
  } as never);
}

describe("GET /api/user/points/gifts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    txClient.user.findUnique.mockResolvedValue({ membershipLevel: "GOLD" });
    txClient.pointRedemption.findMany.mockResolvedValue([]);
    mockBalance.mockResolvedValue({ available: 800, frozen: 0, nextReleaseAt: null });
  });

  it("返回可兑换产品与按等级折算的扣分、余额判断", async () => {
    // 余额 300：洁面乳 153 分可兑，精华液 460 分不足
    mockBalance.mockResolvedValue({ available: 300, frozen: 0, nextReleaseAt: null });
    mockListProducts.mockResolvedValue([
      {
        id: "p1",
        name: "洁面乳",
        description: "温和洁面",
        price: new Prisma.Decimal("199.00"),
        images: [{ url: "https://cdn.example.com/cleanser.png" }],
      },
      {
        id: "p2",
        name: "精华液",
        description: "修护精华",
        price: new Prisma.Decimal("599.00"),
        images: [],
      },
    ]);
    // 金卡兑礼率 1.3：⌊199/1.3⌋=153 可兑；⌊599/1.3⌋=460 不足（余额 800 时 460 足够？按断言走）
    mockCost.mockImplementation((price: Prisma.Decimal) => {
      const value = Number(price);
      return value < 300 ? 153 : 460;
    });

    const res = await GET(createRequest());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.membershipLevel).toBe("GOLD");
    expect(data.data.redeemRate).toBe(1.3);
    expect(data.data.available).toBe(300);
    expect(data.data.gifts).toEqual([
      {
        id: "p1",
        name: "洁面乳",
        description: "温和洁面",
        image: "https://cdn.example.com/cleanser.png",
        priceYuan: 199,
        cost: 153,
        affordable: true,
      },
      {
        id: "p2",
        name: "精华液",
        description: "修护精华",
        image: null,
        priceYuan: 599,
        cost: 460,
        affordable: false,
      },
    ]);
  });

  it("返回我的兑换记录（含状态）", async () => {
    mockListProducts.mockResolvedValue([]);
    txClient.pointRedemption.findMany.mockResolvedValue([
      {
        id: "r1",
        productName: "洁面乳",
        priceYuan: new Prisma.Decimal("199.00"),
        points: 153,
        status: "PENDING",
        createdAt: new Date("2026-09-03T10:00:00.000Z"),
      },
    ]);

    const res = await GET(createRequest());
    const data = await res.json();

    expect(data.data.redemptions).toEqual([
      {
        id: "r1",
        productName: "洁面乳",
        priceYuan: 199,
        points: 153,
        status: "PENDING",
        createdAt: "2026-09-03T10:00:00.000Z",
      },
    ]);
  });
});

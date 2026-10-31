/**
 * 管理端企业微信业务通知测试
 * 覆盖：新积分申请（消费补录）/ 新积分兑换申请的消息内容、用户脱敏、
 *       记录不存在时不发送、发送失败不影响主流程。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

const prismaMock = vi.hoisted(() => ({
  spentAdjustmentApplication: { findUnique: vi.fn() },
  pointRedemption: { findUnique: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const mockSend = vi.hoisted(() => vi.fn());
vi.mock("@/lib/wecom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/wecom")>();
  return { ...actual, sendWecomNotification: mockSend };
});

import { notifyNewRedemption, notifyNewSpentApplication } from "@/lib/admin-notify";

describe("admin-notify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSend.mockResolvedValue({ success: true });
  });

  it("新积分申请发送脱敏用户与申请详情", async () => {
    prismaMock.spentAdjustmentApplication.findUnique.mockResolvedValue({
      channel: "TMALL",
      orderNo: "ORDER-1",
      amountClaimed: 1000,
      purchasedAt: new Date("2026-09-01T00:00:00Z"),
      note: "需要*加急*",
      createdAt: new Date("2026-09-02T03:04:05Z"),
      user: { nickname: null, phone: "13800138000" },
    });

    notifyNewSpentApplication("app-1");

    await vi.waitFor(() => expect(mockSend).toHaveBeenCalledTimes(1));
    const content = mockSend.mock.calls[0][0] as string;
    expect(mockSend).toHaveBeenCalledWith(expect.any(String), "points");
    expect(content).toContain("### 积分申请");
    expect(content).toContain("138\\*\\*\\*\\*8000");
    expect(content).toContain("天猫国际");
    expect(content).toContain("ORDER\\-1");
    expect(content).toContain("¥1,000");
    expect(content).toContain("需要\\*加急\\*");
    expect(content).toContain("/admin/spent-adjustments?status=PENDING");
  });

  it("新积分兑换申请发送礼品、扣分与等级", async () => {
    prismaMock.pointRedemption.findUnique.mockResolvedValue({
      productName: "面霜小样",
      points: 230,
      level: "GOLD",
      createdAt: new Date("2026-09-02T03:04:05Z"),
      user: { nickname: "小N", phone: "13800138000" },
    });

    notifyNewRedemption("redemption-1");

    await vi.waitFor(() => expect(mockSend).toHaveBeenCalledTimes(1));
    const content = mockSend.mock.calls[0][0] as string;
    expect(mockSend).toHaveBeenCalledWith(expect.any(String), "redemption");
    expect(content).toContain("### 兑换申请");
    expect(content).toContain("小N");
    expect(content).toContain("面霜小样");
    expect(content).toContain("230");
    expect(content).toContain("金卡会员");
    expect(content).toContain("/admin/point-gifts?status=PENDING");
  });

  it("记录不存在时不发送", async () => {
    prismaMock.spentAdjustmentApplication.findUnique.mockResolvedValue(null);
    prismaMock.pointRedemption.findUnique.mockResolvedValue(null);

    notifyNewSpentApplication("missing");
    notifyNewRedemption("missing");

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("发送失败只记录日志，不抛出异常", async () => {
    prismaMock.pointRedemption.findUnique.mockResolvedValue({
      productName: "面霜小样",
      points: 230,
      level: "GOLD",
      createdAt: new Date(),
      user: { nickname: "小N", phone: "13800138000" },
    });
    mockSend.mockRejectedValue(new Error("network down"));

    expect(() => notifyNewRedemption("redemption-1")).not.toThrow();
    await vi.waitFor(() => expect(mockSend).toHaveBeenCalledTimes(1));
  });
});

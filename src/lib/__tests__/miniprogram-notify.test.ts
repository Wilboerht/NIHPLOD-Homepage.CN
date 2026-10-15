/**
 * 积分小程序订阅消息测试
 * 覆盖：模板未配置跳过、凭证缺失跳过、无身份跳过、多 openid 逐一探测（40003 后命中）、
 *       未订阅（43101）记录后结束、异常静默；发货通知的记录查询与模板数据组装（截断/时间格式）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

const mockIdentityFindMany = vi.fn();
const mockRedemptionFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    externalIdentity: { findMany: (...args: unknown[]) => mockIdentityFindMany(...args) },
    pointRedemption: { findUnique: (...args: unknown[]) => mockRedemptionFindUnique(...args) },
  },
}));

const mockResolveCredentials = vi.fn();
vi.mock("@/lib/miniprogram-clients", () => ({
  resolveMiniprogramCredentials: (...args: unknown[]) => mockResolveCredentials(...args),
}));

const mockSend = vi.fn();
vi.mock("@/lib/wechat", () => ({
  sendMiniprogramSubscribeMessage: (...args: unknown[]) => mockSend(...args),
}));

import {
  notifyPointsRedemptionShipped,
  notifyPointsSpentReview,
} from "@/lib/miniprogram-notify";

const CREDS = { appId: "wx1234567890abcdef", appSecret: "s".repeat(32) };

const ENV_KEYS = ["MP_POINTS_TEMPLATE_SHIPPED", "MP_POINTS_TEMPLATE_SPENT_REVIEW"] as const;
const savedEnv: Record<string, string | undefined> = {};

describe("miniprogram-notify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key];
      process.env[key] = "tmpl-test";
    }
    mockResolveCredentials.mockReturnValue(CREDS);
    mockIdentityFindMany.mockResolvedValue([{ subjectId: "openid-points" }]);
    mockSend.mockResolvedValue({ ok: true, errcode: 0, errmsg: "ok" });
    mockRedemptionFindUnique.mockResolvedValue({
      userId: "user-1",
      productName: "面霜小样",
      fulfilledAt: new Date("2026-10-15T02:30:00.000Z"),
      updatedAt: new Date("2026-10-15T02:30:00.000Z"),
    });
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
  });

  const reviewParams = {
    userId: "user-1",
    orderNo: "TM-20261015001",
    status: "APPROVED" as const,
    reviewAmount: 1200,
  };

  it("模板未配置：不查询身份、不发送", async () => {
    delete process.env.MP_POINTS_TEMPLATE_SPENT_REVIEW;

    await notifyPointsSpentReview(reviewParams);

    expect(mockIdentityFindMany).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("小程序凭证未配置：跳过", async () => {
    mockResolveCredentials.mockReturnValue(null);

    await notifyPointsSpentReview(reviewParams);

    expect(mockIdentityFindMany).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("用户无小程序身份：跳过发送", async () => {
    mockIdentityFindMany.mockResolvedValue([]);

    await notifyPointsSpentReview(reviewParams);

    expect(mockSend).not.toHaveBeenCalled();
  });

  it("多 openid 逐一探测：首枚 40003（不属于该 AppID）后第二枚命中", async () => {
    mockIdentityFindMany.mockResolvedValue([
      { subjectId: "openid-skin" },
      { subjectId: "openid-points" },
    ]);
    mockSend
      .mockResolvedValueOnce({ ok: false, errcode: 40003, errmsg: "invalid openid" })
      .mockResolvedValueOnce({ ok: true, errcode: 0, errmsg: "ok" });

    await notifyPointsSpentReview(reviewParams);

    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(mockSend.mock.calls[1][0]).toMatchObject({ openid: "openid-points" });
  });

  it("用户未订阅（43101）：发送一次后结束且不抛错", async () => {
    mockSend.mockResolvedValue({ ok: false, errcode: 43101, errmsg: "user refuse" });

    await expect(notifyPointsSpentReview(reviewParams)).resolves.toBeUndefined();
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it("身份查询异常：静默吞掉（不 reject）", async () => {
    mockIdentityFindMany.mockRejectedValue(new Error("db down"));

    await expect(notifyPointsSpentReview(reviewParams)).resolves.toBeUndefined();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("审核结果模板数据：结果/说明/订单号按约定组装", async () => {
    await notifyPointsSpentReview({ ...reviewParams, status: "REJECTED", reviewNote: "订单号无法核实，请补充完整截图" });

    const arg = mockSend.mock.calls[0][0] as { data: Record<string, { value: string }>; page: string };
    expect(arg.page).toBe("pages/spent-adjustments/spent-adjustments");
    expect(arg.data.thing1.value).toBe("未通过");
    expect(arg.data.thing2.value.length).toBeLessThanOrEqual(20);
    expect(arg.data.character_string3.value).toBe("TM-20261015001");
  });

  it("发货通知：记录不存在时跳过", async () => {
    mockRedemptionFindUnique.mockResolvedValue(null);

    await notifyPointsRedemptionShipped("rid-1");

    expect(mockSend).not.toHaveBeenCalled();
  });

  it("发货通知：商品名截断与发货时间按 Asia/Shanghai 格式化", async () => {
    mockRedemptionFindUnique.mockResolvedValue({
      userId: "user-1",
      productName: "超长商品名称示例用于验证截断逻辑是否正确执行",
      fulfilledAt: new Date("2026-10-15T02:30:00.000Z"),
      updatedAt: new Date("2026-10-15T02:30:00.000Z"),
    });

    await notifyPointsRedemptionShipped("rid-1");

    const arg = mockSend.mock.calls[0][0] as { data: Record<string, { value: string }> };
    expect(arg.data.thing1.value.length).toBeLessThanOrEqual(20);
    expect(arg.data.thing1.value.endsWith("…")).toBe(true);
    expect(arg.data.phrase2.value).toBe("已发货");
    // UTC 02:30 → Asia/Shanghai 10:30
    expect(arg.data.time3.value).toBe("2026-10-15 10:30");
  });
});

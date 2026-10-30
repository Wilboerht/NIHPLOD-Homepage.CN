/**
 * 代客提交申请人通知测试
 * 短信 / 微信模板 / 小程序订阅消息三通道均被触发，且无申请时静默跳过。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { spentAdjustmentApplication: { findUnique: () => mockFindUnique() } },
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

const mockSendSms = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/sms", () => ({
  sendSpentSubmittedNotification: (...args: unknown[]) => mockSendSms(...args),
}));

const mockSendWechat = vi.fn().mockResolvedValue({ success: true, sent: true });
vi.mock("@/lib/wechat-template", () => ({
  sendSpentAdjustmentSubmittedMessage: (...args: unknown[]) => mockSendWechat(...args),
}));

const mockSendMiniprogram = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/miniprogram-notify", () => ({
  notifyPointsSpentSubmitted: (...args: unknown[]) => mockSendMiniprogram(...args),
}));

vi.mock("next/server", () => ({
  after: (callback: () => void) => callback(),
}));

import { notifySpentApplicationSubmittedByAdmin } from "../spent-adjustment-notify";

describe("notifySpentApplicationSubmittedByAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("申请存在时触发三个通知通道", async () => {
    mockFindUnique.mockResolvedValue({
      orderNo: "ORDER123",
      userId: "user-1",
      user: { phone: "13800138000" },
    });

    notifySpentApplicationSubmittedByAdmin("app-1");

    await vi.waitFor(() => {
      expect(mockSendSms).toHaveBeenCalledWith("13800138000", "ORDER123");
      expect(mockSendWechat).toHaveBeenCalledWith({ userId: "user-1", orderNo: "ORDER123" });
      expect(mockSendMiniprogram).toHaveBeenCalledWith({ userId: "user-1" });
    });
  });

  it("申请不存在时不发送", async () => {
    mockFindUnique.mockResolvedValue(null);

    notifySpentApplicationSubmittedByAdmin("app-missing");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockSendSms).not.toHaveBeenCalled();
    expect(mockSendWechat).not.toHaveBeenCalled();
    expect(mockSendMiniprogram).not.toHaveBeenCalled();
  });
});

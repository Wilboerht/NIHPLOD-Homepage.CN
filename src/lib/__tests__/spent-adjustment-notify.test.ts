/**
 * 代客提交申请人通知测试：写入通知 Outbox 三条渠道记录。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { spentAdjustmentApplication: { findUnique: () => mockFindUnique() } },
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

const mockEnqueue = vi.fn().mockResolvedValue("outbox-1");
vi.mock("@/lib/notification-outbox", () => ({
  enqueueNotification: (...args: unknown[]) => mockEnqueue(...args),
}));

import { notifySpentApplicationSubmittedByAdmin } from "../spent-adjustment-notify";

describe("notifySpentApplicationSubmittedByAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnqueue.mockResolvedValue("outbox-1");
  });

  it("申请存在时写入三个通知渠道", async () => {
    mockFindUnique.mockResolvedValue({
      orderNo: "ORDER123",
      userId: "user-1",
      user: { phone: "13800138000" },
    });

    notifySpentApplicationSubmittedByAdmin("app-1");

    await vi.waitFor(() => {
      expect(mockEnqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: "SMS",
          recipient: { phone: "13800138000" },
          payload: { orderNo: "ORDER123" },
        })
      );
      expect(mockEnqueue).toHaveBeenCalledWith(
        expect.objectContaining({ channel: "WECHAT_TEMPLATE", userId: "user-1" })
      );
      expect(mockEnqueue).toHaveBeenCalledWith(
        expect.objectContaining({ channel: "MINIPROGRAM", userId: "user-1" })
      );
    });
  });

  it("申请不存在时不写通知", async () => {
    mockFindUnique.mockResolvedValue(null);

    notifySpentApplicationSubmittedByAdmin("app-missing");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockEnqueue).not.toHaveBeenCalled();
  });
});

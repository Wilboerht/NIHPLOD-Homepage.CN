/**
 * 复测提醒编排测试
 * 覆盖：子站不可达/空名单不发消息；无效条目过滤；有效用户逐个发送（仅传 userId）
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

const mockAdvisorJson = vi.fn();
vi.mock("@/lib/advisor-internal", () => ({
  advisorJson: (...args: unknown[]) => mockAdvisorJson(...args),
}));

const mockNotify = vi.fn();
vi.mock("@/lib/miniprogram-notify", () => ({
  notifySkinRetestReminder: (...args: unknown[]) => mockNotify(...args),
}));

import { sendRetestReminders } from "@/lib/retest-reminder";

describe("sendRetestReminders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNotify.mockResolvedValue(undefined);
  });

  it("子站不可达（advisorJson 降级 null）：不发消息", async () => {
    mockAdvisorJson.mockResolvedValue(null);

    const result = await sendRetestReminders();

    expect(result).toEqual({ due: 0, attempted: 0 });
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("空名单：不发消息", async () => {
    mockAdvisorJson.mockResolvedValue({ users: [] });

    const result = await sendRetestReminders();

    expect(result).toEqual({ due: 0, attempted: 0 });
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("过滤无效条目后逐个发送（仅传 userId）", async () => {
    mockAdvisorJson.mockResolvedValue({
      users: [
        { userId: "user-1", lastTestAt: "2026-09-16T02:30:00.000Z" },
        { userId: "" },
        { bad: true },
      ],
    });

    const result = await sendRetestReminders();

    expect(result).toEqual({ due: 1, attempted: 1 });
    expect(mockNotify).toHaveBeenCalledWith({ userId: "user-1" });
  });

  it("名单附带 lastTestAt 等额外字段时容错（发送不依赖）", async () => {
    mockAdvisorJson.mockResolvedValue({ users: [{ userId: "user-2", lastTestAt: "x" }] });

    const result = await sendRetestReminders();

    expect(result).toEqual({ due: 1, attempted: 1 });
    expect(mockNotify).toHaveBeenCalledWith({ userId: "user-2" });
  });
});

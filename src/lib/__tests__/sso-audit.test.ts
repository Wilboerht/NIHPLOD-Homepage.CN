import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCreate = vi.fn();
const mockDeleteMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    ssoAuditEvent: {
      create: (...args: unknown[]) => mockCreate(...args),
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { recordSsoEvent, cleanupOldSsoAuditEvents } from "@/lib/sso-audit";

describe("sso-audit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应创建 SSO 审计事件", async () => {
    mockCreate.mockResolvedValue({ id: "event-id" });
    recordSsoEvent({
      event: "userinfo",
      userId: "user-1",
      clientId: "client-1",
      success: true,
      detail: { ip: "127.0.0.1" },
    });
    // 异步写入，等待微任务
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          event: "userinfo",
          userId: "user-1",
          clientId: "client-1",
          success: true,
          detail: { ip: "127.0.0.1" },
        }),
      })
    );
  });

  it("可选字段缺失时仍应正常写入", async () => {
    mockCreate.mockResolvedValue({ id: "event-id" });
    recordSsoEvent({
      event: "logout",
      success: false,
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          event: "logout",
          success: false,
        }),
      })
    );
  });

  it("cleanupOldSsoAuditEvents 应删除 90 天前的记录", async () => {
    mockDeleteMany.mockResolvedValue({ count: 5 });
    const result = await cleanupOldSsoAuditEvents();
    expect(result).toBe(5);
    expect(mockDeleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { createdAt: { lt: expect.any(Date) } },
      })
    );
  });
});

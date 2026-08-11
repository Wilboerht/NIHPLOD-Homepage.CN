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

import { recordSsoEvent, cleanupOldSsoAuditEvents, escapeCSV } from "@/lib/sso-audit";

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

  describe("escapeCSV", () => {
    it("公式注入字符开头应加单引号前缀", () => {
      expect(escapeCSV("=cmd|'/c calc'!A1")).toBe("'=cmd|'/c calc'!A1");
      expect(escapeCSV("+SUM(A1)")).toBe("'+SUM(A1)");
      expect(escapeCSV("@mention")).toBe("'@mention");
    });

    it("以 = 开头且含逗号的单元格不应绕过公式防护", () => {
      // 修复前：先引号包裹使单元格以 " 开头，^[=...] 检测被绕过
      expect(escapeCSV("=1,2")).toBe(`"'=1,2"`);
    });

    it("含逗号的普通值用双引号包裹", () => {
      expect(escapeCSV("a,b")).toBe(`"a,b"`);
    });

    it("双引号应转义为两个双引号", () => {
      expect(escapeCSV('say "hi"')).toBe(`"say ""hi"""`);
    });

    it("普通值不包裹不加前缀", () => {
      expect(escapeCSV("authorize")).toBe("authorize");
    });
  });
});

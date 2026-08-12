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

// === Mock next/server 的 after：默认记录回调不执行；可通过 mockAfterBehavior 模拟非请求场景抛错 ===
const mockAfter = vi.fn();
vi.mock("next/server", () => ({
  after: (task: () => unknown) => mockAfter(task),
}));

import { recordSsoEvent, scheduleSsoEvent, cleanupOldSsoAuditEvents, escapeCSV } from "@/lib/sso-audit";

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

  describe("scheduleSsoEvent", () => {
    it("request scope 内通过 after() 注册回调，回调执行时才写库", async () => {
      mockCreate.mockResolvedValue({ id: "event-id" });
      // 模拟 after：暂存回调（响应返回后由平台执行）
      let registered: (() => unknown) | undefined;
      mockAfter.mockImplementation((task: () => unknown) => {
        registered = task;
      });

      scheduleSsoEvent({ event: "userinfo", userId: "user-1", success: true });

      // after 已注册，但写库尚未发生（等响应返回后执行）
      expect(mockAfter).toHaveBeenCalledTimes(1);
      expect(registered).toBeDefined();
      expect(mockCreate).not.toHaveBeenCalled();

      // 平台执行回调 → 写库
      await registered!();
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ event: "userinfo", userId: "user-1" }),
        })
      );
    });

    it("after() 在非请求场景抛错时降级为直接 fire-and-forget 写库", async () => {
      mockCreate.mockResolvedValue({ id: "event-id" });
      // 模拟 next/server after 在无 request scope 时同步抛错（E468）
      mockAfter.mockImplementation(() => {
        throw new Error("`after` was called outside a request scope.");
      });

      scheduleSsoEvent({ event: "logout", success: false });

      // 降级路径不经 after 回调，直接调 recordSsoEvent
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ event: "logout", success: false }),
        })
      );
    });
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

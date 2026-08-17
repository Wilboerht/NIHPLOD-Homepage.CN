/**
 * SSO 审计日志查询与 CSV 导出路由测试
 * GET /api/admin/oauth/audit
 *
 * 覆盖：
 * - 非 owner 403 / 限流 429
 * - JSON 分页查询：事件类型白名单过滤、success 过滤
 * - CSV 导出：Content-Type / Content-Disposition 响应头
 * - 公式注入防护回归：以 = 开头且含逗号的单元格先加 ' 前缀再用双引号包裹
 * - 双引号转义（""）
 *
 * 注意：escapeCSV 使用 @/lib/sso-audit 真实实现（安全关键函数不接受 mock 替身）。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// ============================================
// vi.hoisted 共享 mock
// ============================================

const { mockVerifyAuth, mockCheckAdminRateLimit, prismaMock } = vi.hoisted(() => {
  const createMockModel = () => ({
    findMany: vi.fn(),
    count: vi.fn(),
  });
  return {
    mockVerifyAuth: vi.fn(),
    mockCheckAdminRateLimit: vi.fn(),
    prismaMock: {
      ssoAuditEvent: createMockModel(),
      user: createMockModel(),
    } as Record<string, Record<string, ReturnType<typeof vi.fn>>>,
  };
});

// ============================================
// Mock 模块
// ============================================

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock, default: prismaMock }));

vi.mock("@/lib/auth", () => ({
  verifyAuth: (...args: unknown[]) => mockVerifyAuth(...args),
  checkAdminRateLimit: (...args: unknown[]) => mockCheckAdminRateLimit(...args),
  verifyUserAuth: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/ratelimit", () => ({
  rateLimit: vi.fn().mockResolvedValue({ success: true, remaining: 99, reset: 99999, limit: 30 }),
  getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn(), log: vi.fn() },
  logError: vi.fn(),
}));

// sso-audit：保留真实 escapeCSV（公式注入防护为安全关键路径），仅 stub 记录函数
vi.mock("@/lib/sso-audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/sso-audit")>();
  return {
    ...actual,
    recordSsoEvent: vi.fn().mockResolvedValue(undefined),
  };
});

// ============================================
// 工具函数
// ============================================

function createRequest(path: string) {
  return new NextRequest(new URL(path, "http://localhost:3000"));
}

const OWNER = { id: "admin-owner-1", email: "owner@test.com", name: "Owner", role: "owner" };

function makeAuditItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt-1",
    event: "token",
    userId: "user-1",
    clientId: "client-abc",
    clientName: "Test App",
    ip: "203.0.113.10",
    success: true,
    createdAt: new Date("2026-08-10T12:00:00Z"),
    ...overrides,
  };
}

// ============================================
// 测试套件
// ============================================

describe("GET /api/admin/oauth/audit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyAuth.mockResolvedValue(OWNER);
    mockCheckAdminRateLimit.mockResolvedValue(null);
    prismaMock.user.findMany.mockResolvedValue([]);
  });

  it("非 owner 角色应返回 403", async () => {
    mockVerifyAuth.mockResolvedValue({ id: "a2", email: "a@t.com", name: "A", role: "admin" });
    const { GET } = await import("@/app/api/admin/oauth/audit/route");
    const res = await GET(createRequest("/api/admin/oauth/audit"));
    expect(res.status).toBe(403);
  });

  it("限流触发应返回 429", async () => {
    mockCheckAdminRateLimit.mockResolvedValue(
      NextResponse.json(
        { success: false, error: { code: "RATE_LIMITED", message: "请求过于频繁" } },
        { status: 429 }
      )
    );
    const { GET } = await import("@/app/api/admin/oauth/audit/route");
    const res = await GET(createRequest("/api/admin/oauth/audit"));
    expect(res.status).toBe(429);
  });

  it("JSON 分页查询：event 白名单内类型进入 where，非法类型返回 400", async () => {
    prismaMock.ssoAuditEvent.findMany.mockResolvedValue([makeAuditItem()]);
    prismaMock.ssoAuditEvent.count.mockResolvedValue(1);

    const { GET } = await import("@/app/api/admin/oauth/audit/route");
    const res = await GET(createRequest("/api/admin/oauth/audit?event=token&success=true"));
    const data = await res.json();

    expect(res.status).toBe(200);
    const where = (prismaMock.ssoAuditEvent.findMany.mock.calls[0][0] as { where: Record<string, unknown> })
      .where;
    expect(where.event).toBe("token");
    expect(where.success).toBe(true);
    expect(data.data.pagination.total).toBe(1);
    expect(data.data.items[0].createdAt).toBe("2026-08-10T12:00:00.000Z");

    // 非法 event 类型返回 400 而非静默忽略，避免筛选条件失效造成误解
    const badRes = await GET(createRequest("/api/admin/oauth/audit?event=evil_type"));
    expect(badRes.status).toBe(400);
    expect((await badRes.json()).error.code).toBe("INVALID_PARAMS");
  });

  it("endDate 为 YYYY-MM-DD 时按次日零点（不含）过滤，包含当天事件", async () => {
    prismaMock.ssoAuditEvent.findMany.mockResolvedValue([]);
    prismaMock.ssoAuditEvent.count.mockResolvedValue(0);

    const { GET } = await import("@/app/api/admin/oauth/audit/route");
    const res = await GET(
      createRequest("/api/admin/oauth/audit?startDate=2026-08-01&endDate=2026-08-10")
    );
    expect(res.status).toBe(200);

    const where = (prismaMock.ssoAuditEvent.findMany.mock.calls[0][0] as {
      where: { createdAt: { gte: Date; lt: Date } };
    }).where;
    expect(where.createdAt.gte).toEqual(new Date("2026-08-01T00:00:00.000Z"));
    expect(where.createdAt.lt).toEqual(new Date("2026-08-11T00:00:00.000Z"));
  });

  it("JSON 分页查询：联表 User 返回脱敏手机号，无关联用户时为 null", async () => {
    prismaMock.ssoAuditEvent.findMany.mockResolvedValue([
      makeAuditItem({ userId: "user-1" }),
      makeAuditItem({ id: "evt-2", userId: null }),
      makeAuditItem({ id: "evt-3", userId: "deleted-user" }),
    ]);
    prismaMock.ssoAuditEvent.count.mockResolvedValue(3);
    prismaMock.user.findMany.mockResolvedValue([
      { id: "user-1", phone: "13812341234" },
    ]);

    const { GET } = await import("@/app/api/admin/oauth/audit/route");
    const res = await GET(createRequest("/api/admin/oauth/audit"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.items[0].userPhone).toBe("138****1234");
    expect(data.data.items[1].userPhone).toBeNull();
    // 已删除用户（联表无记录）同样为 null
    expect(data.data.items[2].userPhone).toBeNull();
    // userId 为空/已删除的记录不应带入口查询条件
    const userQuery = prismaMock.user.findMany.mock.calls[0][0] as {
      where: { id: { in: string[] } };
    };
    expect(userQuery.where.id.in).toEqual(["user-1", "deleted-user"]);
  });

  it("CSV 导出：响应头正确，且以 = 开头含逗号的单元格被加 ' 前缀（公式注入防护）", async () => {
    prismaMock.ssoAuditEvent.findMany.mockResolvedValue([
      makeAuditItem({ clientName: "=HYPERLINK(\"https://evil.com\"),x" }),
    ]);

    const { GET } = await import("@/app/api/admin/oauth/audit/route");
    const res = await GET(createRequest("/api/admin/oauth/audit?export=csv"));

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toMatch(/attachment; filename="sso-audit-\d{4}-\d{2}-\d{2}\.csv"/);

    // BOM 防 Excel 中文乱码（res.text() 的 UTF-8 解码会剥离 BOM，改按字节校验）
    const buf = new Uint8Array(await res.arrayBuffer());
    expect([...buf.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const csv = new TextDecoder("utf-8", { ignoreBOM: true }).decode(buf);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("\uFEFFid,event,userId,clientId,clientName,ip,success,createdAt");
    // 防护顺序：先加 ' 前缀（'=HYPERLINK...），内部双引号转义为 ""，
    // 因含逗号整体再用双引号包裹。绝不允许多行文本中出现裸 = 开头单元格。
    expect(csv).toContain(`"'=HYPERLINK(""https://evil.com""),x"`);
    expect(csv).not.toContain(",=HYPERLINK");
  });

  it("CSV 导出：+、-、@ 开头的单元格同样加 ' 前缀", async () => {
    prismaMock.ssoAuditEvent.findMany.mockResolvedValue([
      makeAuditItem({ id: "evt-plus", clientName: "+cmd", userId: "-2+3", ip: "@evil" }),
    ]);

    const { GET } = await import("@/app/api/admin/oauth/audit/route");
    const res = await GET(createRequest("/api/admin/oauth/audit?export=csv"));
    const csv = await res.text();
    const row = csv.split("\n")[1];

    expect(row).toContain("evt-plus");
    // 各危险前缀单元格均被加 ' 前缀
    expect(row).toContain("'+cmd");
    expect(row).toContain("'-2+3");
    expect(row).toContain("'@evil");
  });

  it("CSV 导出：普通值不加前缀，含逗号的普通值用双引号包裹", async () => {
    prismaMock.ssoAuditEvent.findMany.mockResolvedValue([
      makeAuditItem({ clientName: "App, Inc." }),
    ]);

    const { GET } = await import("@/app/api/admin/oauth/audit/route");
    const res = await GET(createRequest("/api/admin/oauth/audit?export=csv"));
    const csv = await res.text();

    expect(csv).toContain('"App, Inc."');
    expect(csv).not.toContain("'App");
  });

  it("CSV 导出上限 5000 条且不分页", async () => {
    prismaMock.ssoAuditEvent.findMany.mockResolvedValue([]);

    const { GET } = await import("@/app/api/admin/oauth/audit/route");
    await GET(createRequest("/api/admin/oauth/audit?export=csv&page=3"));

    const args = prismaMock.ssoAuditEvent.findMany.mock.calls[0][0] as {
      take: number;
      skip?: number;
    };
    expect(args.take).toBe(5000);
    expect(args.skip).toBeUndefined();
  });
});

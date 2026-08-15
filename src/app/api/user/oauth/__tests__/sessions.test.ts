/**
 * 用户 OAuth 授权列表路由测试
 * GET /api/user/oauth/sessions
 *
 * 覆盖：
 * - 未认证 401
 * - 同一 client 多条 session 时按 clientId 去重，仅返回最近创建的一条
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// === Mock Prisma ===
vi.mock("@/lib/prisma", () => ({
  prisma: {
    oAuthSession: {
      findMany: vi.fn(),
    },
    oAuthClient: {
      findMany: vi.fn(),
    },
  },
}));

// === Mock auth ===
vi.mock("@/lib/auth", () => ({
  verifyUserAuth: vi.fn(),
}));

// === Mock logger ===
vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { GET } from "../sessions/route";
import { verifyUserAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const USER = { id: "user-1", phone: "13800138000", nickname: "测试用户" };

function createRequest() {
  return new NextRequest("http://localhost/api/user/oauth/sessions");
}

describe("GET /api/user/oauth/sessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyUserAuth).mockResolvedValue(USER as never);
  });

  it("未认证应返回 401", async () => {
    vi.mocked(verifyUserAuth).mockResolvedValue(null as never);
    const res = await GET(createRequest());
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHORIZED");
    expect(prisma.oAuthSession.findMany).not.toHaveBeenCalled();
  });

  it("同一 client 多条 session 应按 clientId 去重，保留最近创建的一条", async () => {
    const newer = new Date("2026-08-02T00:00:00Z");
    const older = new Date("2026-08-01T00:00:00Z");
    // findMany 按 createdAt 倒序返回
    (prisma.oAuthSession.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { clientId: "client-a", scopes: ["openid", "phone"], createdAt: newer },
      { clientId: "client-a", scopes: ["openid"], createdAt: older },
      { clientId: "client-b", scopes: ["openid", "profile"], createdAt: older },
    ]);
    (prisma.oAuthClient.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { clientId: "client-a", name: "应用 A" },
      { clientId: "client-b", name: "应用 B" },
    ]);

    const res = await GET(createRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0]).toEqual({
      clientId: "client-a",
      clientName: "应用 A",
      scopes: ["openid", "phone"],
      createdAt: newer.toISOString(),
    });
    expect(body.data[1]).toEqual({
      clientId: "client-b",
      clientName: "应用 B",
      scopes: ["openid", "profile"],
      createdAt: older.toISOString(),
    });
  });

  it("client 记录缺失时 clientName 回退为 clientId", async () => {
    (prisma.oAuthSession.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { clientId: "client-x", scopes: ["openid"], createdAt: new Date("2026-08-01T00:00:00Z") },
    ]);
    (prisma.oAuthClient.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const res = await GET(createRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data[0].clientName).toBe("client-x");
  });
});

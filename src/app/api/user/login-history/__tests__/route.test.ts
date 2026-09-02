/**
 * GET /api/user/login-history 路由测试
 * 覆盖：账号维度查询（userId OR identifier 哈希兜底）、IP 脱敏、字段映射
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  verifyUserAuth: vi.fn().mockResolvedValue({ id: "user-1" }),
}));

vi.mock("@/lib/auth-security", () => ({
  hashIdentifier: (v: string) => `hashed:${v}`,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    loginAttempt: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/mask-phone", () => ({
  maskIp: (ip: string) => `${ip}.masked`,
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

import { prisma } from "@/lib/prisma";
import { GET } from "@/app/api/user/login-history/route";

const mockUserFindUnique = prisma.user.findUnique as ReturnType<typeof vi.fn>;
const mockAttemptFindMany = prisma.loginAttempt.findMany as ReturnType<typeof vi.fn>;

function createRequest(): NextRequest {
  return new NextRequest(new URL("/api/user/login-history", "http://localhost:3000"), {
    method: "GET",
  } as never);
}

describe("GET /api/user/login-history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserFindUnique.mockResolvedValue({ phone: "13800138000" });
    mockAttemptFindMany.mockResolvedValue([
      {
        id: "a1",
        type: "sms",
        success: true,
        reason: null,
        ipAddress: "1.2.3.4",
        createdAt: new Date("2026-09-01T10:00:00Z"),
      },
    ]);
  });

  it("按账号维度查询：userId 优先 + identifier 哈希兜底", async () => {
    const res = await GET(createRequest());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockAttemptFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ userId: "user-1" }, { identifier: "hashed:13800138000" }] },
        orderBy: { createdAt: "desc" },
        take: 20,
      })
    );
  });

  it("响应映射：IP 脱敏、不泄露 identifier、时间为 ISO 字符串", async () => {
    const res = await GET(createRequest());
    const data = await res.json();

    expect(data.data).toEqual([
      {
        id: "a1",
        type: "sms",
        success: true,
        reason: null,
        ipAddress: "1.2.3.4.masked",
        createdAt: "2026-09-01T10:00:00.000Z",
      },
    ]);
    expect(data.data[0]).not.toHaveProperty("identifier");
  });

  it("用户不存在应返回 404 USER_NOT_FOUND", async () => {
    mockUserFindUnique.mockResolvedValue(null);
    const res = await GET(createRequest());
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("USER_NOT_FOUND");
  });
});

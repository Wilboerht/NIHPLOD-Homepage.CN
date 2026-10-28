import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  verifyToken: vi.fn(),
  isTokenBlacklisted: vi.fn().mockResolvedValue(false),
  findUnique: vi.fn(),
}));

vi.mock("@/lib/jwt", () => ({
  verifyToken: mocks.verifyToken,
  verifyUserToken: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    admin: { findUnique: mocks.findUnique },
  },
  default: { admin: { findUnique: mocks.findUnique } },
}));

vi.mock("@/lib/token-blacklist", () => ({
  isTokenBlacklisted: mocks.isTokenBlacklisted,
}));

vi.mock("@/lib/ratelimit", () => ({
  rateLimit: vi.fn().mockResolvedValue({ success: true }),
  getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@/lib/csrf", () => ({
  validateCSRFToken: vi.fn().mockReturnValue(true),
  csrfForbiddenResponse: vi.fn(),
}));

import { withAuth } from "@/lib/auth";

describe("withAuth 管理员会话载荷", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyToken.mockResolvedValue({
      id: "admin-1",
      email: "admin@test.com",
      name: "Admin",
      role: "owner",
      ver: 3,
      jti: "session-jti-1",
    });
    mocks.findUnique.mockResolvedValue({
      id: "admin-1",
      email: "admin@test.com",
      name: "Admin",
      role: "owner",
      permissions: [],
      tokenVersion: 3,
      status: "ACTIVE",
      deletedAt: null,
    });
  });

  it("返回的 admin 载荷必须保留 JWT jti，供 step-up 会话绑定与审计使用", async () => {
    const handler = vi.fn(async (_request: NextRequest, admin: { jti?: string }) =>
      NextResponse.json({ jti: admin.jti })
    );
    const wrapped = withAuth(handler);

    const request = new NextRequest("http://localhost/api/admin/test", {
      method: "GET",
      headers: { cookie: "__Host-admin_token=test-token" },
    });
    const response = await wrapped(request, undefined as never);
    const body = await response.json();

    expect(body.jti).toBe("session-jti-1");
  });
});

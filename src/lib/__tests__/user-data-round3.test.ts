/**
 * 用户系统第三轮修复 · 数据一致性与用户中心测试
 * 覆盖：
 * - devices DELETE：越权撤销返回 404、禁止撤销当前会话自身
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createHash } from "crypto";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    refreshToken: { findFirst: vi.fn(), update: vi.fn() },
    oAuthSession: { updateMany: vi.fn() },
    user: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn(prisma)
  );
  return { prisma };
});

vi.mock("@/lib/csrf", () => ({
  validateCSRFToken: vi.fn().mockReturnValue(true),
  csrfForbiddenResponse: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  verifyUserAuth: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/auth-logger", () => ({
  logAuthEvent: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { verifyUserAuth } from "@/lib/auth";
import { USER_REFRESH_COOKIE_NAME } from "@/types/auth";
import { DELETE as deviceDelete } from "@/app/api/user/devices/[id]/route";

const mockVerifyUserAuth = verifyUserAuth as ReturnType<typeof vi.fn>;
const mockRtFindFirst = prisma.refreshToken.findFirst as ReturnType<typeof vi.fn>;

describe("DELETE /api/user/devices/:id（第三轮修复）", () => {
  const deviceId = "c" + "a".repeat(24);

  function createDeleteRequest(headers: Record<string, string> = {}) {
    return new NextRequest(new URL(`/api/user/devices/${deviceId}`, "http://localhost:3000"), {
      method: "DELETE",
      headers,
    } as never);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyUserAuth.mockResolvedValue({ id: "user-1", phone: "13800138000" });
  });

  it("目标会话不属于当前用户时应返回 404（越权不泄露存在性）", async () => {
    mockRtFindFirst.mockResolvedValueOnce(null);

    const res = await deviceDelete(createDeleteRequest(), {
      params: Promise.resolve({ id: deviceId }),
    } as never);
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error.code).toBe("NOT_FOUND");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("不允许撤销当前会话自身", async () => {
    const currentToken = "current-rt";
    mockRtFindFirst.mockResolvedValueOnce({
      id: deviceId,
      token: createHash("sha256").update(currentToken).digest("hex"),
      clientId: null,
    });

    const res = await deviceDelete(
      createDeleteRequest({ cookie: `${USER_REFRESH_COOKIE_NAME}=${currentToken}` }),
      { params: Promise.resolve({ id: deviceId }) } as never
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error.code).toBe("CURRENT_SESSION");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

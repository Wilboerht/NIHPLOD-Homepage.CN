/**
 * DELETE /api/user/devices/:id 路由测试（设备强制下线的 Backchannel Logout 通知）
 * 覆盖：被踢会话有关联 OAuth client 时撤销后调用 sendBackchannelLogout（带 sid 映射）、
 * 纯主站会话（clientId=null）跳过通知、通知抛错不阻断主流程、
 * 不能强制下线当前设备自身
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createHash } from "crypto";

vi.mock("@/lib/auth", () => ({
  verifyUserAuth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    refreshToken: { findFirst: vi.fn(), update: vi.fn() },
    oAuthSession: { findFirst: vi.fn(), updateMany: vi.fn() },
    user: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/backchannel-logout", () => ({
  sendBackchannelLogout: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/auth-logger", () => ({
  logAuthEvent: vi.fn(),
}));

vi.mock("@/lib/csrf", () => ({
  validateCSRFToken: vi.fn().mockReturnValue(true),
  csrfForbiddenResponse: vi.fn(),
}));

vi.mock("@/lib/validation", () => ({
  validateCUID: vi.fn().mockReturnValue(true),
  invalidIdResponse: vi.fn(),
}));

import { verifyUserAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendBackchannelLogout } from "@/lib/backchannel-logout";
import { USER_REFRESH_COOKIE_NAME } from "@/types/auth";
import { DELETE } from "@/app/api/user/devices/[id]/route";

const mockVerifyUserAuth = verifyUserAuth as ReturnType<typeof vi.fn>;
const mockRefreshFindFirst = prisma.refreshToken.findFirst as ReturnType<typeof vi.fn>;
const mockSessionFindFirst = prisma.oAuthSession.findFirst as ReturnType<typeof vi.fn>;
const mockTransaction = prisma.$transaction as ReturnType<typeof vi.fn>;
const mockSendBackchannel = sendBackchannelLogout as ReturnType<typeof vi.fn>;

const TARGET_ID = "cltarget1234567890abcde";
// 与目标会话不同的当前会话 token，避免触发"不能下线当前设备"分支
const CURRENT_TOKEN = "current-rt-value";
const TARGET_TOKEN_HASH = createHash("sha256").update("target-rt-value").digest("hex");

function createRequest(): NextRequest {
  return new NextRequest(new URL(`/api/user/devices/${TARGET_ID}`, "http://localhost:3000"), {
    method: "DELETE",
    headers: { cookie: `${USER_REFRESH_COOKIE_NAME}=${CURRENT_TOKEN}` },
  } as never);
}

const context = { params: Promise.resolve({ id: TARGET_ID }) };

describe("DELETE /api/user/devices/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyUserAuth.mockResolvedValue({ id: "user-1" });
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      phone: "13800138000",
    });
    // 事务直接以 prisma 自身作为 tx 执行回调（mock 上的 update/updateMany 已被断言）
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<void>) => cb(prisma));
    (prisma.refreshToken.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (prisma.oAuthSession.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });
  });

  it("被踢会话有关联 OAuth client：撤销后发送 Backchannel Logout（带 sid 映射）", async () => {
    mockRefreshFindFirst.mockResolvedValue({
      id: TARGET_ID,
      token: TARGET_TOKEN_HASH,
      clientId: "oauth-client-1",
    });
    mockSessionFindFirst.mockResolvedValue({ sessionId: "sid-1" });

    const res = await DELETE(createRequest(), context);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockSendBackchannel).toHaveBeenCalledWith("user-1", ["oauth-client-1"], {
      sids: { "oauth-client-1": "sid-1" },
    });
    // 通知发生在撤销事务之后（mock.calls 顺序：$transaction 先于 sendBackchannelLogout）
    expect(mockTransaction.mock.invocationCallOrder[0]).toBeLessThan(
      mockSendBackchannel.mock.invocationCallOrder[0]
    );
  });

  it("纯主站会话（clientId=null）：跳过 Backchannel Logout 通知", async () => {
    mockRefreshFindFirst.mockResolvedValue({
      id: TARGET_ID,
      token: TARGET_TOKEN_HASH,
      clientId: null,
    });

    const res = await DELETE(createRequest(), context);

    expect(res.status).toBe(200);
    expect(mockSessionFindFirst).not.toHaveBeenCalled();
    expect(mockSendBackchannel).not.toHaveBeenCalled();
  });

  it("Backchannel Logout 通知抛错：不阻断主流程，仍返回成功", async () => {
    mockRefreshFindFirst.mockResolvedValue({
      id: TARGET_ID,
      token: TARGET_TOKEN_HASH,
      clientId: "oauth-client-1",
    });
    mockSessionFindFirst.mockResolvedValue(null);
    mockSendBackchannel.mockRejectedValue(new Error("db down"));

    const res = await DELETE(createRequest(), context);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    // 无活跃 OAuthSession 可映射时 sid 缺省（undefined）
    expect(mockSendBackchannel).toHaveBeenCalledWith("user-1", ["oauth-client-1"], {
      sids: undefined,
    });
  });

  it("目标为当前会话自身：返回 400，不撤销也不通知", async () => {
    mockRefreshFindFirst.mockResolvedValue({
      id: TARGET_ID,
      token: createHash("sha256").update(CURRENT_TOKEN).digest("hex"),
      clientId: "oauth-client-1",
    });

    const res = await DELETE(createRequest(), context);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error.code).toBe("CURRENT_SESSION");
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockSendBackchannel).not.toHaveBeenCalled();
  });
});

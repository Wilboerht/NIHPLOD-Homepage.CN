import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));

vi.mock("@/lib/prisma", () => {
  const prisma = {
    contactMessage: {
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
  };
  return { prisma, default: prisma };
});

vi.mock("@/lib/auth", () => ({
  verifyAuth: vi.fn(),
  checkAdminRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/csrf", () => ({
  validateCSRFToken: vi.fn().mockReturnValue(true),
  csrfForbiddenResponse: vi.fn(),
}));

vi.mock("@/lib/admin-permissions", () => ({
  hasAdminPermission: vi.fn().mockReturnValue(true),
}));

vi.mock("@/lib/admin-totp", () => ({
  requireAdminStepUp: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/audit", () => ({
  beginAuditLog: vi.fn(),
  finishAuditLog: vi.fn().mockResolvedValue(true),
  createAuditLog: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { prisma } from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth";
import { beginAuditLog, finishAuditLog } from "@/lib/audit";
import { DELETE } from "../[id]/route";

const ADMIN = {
  id: "admin-1",
  email: "admin@test.com",
  name: "Admin",
  role: "admin",
  jti: "jti-1",
};

function createRequest() {
  return new NextRequest("https://nihplod.cn/api/admin/messages/clx0000000000000000000001", { method: "DELETE" });
}

describe("DELETE /api/admin/messages/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (verifyAuth as ReturnType<typeof vi.fn>).mockResolvedValue(ADMIN);
    (prisma.contactMessage.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "clx0000000000000000000001",
      phone: "13800138000",
    });
    (prisma.contactMessage.delete as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "clx0000000000000000000001" });
    (beginAuditLog as ReturnType<typeof vi.fn>).mockResolvedValue("audit-1");
  });

  it("鍏堝啓 PENDING 瀹¤锛屽垹闄ゆ垚鍔熷悗钀?SUCCESS", async () => {
    const res = await DELETE(createRequest(), { params: Promise.resolve({ id: "clx0000000000000000000001" }) });

    expect(res.status).toBe(200);
    expect(beginAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "delete_message", targetId: "clx0000000000000000000001" })
    );
    expect(prisma.contactMessage.delete).toHaveBeenCalledWith({ where: { id: "clx0000000000000000000001" } });
    expect(finishAuditLog).toHaveBeenCalledWith("audit-1", "SUCCESS", expect.any(Object));
  });

  it("鍒犻櫎澶辫触鏃舵妸瀹¤钀戒负 FAILURE", async () => {
    (prisma.contactMessage.delete as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("db down")
    );

    const res = await DELETE(createRequest(), { params: Promise.resolve({ id: "clx0000000000000000000001" }) });

    expect(res.status).toBe(500);
    expect(finishAuditLog).toHaveBeenCalledWith("audit-1", "FAILURE", expect.any(Object));
  });

  it("瀹¤涓嶅彲鐢ㄦ椂鎷掔粷鍒犻櫎", async () => {
    (beginAuditLog as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await DELETE(createRequest(), { params: Promise.resolve({ id: "clx0000000000000000000001" }) });

    expect(res.status).toBe(503);
    expect(prisma.contactMessage.delete).not.toHaveBeenCalled();
  });
});

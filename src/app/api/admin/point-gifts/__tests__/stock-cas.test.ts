import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    product: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
  };
  return { prisma, default: prisma };
});

vi.mock("@/lib/auth", () => ({
  verifyAuth: vi.fn(),
  checkAdminRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/admin-permissions", () => ({
  hasAdminPermission: vi.fn().mockReturnValue(true),
}));

vi.mock("@/lib/csrf", () => ({
  validateCSRFToken: vi.fn().mockReturnValue(true),
  csrfForbiddenResponse: vi.fn(),
}));

vi.mock("@/lib/admin-totp", () => ({
  requireAdminStepUp: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/audit", () => ({
  beginAuditLog: vi.fn().mockResolvedValue("audit-1"),
  finishAuditLog: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { prisma } from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth";
import { finishAuditLog } from "@/lib/audit";
import { PATCH } from "../route";

const PRODUCT_ID = "clx0000000000000000000001";
const ADMIN = { id: "admin-1", email: "admin@test.com", name: "Admin", role: "owner" };

function createRequest(body: unknown) {
  return new NextRequest("https://nihplod.cn/api/admin/point-gifts", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("PATCH /api/admin/point-gifts 库存 CAS", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (verifyAuth as ReturnType<typeof vi.fn>).mockResolvedValue(ADMIN);
    (prisma.product.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: PRODUCT_ID,
      name: "礼品",
      published: true,
      pointRedeemable: true,
      redeemStock: 10,
      redeemLimitPerUser: null,
      redeemLimitWindowDays: null,
    });
    (prisma.product.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });
  });

  it("库存更新携带读取快照作为 CAS 条件", async () => {
    const res = await PATCH(createRequest({ productId: PRODUCT_ID, redeemStock: 20 }));

    expect(res.status).toBe(200);
    expect(prisma.product.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: PRODUCT_ID, redeemStock: 10 },
        data: { redeemStock: 20 },
      })
    );
    expect(finishAuditLog).toHaveBeenCalledWith("audit-1", "SUCCESS", expect.any(Object));
  });

  it("库存已被并发修改时返回 409，不覆盖用户侧扣减", async () => {
    (prisma.product.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0 });

    const res = await PATCH(createRequest({ productId: PRODUCT_ID, redeemStock: 20 }));

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("STOCK_CONFLICT");
    expect(finishAuditLog).toHaveBeenCalledWith(
      "audit-1",
      "FAILURE",
      expect.objectContaining({ reason: "STOCK_CONFLICT" })
    );
  });

  it("仅修改开关时不附加库存 CAS 条件", async () => {
    const res = await PATCH(createRequest({ productId: PRODUCT_ID, pointRedeemable: false }));

    expect(res.status).toBe(200);
    expect(prisma.product.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: PRODUCT_ID },
        data: { pointRedeemable: false },
      })
    );
  });
});

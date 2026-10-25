import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  verifyAuth: vi.fn(),
  checkAdminRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/csrf", () => ({
  validateCSRFToken: vi.fn().mockReturnValue(true),
  csrfForbiddenResponse: () =>
    new Response(JSON.stringify({ success: false, error: { code: "CSRF_INVALID" } }), {
      status: 403,
    }),
}));

vi.mock("@/lib/validation", () => ({
  validateCUID: vi.fn().mockReturnValue(true),
  invalidIdResponse: () =>
    new Response(JSON.stringify({ success: false, error: { code: "INVALID_ID" } }), {
      status: 400,
    }),
}));

vi.mock("@/lib/admin-totp", () => ({
  requireMoneyOperationTotp: vi.fn().mockResolvedValue(null),
  requireAdminStepUp: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/audit", () => ({
  beginAuditLog: vi.fn().mockResolvedValue("audit-1"),
  finishAuditLog: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/point-gifts", () => ({
  cancelRedemption: vi.fn(),
  fulfillRedemption: vi.fn(),
  updateRedemptionWaybill: vi.fn(),
}));

vi.mock("@/lib/miniprogram-notify", () => ({
  notifyPointsRedemptionShipped: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: (task: () => unknown) => task() };
});

import { verifyAuth } from "@/lib/auth";
import { beginAuditLog, finishAuditLog } from "@/lib/audit";
import { cancelRedemption, fulfillRedemption, updateRedemptionWaybill } from "@/lib/point-gifts";
import { POST as cancel } from "@/app/api/admin/point-redemptions/[id]/cancel/route";
import { POST as fulfill } from "@/app/api/admin/point-redemptions/[id]/fulfill/route";
import { PATCH as updateWaybill } from "@/app/api/admin/point-redemptions/[id]/waybill/route";

const ADMIN = { id: "admin-1", email: "admin@test.com", name: "Admin", role: "owner" };
const context = { params: Promise.resolve({ id: "rd-1" }) };

function createRequest(method: "POST" | "PATCH", body: unknown = {}) {
  return new NextRequest("http://localhost/api/admin/point-redemptions/rd-1", {
    method,
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("admin point redemption actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAuth).mockResolvedValue(ADMIN as never);
    vi.mocked(beginAuditLog).mockResolvedValue("audit-1");
    vi.mocked(finishAuditLog).mockResolvedValue(true);
  });

  it("取消兑换成功后完成成功审计", async () => {
    vi.mocked(cancelRedemption).mockResolvedValue({ ok: true, points: 100 });

    const res = await cancel(createRequest("POST", { note: "缺货" }), context);

    expect(res.status).toBe(200);
    expect(beginAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "point_redemption_cancel",
        targetId: "rd-1",
      })
    );
    expect(finishAuditLog).toHaveBeenCalledWith(
      "audit-1",
      "SUCCESS",
      expect.objectContaining({ refundedPoints: 100 })
    );
  });

  it("审计预写失败时取消操作被拒绝", async () => {
    vi.mocked(beginAuditLog).mockResolvedValueOnce(null);

    const res = await cancel(createRequest("POST"), context);

    expect(res.status).toBe(503);
    expect(cancelRedemption).not.toHaveBeenCalled();
  });

  it("履约成功后完成成功审计", async () => {
    vi.mocked(fulfillRedemption).mockResolvedValue({ ok: true });

    const res = await fulfill(createRequest("POST", { waybillNo: "SF12345678" }), context);

    expect(res.status).toBe(200);
    expect(finishAuditLog).toHaveBeenCalledWith(
      "audit-1",
      "SUCCESS",
      expect.objectContaining({ waybillNo: "SF12345678" })
    );
  });

  it("更新运单号成功后完成成功审计", async () => {
    vi.mocked(updateRedemptionWaybill).mockResolvedValue({ ok: true });

    const res = await updateWaybill(createRequest("PATCH", { waybillNo: "SF12345678" }), context);

    expect(res.status).toBe(200);
    expect(beginAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "point_redemption_waybill_update" })
    );
    expect(finishAuditLog).toHaveBeenCalledWith("audit-1", "SUCCESS", {
      waybillNo: "SF12345678",
    });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  verifyAuth: vi.fn(),
  checkAdminRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/csrf", () => ({
  validateCSRFToken: vi.fn().mockReturnValue(true),
  csrfForbiddenResponse: () => new Response(null, { status: 403 }),
}));

vi.mock("@/lib/validation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/validation")>();
  return {
    ...actual,
    validateCUID: vi.fn().mockReturnValue(true),
    invalidIdResponse: () => new Response(null, { status: 400 }),
  };
});

vi.mock("@/lib/audit", () => ({
  beginAuditLog: vi.fn().mockResolvedValue("audit-1"),
  finishAuditLog: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/admin-totp", () => ({
  requireAdminStepUp: vi.fn().mockResolvedValue(null),
  requireMoneyOperationTotp: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/redemption-state-machine", () => ({
  reviewAfterSales: vi.fn(),
  receiveReturn: vi.fn(),
  refundAfterSales: vi.fn(),
  closeAfterSales: vi.fn(),
}));

import { verifyAuth } from "@/lib/auth";
import { beginAuditLog, finishAuditLog } from "@/lib/audit";
import {
  closeAfterSales,
  receiveReturn,
  refundAfterSales,
  reviewAfterSales,
} from "@/lib/redemption-state-machine";
import { POST as review } from "../[id]/after-sales/review/route";
import { POST as receive } from "../[id]/after-sales/receive/route";
import { POST as refund } from "../[id]/after-sales/refund/route";
import { POST as close } from "../[id]/after-sales/close/route";

const OWNER = { id: "admin-1", email: "owner@test.com", name: "Owner", role: "owner" };
const context = { params: Promise.resolve({ id: "rd-1" }) };

function request(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/admin/point-redemptions/rd-1/after-sales", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("admin redemption after-sales routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAuth).mockResolvedValue(OWNER as never);
    vi.mocked(beginAuditLog).mockResolvedValue("audit-1");
    vi.mocked(finishAuditLog).mockResolvedValue(true);
  });

  it("审核通过调用服务并写成功审计", async () => {
    vi.mocked(reviewAfterSales).mockResolvedValue({ ok: true, status: "AFTER_SALES_APPROVED" });

    const response = await review(request({ approve: true, note: "ok" }), context);

    expect(response.status).toBe(200);
    expect(reviewAfterSales).toHaveBeenCalledWith({
      redemptionId: "rd-1",
      adminId: "admin-1",
      approve: true,
      note: "ok",
    });
    expect(finishAuditLog).toHaveBeenCalledWith(
      "audit-1",
      "SUCCESS",
      expect.objectContaining({ status: "AFTER_SALES_APPROVED" })
    );
  });

  it("确认退货传递库存回补标记", async () => {
    vi.mocked(receiveReturn).mockResolvedValue({ ok: true, status: "RETURNED" });

    const response = await receive(request({ restockApproved: true, note: "可二次销售" }), context);

    expect(response.status).toBe(200);
    expect(receiveReturn).toHaveBeenCalledWith({
      redemptionId: "rd-1",
      adminId: "admin-1",
      restockApproved: true,
      note: "可二次销售",
    });
  });

  it("owner 售后退分调用退款服务并返回退分数量", async () => {
    vi.mocked(refundAfterSales).mockResolvedValue({
      ok: true,
      status: "REFUNDED",
      points: 12000,
    });

    const response = await refund(request({ note: "退款" }), context);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual({ status: "REFUNDED", refundedPoints: 12000 });
    expect(refundAfterSales).toHaveBeenCalledWith({
      redemptionId: "rd-1",
      adminId: "admin-1",
      note: "退款",
    });
  });

  it("关闭售后传递原因并写审计", async () => {
    vi.mocked(closeAfterSales).mockResolvedValue(true);

    const response = await close(request({ reason: "用户放弃寄回" }), context);

    expect(response.status).toBe(200);
    expect(closeAfterSales).toHaveBeenCalledWith({
      redemptionId: "rd-1",
      actorType: "ADMIN",
      actorId: "admin-1",
      reason: "用户放弃寄回",
    });
    expect(finishAuditLog).toHaveBeenCalledWith(
      "audit-1",
      "SUCCESS",
      expect.objectContaining({ closed: true })
    );
  });
});

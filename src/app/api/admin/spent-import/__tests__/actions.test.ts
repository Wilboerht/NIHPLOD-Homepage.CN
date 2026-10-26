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
}));

vi.mock("@/lib/audit", () => ({
  beginAuditLog: vi.fn().mockResolvedValue("audit-1"),
  finishAuditLog: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/spent-import", () => ({
  executeImportBatch: vi.fn(),
  undoImportBatch: vi.fn(),
  verifyImportPreviewToken: vi.fn(),
  IMPORT_MAX_ROWS: 500,
  IMPORT_PREVIEW_TOKEN_MAX_LENGTH: 2_000_000,
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

import { verifyAuth } from "@/lib/auth";
import { beginAuditLog, finishAuditLog } from "@/lib/audit";
import { executeImportBatch, undoImportBatch, verifyImportPreviewToken } from "@/lib/spent-import";
import { POST as execute } from "@/app/api/admin/spent-import/execute/route";
import { POST as undo } from "@/app/api/admin/spent-import/[id]/undo/route";

const ADMIN = { id: "admin-1", email: "admin@test.com", name: "Admin", role: "owner" };
const context = { params: Promise.resolve({ id: "batch-1" }) };

function createRequest(url: string, body: unknown = {}) {
  return new NextRequest(`http://localhost${url}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const executeBody = {
  previewToken: "encrypted-preview-token",
  rowIndexes: [2],
  reason: "测试导入",
};

const previewRows = [
  {
    rowIndex: 2,
    phone: "13800138000",
    amount: 100,
    channel: "TMALL",
    orderNo: "TM001",
    orderNoKey: "TM001",
    purchasedAt: "2026-01-15",
    note: null,
    error: null,
  },
];

describe("admin spent import actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAuth).mockResolvedValue(ADMIN as never);
    vi.mocked(beginAuditLog).mockResolvedValue("audit-1");
    vi.mocked(finishAuditLog).mockResolvedValue(true);
    vi.mocked(verifyImportPreviewToken).mockReturnValue({
      ok: true,
      payload: {
        v: 1,
        adminId: "admin-1",
        fileName: "spent.xlsx",
        fileHash: "file-hash-1",
        rows: previewRows as never,
        iat: Date.now(),
        exp: Date.now() + 60_000,
      },
    });
  });

  it("缺少导入原因返回 400", async () => {
    const res = await execute(
      createRequest("/api/admin/spent-import/execute", {
        previewToken: "token",
        rowIndexes: [2],
      })
    );
    expect(res.status).toBe(400);
    expect(executeImportBatch).not.toHaveBeenCalled();
  });

  it("预览令牌无效/过期返回对应状态", async () => {
    vi.mocked(verifyImportPreviewToken).mockReturnValueOnce({
      ok: false,
      code: "INVALID_TOKEN",
      message: "invalid",
    });
    const invalid = await execute(createRequest("/api/admin/spent-import/execute", executeBody));
    expect(invalid.status).toBe(400);

    vi.mocked(verifyImportPreviewToken).mockReturnValueOnce({
      ok: false,
      code: "TOKEN_EXPIRED",
      message: "expired",
    });
    const expired = await execute(createRequest("/api/admin/spent-import/execute", executeBody));
    expect(expired.status).toBe(410);
    expect(executeImportBatch).not.toHaveBeenCalled();
  });

  it("包含预览失败行时拒绝执行", async () => {
    vi.mocked(verifyImportPreviewToken).mockReturnValueOnce({
      ok: true,
      payload: {
        v: 1,
        adminId: "admin-1",
        fileName: "spent.xlsx",
        fileHash: "file-hash-1",
        rows: [{ ...previewRows[0], error: "bad" }] as never,
        iat: Date.now(),
        exp: Date.now() + 60_000,
      },
    });
    const res = await execute(createRequest("/api/admin/spent-import/execute", executeBody));
    expect(res.status).toBe(400);
    expect(executeImportBatch).not.toHaveBeenCalled();
  });

  it("导入审计预写失败时不执行导入", async () => {
    vi.mocked(beginAuditLog).mockResolvedValueOnce(null);

    const res = await execute(createRequest("/api/admin/spent-import/execute", executeBody));

    expect(res.status).toBe(503);
    expect(executeImportBatch).not.toHaveBeenCalled();
  });

  it("导入成功后完成成功审计并记录批次号", async () => {
    vi.mocked(executeImportBatch).mockResolvedValue({
      batchId: "batch-1",
      totalRows: 1,
      successRows: 1,
      duplicateRows: 0,
      errorRows: 0,
      totalAmount: 100,
      rows: [],
    });

    const res = await execute(createRequest("/api/admin/spent-import/execute", executeBody));

    expect(res.status).toBe(200);
    expect(finishAuditLog).toHaveBeenCalledWith(
      "audit-1",
      "SUCCESS",
      expect.objectContaining({ batchId: "batch-1", successRows: 1 }),
      "batch-1"
    );
  });

  it("撤销审计预写失败时不执行撤销", async () => {
    vi.mocked(beginAuditLog).mockResolvedValueOnce(null);

    const res = await undo(
      createRequest("/api/admin/spent-import/batch-1/undo", { reason: "测试撤销" }),
      context
    );

    expect(res.status).toBe(503);
    expect(undoImportBatch).not.toHaveBeenCalled();
  });

  it("撤销成功后完成成功审计", async () => {
    vi.mocked(undoImportBatch).mockResolvedValue({
      ok: true,
      revertedRows: 2,
      totalAmount: 200,
    });

    const res = await undo(
      createRequest("/api/admin/spent-import/batch-1/undo", { reason: "测试撤销" }),
      context
    );

    expect(res.status).toBe(200);
    expect(finishAuditLog).toHaveBeenCalledWith(
      "audit-1",
      "SUCCESS",
      expect.objectContaining({ revertedRows: 2, totalAmount: 200 })
    );
  });
});

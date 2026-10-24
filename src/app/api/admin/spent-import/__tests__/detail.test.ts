import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  batchFindUnique: vi.fn(),
  rowFindMany: vi.fn(),
  rowCount: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  verifyAuth: vi.fn(),
  checkAdminRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    spentImportBatch: { findUnique: mocks.batchFindUnique },
    spentImportRow: {
      findMany: mocks.rowFindMany,
      count: mocks.rowCount,
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { GET } from "../[id]/route";
import { verifyAuth } from "@/lib/auth";

const BATCH_ID = "clx000000000000000000001";
const OWNER = { id: "admin-1", email: "owner@test.com", name: "Owner", role: "owner" };
const SUPPORT = { id: "admin-2", email: "support@test.com", name: "Support", role: "support" };

const batch = {
  id: BATCH_ID,
  fileName: "spent.xlsx",
  reason: "财务补录",
  status: "COMPLETED",
  totalRows: 1,
  successRows: 1,
  duplicateRows: 0,
  errorRows: 0,
  totalAmount: 100,
  lastError: null,
  startedAt: new Date("2026-10-01T10:00:00Z"),
  finishedAt: new Date("2026-10-01T10:01:00Z"),
  undoneAt: null,
  createdAt: new Date("2026-10-01T10:00:00Z"),
  admin: { name: "Owner" },
};

const row = {
  id: "row-1",
  rowIndex: 2,
  phone: "13800138000",
  amount: 100,
  channel: "TMALL",
  orderNo: "TM001",
  purchasedAt: new Date("2026-10-01T00:00:00Z"),
  note: "备注",
  status: "SUCCESS",
  error: null,
  appliedDelta: 100,
  revertedAt: null,
  createdAt: new Date("2026-10-01T10:00:00Z"),
};

function request(query = "") {
  return new NextRequest(`http://localhost/api/admin/spent-import/${BATCH_ID}${query}`, {
    method: "GET",
  });
}

const context = { params: Promise.resolve({ id: BATCH_ID }) };

describe("GET /api/admin/spent-import/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAuth).mockResolvedValue(OWNER as never);
    mocks.batchFindUnique.mockResolvedValue(batch);
    mocks.rowFindMany.mockResolvedValue([row]);
    mocks.rowCount.mockResolvedValue(1);
  });

  it("返回批次摘要和脱敏逐行明细", async () => {
    const res = await GET(request("?page=1&pageSize=20&status=ALL"), context);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.batch).toMatchObject({
      id: BATCH_ID,
      fileName: "spent.xlsx",
      reason: "财务补录",
      adminName: "Owner",
    });
    expect(body.data.rows[0]).toMatchObject({
      rowIndex: 2,
      phone: "138****8000",
      channelLabel: "天猫国际",
      appliedDelta: 100,
    });
    expect(body.data.rows[0].phone).not.toContain("13800138000");
    expect(body.data.pagination).toEqual({ page: 1, pageSize: 20, total: 1, totalPages: 1 });
  });

  it("支持状态筛选", async () => {
    mocks.rowFindMany.mockResolvedValue([]);
    mocks.rowCount.mockResolvedValue(0);
    const res = await GET(request("?status=ERROR"), context);
    expect(res.status).toBe(200);
    expect(mocks.rowFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { batchId: BATCH_ID, status: "ERROR" } })
    );
  });

  it("无导入权限返回 403", async () => {
    vi.mocked(verifyAuth).mockResolvedValue(SUPPORT as never);
    const res = await GET(request(), context);
    expect(res.status).toBe(403);
  });

  it("批次不存在返回 404", async () => {
    mocks.batchFindUnique.mockResolvedValue(null);
    const res = await GET(request(), context);
    expect(res.status).toBe(404);
  });
});

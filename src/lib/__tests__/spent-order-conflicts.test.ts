import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  importRows: vi.fn(),
  applications: vi.fn(),
  mallRecords: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    spentImportRow: { findMany: mocks.importRows },
    spentAdjustmentApplication: { findMany: mocks.applications },
    spentSyncRecord: { findMany: mocks.mallRecords },
  },
}));

import { findSpentOrderConflicts } from "../spent-order-conflicts";

describe("findSpentOrderConflicts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mallRecords.mockResolvedValue([]);
  });

  it("无导入行时返回空结果", async () => {
    mocks.importRows.mockResolvedValue([]);
    const result = await findSpentOrderConflicts();
    expect(result.count).toBe(0);
    expect(result.items).toEqual([]);
    expect(mocks.applications).not.toHaveBeenCalled();
  });

  it("按用户+订单号忽略大小写匹配，并返回冲突摘要", async () => {
    mocks.importRows.mockResolvedValue([
      {
        id: "import-row-1",
        batchId: "batch-1",
        userId: "user-1",
        orderNo: "tm-001",
        amount: 100,
        appliedDelta: 100,
        createdAt: new Date("2026-10-01T10:00:00Z"),
      },
    ]);
    mocks.applications.mockResolvedValue([
      {
        id: "application-1",
        userId: "user-1",
        orderNo: "TM-001",
        amountClaimed: 120,
        reviewAmount: 110,
        channel: "TMALL",
        reviewedAt: new Date("2026-10-02T10:00:00Z"),
      },
    ]);

    const result = await findSpentOrderConflicts({ sinceDays: 90 });

    expect(result.count).toBe(1);
    expect(result.items[0]).toMatchObject({
      userId: "user-1",
      orderNo: "tm-001",
      importRowId: "import-row-1",
      importBatchId: "batch-1",
      applicationId: "application-1",
      adjustmentAmount: 110,
      adjustmentChannel: "TMALL",
    });
    // 不返回手机号等 PII
    expect(result.items[0]).not.toHaveProperty("phone");
  });

  it("商城同步与补录审批重复时也能发现", async () => {
    mocks.importRows.mockResolvedValue([]);
    mocks.mallRecords.mockResolvedValue([
      {
        userId: "user-1",
        orderNo: "mall-1",
        orderNoKey: "MALL-1",
        reference: "mall-ref-1",
        spentDelta: 300,
        createdAt: new Date("2026-10-03T10:00:00Z"),
      },
    ]);
    mocks.applications.mockResolvedValue([
      {
        id: "application-1",
        userId: "user-1",
        orderNo: "MALL-1",
        amountClaimed: 300,
        reviewAmount: 300,
        channel: "TMALL",
        reviewedAt: new Date("2026-10-04T10:00:00Z"),
      },
    ]);

    const result = await findSpentOrderConflicts();

    expect(result.count).toBe(1);
    expect(result.items[0]).toMatchObject({
      userId: "user-1",
      orderNo: "MALL-1",
      sources: ["ADJUSTMENT", "MALL_SYNC"],
      mallReference: "mall-ref-1",
      mallAmount: 300,
    });
  });

  it("超过 limit 时返回 truncated", async () => {
    mocks.importRows.mockResolvedValue(
      Array.from({ length: 3 }, (_, index) => ({
        id: `row-${index}`,
        batchId: "batch-1",
        userId: "user-1",
        orderNo: `ORDER-${index}`,
        amount: 100,
        appliedDelta: 100,
        createdAt: new Date("2026-10-01T10:00:00Z"),
      }))
    );
    mocks.applications.mockResolvedValue(
      Array.from({ length: 3 }, (_, index) => ({
        id: `app-${index}`,
        userId: "user-1",
        orderNo: `ORDER-${index}`,
        amountClaimed: 100,
        reviewAmount: 100,
        channel: "TMALL",
        reviewedAt: new Date("2026-10-02T10:00:00Z"),
      }))
    );

    const result = await findSpentOrderConflicts({ limit: 1 });
    expect(result.count).toBe(3);
    expect(result.items).toHaveLength(1);
    expect(result.truncated).toBe(true);
  });
});

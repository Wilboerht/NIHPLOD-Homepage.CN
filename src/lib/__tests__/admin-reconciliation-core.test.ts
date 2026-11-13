import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  balanceCount: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: mocks.queryRaw,
    pointBalance: { count: mocks.balanceCount },
  },
}));

import { checkPointInvariants } from "../points-invariants";
import { findPointRedemptionLinkIssues, findSpentClaimIssues } from "../admin-reconciliation";

function sqlText(value: unknown): string {
  if (Array.isArray(value)) return value.join("?");
  const query = value as { sql?: string; strings?: readonly string[] };
  return query.sql ?? query.strings?.join("?") ?? "";
}

describe("财务对账核心 SQL 边界", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.balanceCount.mockResolvedValue(0);
    mocks.queryRaw.mockResolvedValue([]);
  });

  it("剩余流水为零但余额为正时也纳入异常检查", async () => {
    await checkPointInvariants();
    const statements = mocks.queryRaw.mock.calls.map(([query]) => sqlText(query));
    expect(statements.some((sql) => sql.includes('= 0 AND pb."available" > 0'))).toBe(true);
  });

  it("只把官网来源的无单兑换视为孤立兑换", async () => {
    await findPointRedemptionLinkIssues();
    const sql = sqlText(mocks.queryRaw.mock.calls[0][0]);
    expect(sql).toContain("pl.\"source\" = 'WEBSITE'");
  });

  it("退款合计使用全部来源的同步记录，避免商城退款误报", async () => {
    await findSpentClaimIssues();
    const sql = sqlText(mocks.queryRaw.mock.calls[0][0]);
    expect(sql).toContain('FROM "SpentSyncRecord"');
    expect(sql).toContain('c."refundedAmount" <> COALESCE(s.refunded, 0)');
    expect(sql).not.toContain('c."source" = \'SPENT_IMPORT\'');
  });
});

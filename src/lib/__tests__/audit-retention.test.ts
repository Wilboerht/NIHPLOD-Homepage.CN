import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auditFindMany: vi.fn(),
  ssoFindMany: vi.fn(),
  holdsFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    auditLog: { findMany: mocks.auditFindMany },
    ssoAuditEvent: { findMany: mocks.ssoFindMany },
    auditLegalHold: { findMany: mocks.holdsFindMany },
  },
}));

vi.mock("@/lib/audit-archive", () => ({
  getArchiveStatus: vi.fn().mockResolvedValue({
    archived: true,
    verified: true,
    backupVerified: true,
    sha256: "a".repeat(64),
  }),
}));

import {
  buildRetentionApprovalSignature,
  buildRetentionPreview,
  verifyRetentionApproval,
} from "@/lib/audit-retention";

describe("audit retention preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUDIT_INTEGRITY_HMAC_KEY = "z".repeat(32);
    process.env.AUDIT_RETENTION_ALLOW_LOCAL_ONLY = "true";
    mocks.ssoFindMany.mockResolvedValue([]);
    mocks.holdsFindMany.mockResolvedValue([]);
    const rows = [
      { createdAt: new Date("2025-01-01T00:00:00.000Z") },
      { createdAt: new Date("2025-01-01T01:00:00.000Z") },
      { createdAt: new Date("2026-10-01T00:00:00.000Z") },
    ];
    mocks.auditFindMany.mockImplementation(
      async (args: { where?: { createdAt?: { lt?: Date } } }) => {
        const cutoff = args?.where?.createdAt?.lt;
        return cutoff ? rows.filter((row) => row.createdAt < cutoff) : rows;
      }
    );
  });

  it("按 UTC+8 日聚合，并生成稳定 previewHash", async () => {
    const cutoffs = [{ stream: "audit" as const, cutoff: "2026-01-01T00:00:00.000Z" }];
    const preview = await buildRetentionPreview({ cutoffs });
    expect(preview.expectedCount).toBe(2);
    expect(preview.holdsExcluded).toBe(0);
    expect(preview.previewHash).toMatch(/^[a-f0-9]{64}$/);
    expect(preview.ready).toBe(true);

    const again = await buildRetentionPreview({ cutoffs });
    expect(again.previewHash).toBe(preview.previewHash);
  });

  it("审批签名绑定任务内容", () => {
    const cutoffs = [{ stream: "audit" as const, cutoff: "2026-01-01T00:00:00.000Z" }];
    const input = {
      id: "job-1",
      requestedBy: "admin-1",
      requestedByRole: "owner",
      reason: "年度归档核对完成",
      cutoffs,
      previewHash: "p".repeat(64),
      expectedCount: 2,
      expectedBytes: 1024,
      localOnlyAck: true,
      totpVerifiedAt: new Date("2026-10-24T00:00:00.000Z"),
    };
    const signature = buildRetentionApprovalSignature(input);
    expect(
      verifyRetentionApproval({
        ...input,
        streams: cutoffs,
        approvalSignature: signature,
      })
    ).toBe(true);
    expect(
      verifyRetentionApproval({
        ...input,
        streams: cutoffs,
        reason: "被篡改",
        approvalSignature: signature,
      })
    ).toBe(false);
  });
});

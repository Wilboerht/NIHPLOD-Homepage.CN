import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({
  auditFindMany: vi.fn(),
  ssoFindMany: vi.fn(),
  findAnchor: vi.fn(),
  createAnchor: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    auditLog: { findMany: mocks.auditFindMany },
    ssoAuditEvent: { findMany: mocks.ssoFindMany },
    auditLogAnchor: {
      findFirst: mocks.findAnchor,
      create: mocks.createAnchor,
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/audit-archive", () => ({
  verifyArchiveDay: vi.fn().mockResolvedValue(false),
  verifyArchiveBackup: vi.fn().mockResolvedValue(false),
}));

import {
  anchorAuditLogsForDay,
  getUtc8DayRange,
  verifyAuditLogAnchor,
} from "@/lib/audit-integrity";

const KEY_BACKUP = process.env.AUDIT_INTEGRITY_HMAC_KEY;
let lastAuditAnchor: Record<string, unknown> | null = null;

const row = {
  id: "log-1",
  createdAt: new Date("2026-10-18T00:00:00.000Z"),
  action: "admin_login",
  targetType: "admin",
  targetId: "admin-1",
  targetLabel: null,
  outcome: "SUCCESS",
  requestId: "req-1",
  actorType: "ADMIN",
  actorEmail: "owner@test.com",
  actorName: "Owner",
  actorRole: "owner",
  authMethod: "totp",
  sessionJti: "jti-1",
  adminId: "admin-1",
  userId: null,
  ipAddress: "1.2.3.4",
  userAgent: "test",
  detail: { b: 2, a: 1 },
  category: "auth",
  riskLevel: "LOW",
  source: "WEB",
  reason: null,
  schemaVersion: 2,
  chainVersion: 1,
  integrityKeyVersion: 1,
  chainSeq: 1,
  prevHash: null,
  entryHash: "a".repeat(64),
  finalizedAt: new Date("2026-10-18T00:00:00.000Z"),
};

describe("audit integrity anchors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastAuditAnchor = null;
    process.env.AUDIT_INTEGRITY_HMAC_KEY = "x".repeat(32);
    mocks.auditFindMany.mockResolvedValue([row]);
    mocks.ssoFindMany.mockResolvedValue([]);
    mocks.findAnchor.mockResolvedValue(null);
    mocks.createAnchor.mockImplementation(async ({ data }) => {
      const anchor = { id: `anchor-${String(data.stream)}`, ...data };
      if (data.stream === "audit") lastAuditAnchor = anchor;
      return anchor;
    });
  });

  afterEach(() => {
    if (KEY_BACKUP === undefined) delete process.env.AUDIT_INTEGRITY_HMAC_KEY;
    else process.env.AUDIT_INTEGRITY_HMAC_KEY = KEY_BACKUP;
  });

  it("以 UTC+8 计算自然日边界", () => {
    const range = getUtc8DayRange(new Date("2026-10-18T00:30:00+08:00"));
    expect(range.day).toBe("2026-10-18");
    expect(range.fromAt.toISOString()).toBe("2026-10-17T16:00:00.000Z");
    expect(range.toAt.toISOString()).toBe("2026-10-18T16:00:00.000Z");
  });

  it("生成并持久化每日 v2 摘要", async () => {
    const result = await anchorAuditLogsForDay(
      getUtc8DayRange(new Date("2026-10-18T00:30:00+08:00"))
    );

    expect(result.count).toBe(1);
    expect(result.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(result.signature).toMatch(/^[a-f0-9]{64}$/);
    expect(mocks.createAnchor).toHaveBeenCalledWith({
      data: expect.objectContaining({
        stream: "audit",
        signatureVersion: 2,
        day: "2026-10-18",
        count: 1,
        digest: result.digest,
        signature: result.signature,
      }),
    });
  });

  it("已有摘要不一致时拒绝覆盖", async () => {
    mocks.findAnchor.mockResolvedValue({
      day: "2026-10-18",
      stream: "audit",
      signatureVersion: 2,
      count: 1,
      digest: "0".repeat(64),
      signature: "0".repeat(64),
      keyVersion: 1,
      prevAnchorHash: null,
    });

    await expect(
      anchorAuditLogsForDay(getUtc8DayRange(new Date("2026-10-18T00:30:00+08:00")))
    ).rejects.toThrow("审计摘要不一致");
  });

  it("验证时检测记录篡改", async () => {
    await anchorAuditLogsForDay(getUtc8DayRange(new Date("2026-10-18T00:30:00+08:00")));
    mocks.findAnchor.mockResolvedValue(lastAuditAnchor);

    await expect(verifyAuditLogAnchor("2026-10-18")).resolves.toBe(true);

    mocks.auditFindMany.mockResolvedValue([{ ...row, action: "tampered" }]);
    await expect(verifyAuditLogAnchor("2026-10-18")).resolves.toBe(false);
  });
});

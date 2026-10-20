import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  findAnchor: vi.fn(),
  createAnchor: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    auditLog: { findMany: mocks.findMany },
    auditLogAnchor: {
      findUnique: mocks.findAnchor,
      create: mocks.createAnchor,
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

import {
  anchorAuditLogsForDay,
  getUtc8DayRange,
  verifyAuditLogAnchor,
} from "@/lib/audit-integrity";

const KEY_BACKUP = process.env.AUDIT_INTEGRITY_HMAC_KEY;

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
};

describe("audit integrity anchors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUDIT_INTEGRITY_HMAC_KEY = "x".repeat(32);
    mocks.findMany.mockResolvedValue([row]);
    mocks.findAnchor.mockResolvedValue(null);
    mocks.createAnchor.mockImplementation(async ({ data }) => ({
      id: "anchor-1",
      ...data,
    }));
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

  it("生成并持久化每日摘要", async () => {
    const result = await anchorAuditLogsForDay(getUtc8DayRange(new Date("2026-10-18T00:30:00+08:00")));

    expect(result.count).toBe(1);
    expect(result.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(result.signature).toMatch(/^[a-f0-9]{64}$/);
    expect(mocks.createAnchor).toHaveBeenCalledWith({
      data: expect.objectContaining({
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
      count: 1,
      digest: "0".repeat(64),
      signature: "0".repeat(64),
    });

    await expect(
      anchorAuditLogsForDay(getUtc8DayRange(new Date("2026-10-18T00:30:00+08:00")))
    ).rejects.toThrow("审计摘要不一致");
  });

  it("验证时检测记录篡改", async () => {
    const original = await anchorAuditLogsForDay(
      getUtc8DayRange(new Date("2026-10-18T00:30:00+08:00"))
    );
    mocks.findAnchor.mockResolvedValue({
      day: "2026-10-18",
      fromAt: new Date("2026-10-17T16:00:00.000Z"),
      toAt: new Date("2026-10-18T16:00:00.000Z"),
      count: original.count,
      digest: original.digest,
      signature: original.signature,
    });

    await expect(verifyAuditLogAnchor("2026-10-18")).resolves.toBe(true);

    mocks.findMany.mockResolvedValue([{ ...row, action: "tampered" }]);
    await expect(verifyAuditLogAnchor("2026-10-18")).resolves.toBe(false);
  });
});

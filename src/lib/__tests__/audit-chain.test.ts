import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { computeAuditEntryHash, getAuditIntegrityKey, stableStringify } from "@/lib/audit-chain";

const base = {
  id: "log-1",
  createdAt: new Date("2026-10-24T00:00:00.000Z"),
  action: "delete_admin",
  targetType: "admin",
  targetLabel: "Owner",
  requestId: "req-1",
  actorType: "ADMIN",
  actorEmail: "owner@test.com",
  actorName: "Owner",
  actorRole: "owner",
  authMethod: "totp",
  sessionJti: "jti-1",
  adminId: "admin-1",
  userId: null,
  category: "security",
  riskLevel: "CRITICAL",
  source: "WEB",
  schemaVersion: 2,
  chainVersion: 1,
  integrityKeyVersion: 1,
  chainSeq: 1,
  prevHash: null,
};

describe("audit chain", () => {
  it("stableStringify 对对象 key 排序", () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it("相同信封生成相同哈希，链序号/prevHash 变化会改变哈希", () => {
    process.env.AUDIT_INTEGRITY_HMAC_KEY = "x".repeat(32);
    const first = computeAuditEntryHash(base);
    const second = computeAuditEntryHash({ ...base });
    const next = computeAuditEntryHash({ ...base, chainSeq: 2, prevHash: first });

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).toBe(second);
    expect(next).not.toBe(first);
    expect(getAuditIntegrityKey()).toBe("x".repeat(32));
  });

  it("生产环境缺少密钥时拒绝计算", () => {
    const backup = process.env.AUDIT_INTEGRITY_HMAC_KEY;
    delete process.env.AUDIT_INTEGRITY_HMAC_KEY;
    vi.stubEnv("NODE_ENV", "production");
    try {
      expect(() => getAuditIntegrityKey()).toThrow("AUDIT_INTEGRITY_HMAC_KEY");
    } finally {
      vi.unstubAllEnvs();
      if (backup !== undefined) process.env.AUDIT_INTEGRITY_HMAC_KEY = backup;
    }
  });
});

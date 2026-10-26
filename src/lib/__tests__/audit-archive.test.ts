import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createHmac } from "crypto";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

const mocks = vi.hoisted(() => ({
  auditFindMany: vi.fn(),
  anchorFindFirst: vi.fn(),
  anchorUpdate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    auditLog: { findMany: mocks.auditFindMany },
    ssoAuditEvent: { findMany: vi.fn().mockResolvedValue([]) },
    auditLogAnchor: {
      findFirst: mocks.anchorFindFirst,
      update: mocks.anchorUpdate,
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { archiveAuditDay, verifyArchiveDay } from "@/lib/audit-archive";
import { computeAuditDigest } from "@/lib/audit-chain";

const KEY = "y".repeat(32);
let root = "";
let backup = "";

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "audit-archive-"));
  backup = await mkdtemp(join(tmpdir(), "audit-archive-backup-"));
  process.env.AUDIT_ARCHIVE_DIR = root;
  process.env.AUDIT_ARCHIVE_BACKUP_DIR = backup;
  process.env.AUDIT_INTEGRITY_HMAC_KEY = KEY;
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
  await rm(backup, { recursive: true, force: true });
});

describe("audit archive", () => {
  it("写入 gzip/manifest，可校验，篡改后校验失败", async () => {
    const day = "2026-10-23";
    const auditRow = {
      id: "log-1",
      createdAt: new Date("2026-10-23T01:00:00.000Z"),
      action: "admin_login",
      targetType: "admin",
      targetId: "admin-1",
      targetLabel: "Owner",
      detail: { ok: true },
      outcome: "SUCCESS",
      requestId: "req-1",
      actorType: "ADMIN",
      actorEmail: "owner@test.com",
      actorName: "Owner",
      actorRole: "owner",
      authMethod: "totp",
      sessionJti: "jti-1",
      legalHold: false,
      ipAddress: "1.2.3.4",
      userAgent: "test",
      adminId: "admin-1",
      userId: null,
      category: "auth",
      riskLevel: "LOW",
      source: "WEB",
      reason: null,
      schemaVersion: 2,
      chainVersion: 1,
      integrityKeyVersion: 1,
      chainSeq: 1,
      prevHash: null,
      entryHash: "e".repeat(64),
      finalizedAt: new Date("2026-10-23T01:00:01.000Z"),
    };
    const digest = computeAuditDigest([auditRow]);
    const signature = createHmac("sha256", KEY).update(`:${digest}:1:audit:${day}`).digest("hex");
    mocks.auditFindMany.mockResolvedValue([auditRow]);
    mocks.anchorFindFirst.mockResolvedValue({
      id: "anchor-1",
      stream: "audit",
      day,
      signatureVersion: 2,
      keyVersion: 1,
      count: 1,
      digest,
      signature,
      prevAnchorHash: null,
    });
    mocks.anchorUpdate.mockResolvedValue({});

    const result = await archiveAuditDay("audit", {
      day,
      fromAt: new Date("2026-10-22T16:00:00.000Z"),
      toAt: new Date("2026-10-23T16:00:00.000Z"),
    });
    expect(result.created).toBe(true);
    expect(result.verified).toBe(true);
    expect(await verifyArchiveDay("audit", day)).toBe(true);

    await writeFile(join(root, "audit", day, "events.jsonl.gz"), "tampered");
    expect(await verifyArchiveDay("audit", day)).toBe(false);
  });
});

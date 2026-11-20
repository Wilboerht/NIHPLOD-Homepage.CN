import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  consentEvent: { deleteMany: vi.fn() },
  legalDocumentVersion: { findFirst: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth-security", () => ({
  hashIdentifier: (value: string) => `hash:${value}`,
}));

import { cleanupExpiredConsentEvents, recordConsent, revokeConsent } from "@/lib/privacy-consent";

const tx = {
  privacyConsent: {
    upsert: vi.fn(),
    updateMany: vi.fn(),
  },
  consentEvent: {
    create: vi.fn(),
  },
};

describe("privacy consent evidence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) =>
      callback(tx)
    );
    tx.privacyConsent.upsert.mockResolvedValue({});
    tx.privacyConsent.updateMany.mockResolvedValue({ count: 1 });
    tx.consentEvent.create.mockResolvedValue({});
    prismaMock.consentEvent.deleteMany.mockResolvedValue({ count: 2 });
    prismaMock.legalDocumentVersion.findFirst.mockResolvedValue({
      contentHash: "legal-hash",
    });
  });

  it("records a granted event with the OAuth project and channel", async () => {
    await recordConsent({
      userId: "user-1",
      document: "PRIVACY",
      channel: "wechat-mp-points",
      ip: "203.0.113.10",
      userAgent: "test-agent",
    });

    expect(tx.privacyConsent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          channel: "wechat-mp-points",
          contentHash: "legal-hash",
        }),
      })
    );
    expect(tx.consentEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        subjectType: "USER",
        subjectHash: "hash:user-1",
        project: "POINTS",
        document: "PRIVACY",
        version: "2026-11-19",
        contentHash: "legal-hash",
        action: "GRANTED",
        channel: "wechat-mp-points",
        ipHash: "hash:203.0.113.10",
      }),
    });
  });

  it("maps the skin web OAuth client to the skin project", async () => {
    await recordConsent({
      userId: "user-1",
      document: "PRIVACY",
      channel: "q6n4aitms0wgn2sz1nj96au5",
    });

    expect(tx.consentEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        project: "SKIN",
        channel: "q6n4aitms0wgn2sz1nj96au5",
      }),
    });
  });

  it("records a revoked event only when a consent row was revoked", async () => {
    await revokeConsent("user-1", "TERMS", "wechat-mp-skin");

    expect(tx.privacyConsent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ channel: "wechat-mp-skin" }),
      })
    );
    expect(tx.consentEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        project: "SKIN",
        document: "TERMS",
        action: "REVOKED",
        channel: "wechat-mp-skin",
      }),
    });
  });

  it("deletes only evidence past its retention date", async () => {
    await expect(cleanupExpiredConsentEvents()).resolves.toBe(2);
    expect(prismaMock.consentEvent.deleteMany).toHaveBeenCalledWith({
      where: { retentionUntil: { lt: expect.any(Date) } },
    });
  });
});

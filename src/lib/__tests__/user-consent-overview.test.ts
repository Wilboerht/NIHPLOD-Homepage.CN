import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  privacyConsent: { findMany: vi.fn() },
  userConsentState: { findMany: vi.fn() },
  consentEvent: { findMany: vi.fn() },
  jobApplication: { findFirst: vi.fn() },
  kfIdentityLink: { findFirst: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const advisorMock = vi.hoisted(() => ({
  advisorRequest: vi.fn(),
}));
vi.mock("@/lib/advisor-internal", () => advisorMock);

const baMock = vi.hoisted(() => ({
  baInternalRequest: vi.fn(),
}));
vi.mock("@/lib/ba-internal", () => baMock);

vi.mock("@/lib/logger", () => ({
  apiConsole: { warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/consent-policy", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/consent-policy")>("@/lib/consent-policy");
  const privacy = {
    document: "PRIVACY" as const,
    slug: "privacy" as const,
    publishedVersion: 2,
    publishedContentHash: "hash",
    requiredVersion: 2,
    requiredContentHash: "hash",
  };
  const terms = {
    document: "TERMS" as const,
    slug: "terms" as const,
    publishedVersion: 2,
    publishedContentHash: "hash",
    requiredVersion: null,
    requiredContentHash: null,
  };
  return {
    ...actual,
    getConsentPolicySnapshot: vi.fn().mockResolvedValue({ privacy, terms }),
  };
});

import { buildUserConsentOverview } from "@/lib/user-consent-overview";

const current = "2026-11-19";

function mainRow(
  document: "PRIVACY" | "TERMS" | "MARKETING",
  channel: string,
  overrides: Record<string, unknown> = {}
) {
  return {
    document,
    version: current,
    documentVersion: 2,
    channel,
    grantedAt: new Date("2026-11-19T10:00:00.000Z"),
    revokedAt: null,
    contentHash: "hash",
    ...overrides,
  };
}

describe("buildUserConsentOverview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.userConsentState.findMany.mockResolvedValue([]);
    prismaMock.privacyConsent.findMany.mockResolvedValue([
      mainRow("PRIVACY", "web"),
      mainRow("TERMS", "web"),
      mainRow("PRIVACY", "wechat-mp-points"),
      mainRow("TERMS", "wechat-mp-points"),
    ]);
    prismaMock.consentEvent.findMany.mockResolvedValue([]);
    prismaMock.jobApplication.findFirst.mockResolvedValue(null);
    prismaMock.kfIdentityLink.findFirst.mockResolvedValue(null);

    advisorMock.advisorRequest.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        success: true,
        data: {
          currentVersion: current,
          records: [
            {
              scope: "privacy",
              version: current,
              grantedAt: "2026-11-19T10:00:00.000Z",
              revokedAt: null,
            },
            {
              scope: "terms",
              version: current,
              grantedAt: "2026-11-19T10:00:00.000Z",
              revokedAt: null,
            },
            {
              scope: "face",
              version: current,
              grantedAt: "2026-11-19T10:00:00.000Z",
              revokedAt: null,
            },
          ],
          events: [],
        },
      },
    });

    baMock.baInternalRequest.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        count: 1,
        latest: {
          consentAt: "2026-11-19T10:00:00.000Z",
          consentVersion: current,
          createdAt: "2026-11-19T10:00:00.000Z",
        },
      },
    });
  });

  it("aggregates main, points, skin, BA, KF and recruit status", async () => {
    const overview = await buildUserConsentOverview({
      userId: "user-1",
      phone: "13800138000",
    });

    expect(overview.projects.map((project) => project.key)).toEqual([
      "main",
      "points",
      "skin",
      "kf",
      "ba",
      "recruit",
    ]);

    expect(overview.projects.find((project) => project.key === "main")?.overall).toBe("current");
    expect(overview.projects.find((project) => project.key === "points")?.overall).toBe("current");
    expect(overview.projects.find((project) => project.key === "skin")?.documents.face?.state).toBe(
      "current"
    );
    expect(overview.projects.find((project) => project.key === "ba")?.overall).toBe("current");
    expect(overview.projects.find((project) => project.key === "kf")?.overall).toBe("not_linked");
    expect(overview.projects.find((project) => project.key === "recruit")?.overall).toBe(
      "not_applicable"
    );
    expect(overview.summary.current).toBe(4);
  });

  it("uses UserConsentState as the authoritative main consent status", async () => {
    prismaMock.userConsentState.findMany.mockResolvedValue([
      {
        document: "PRIVACY",
        channel: "web",
        status: "REVOKED",
        grantedAt: new Date("2026-11-19T10:00:00.000Z"),
        revokedAt: new Date("2026-11-20T10:00:00.000Z"),
        contentHash: "hash",
        legalDocumentVersion: { version: 2 },
      },
      {
        document: "TERMS",
        channel: "web",
        status: "GRANTED",
        grantedAt: new Date("2026-11-19T10:00:00.000Z"),
        revokedAt: null,
        contentHash: "hash",
        legalDocumentVersion: { version: 2 },
      },
    ]);

    const overview = await buildUserConsentOverview({
      userId: "user-1",
      phone: "13800138000",
    });

    expect(overview.projects.find((project) => project.key === "main")?.overall).toBe("revoked");
  });

  it("marks an old main consent as outdated and warns", async () => {
    prismaMock.privacyConsent.findMany.mockResolvedValue([
      mainRow("PRIVACY", "web", { version: "2026-11-11", documentVersion: 1 }),
      mainRow("TERMS", "web"),
    ]);

    const overview = await buildUserConsentOverview({
      userId: "user-1",
      phone: "13800138000",
    });

    expect(overview.projects.find((project) => project.key === "main")?.overall).toBe("outdated");
    expect(overview.warnings).toContain("主站 Web：隐私政策仍是旧版本");
  });

  it("shows the KF project when identity link and persisted event exist", async () => {
    prismaMock.kfIdentityLink.findFirst.mockResolvedValue({
      openKfid: "wk-test",
      externalUserId: "wm-test",
      linkedAt: new Date("2026-11-19T10:00:00.000Z"),
    });
    prismaMock.consentEvent.findMany.mockResolvedValue([
      {
        project: "KF",
        document: "PRIVACY",
        version: current,
        action: "GRANTED",
        channel: "wecom-kf",
        occurredAt: new Date("2026-11-19T10:00:00.000Z"),
      },
    ]);

    const overview = await buildUserConsentOverview({
      userId: "user-1",
      phone: "13800138000",
    });

    expect(overview.projects.find((project) => project.key === "kf")?.overall).toBe("current");
    expect(
      overview.projects.find((project) => project.key === "kf")?.documents.privacy?.state
    ).toBe("current");
  });

  it("does not query restricted BA or skin data", async () => {
    const overview = await buildUserConsentOverview({
      userId: "user-1",
      phone: "13800138000",
      canReadSkin: false,
      canReadBa: false,
    });

    expect(advisorMock.advisorRequest).not.toHaveBeenCalled();
    expect(baMock.baInternalRequest).not.toHaveBeenCalled();
    expect(overview.projects.find((project) => project.key === "skin")?.overall).toBe("not_linked");
    expect(overview.projects.find((project) => project.key === "ba")?.overall).toBe("not_linked");
  });

  it("degrades only the skin project when the subsite fails", async () => {
    advisorMock.advisorRequest.mockResolvedValue({
      ok: false,
      status: 0,
      code: "UPSTREAM_ERROR",
      message: "测肤站不可达",
    });

    const overview = await buildUserConsentOverview({
      userId: "user-1",
      phone: "13800138000",
    });

    expect(overview.projects.find((project) => project.key === "skin")?.overall).toBe("degraded");
    expect(overview.warnings).toContain("测肤站授权状态暂不可用：测肤站不可达");
    expect(overview.projects.find((project) => project.key === "main")?.overall).toBe("current");
  });
});

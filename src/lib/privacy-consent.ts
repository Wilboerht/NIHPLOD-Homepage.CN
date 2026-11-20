import { prisma } from "@/lib/prisma";
import { hashIdentifier } from "@/lib/auth-security";
import type {
  ConsentEventProject,
  Prisma,
  PrivacyConsentDocument,
} from "@/generated/prisma/client";

/**
 * 隐私政策与服务条款的当前版本。
 * 文本每次发生实质变更时必须同时更新这两个值，并要求用户重新同意。
 */
export const PRIVACY_POLICY_VERSION = "2026-11-19";
export const TERMS_OF_SERVICE_VERSION = "2026-11-19";

export const REQUIRED_CONSENT_DOCUMENTS = [
  "PRIVACY",
  "TERMS",
] as const satisfies readonly PrivacyConsentDocument[];

export const CONSENT_EVIDENCE_RETENTION_YEARS = 3;

export function consentRetentionUntil(from: Date = new Date()): Date {
  const until = new Date(from);
  until.setFullYear(until.getFullYear() + CONSENT_EVIDENCE_RETENTION_YEARS);
  return until;
}

const PROJECT_BY_CHANNEL: Record<string, ConsentEventProject> = {
  web: "MAIN",
  "wechat-mp-points": "POINTS",
  "wechat-mp-skin": "SKIN",
  "q6n4aitms0wgn2sz1nj96au5": "SKIN",
  "wecom-kf": "KF",
  ba: "BA",
};

function resolveConsentProject(channel: string): ConsentEventProject {
  return PROJECT_BY_CHANNEL[channel] ?? "UNKNOWN";
}

async function getCurrentContentHash(document: PrivacyConsentDocument): Promise<string | null> {
  const slug = document === "PRIVACY" ? "privacy" : document === "TERMS" ? "terms" : null;
  if (!slug) return null;

  try {
    const latest = await prisma.legalDocumentVersion.findFirst({
      where: { document: { slug } },
      orderBy: { version: "desc" },
      select: { contentHash: true },
    });
    return latest?.contentHash ?? null;
  } catch {
    return null;
  }
}

export function getDocumentVersion(document: PrivacyConsentDocument): string | null {
  if (document === "PRIVACY") return PRIVACY_POLICY_VERSION;
  if (document === "TERMS") return TERMS_OF_SERVICE_VERSION;
  return null;
}

export interface ConsentStatus {
  required: boolean;
  missing: PrivacyConsentDocument[];
  versions: {
    privacy: string;
    terms: string;
  };
}

export async function getConsentStatus(userId: string): Promise<ConsentStatus> {
  const rows = await prisma.privacyConsent.findMany({
    where: {
      userId,
      revokedAt: null,
      OR: [
        { document: "PRIVACY", version: PRIVACY_POLICY_VERSION },
        { document: "TERMS", version: TERMS_OF_SERVICE_VERSION },
      ],
    },
    select: { document: true },
  });

  const granted = new Set(rows.map((row) => row.document));
  const missing = REQUIRED_CONSENT_DOCUMENTS.filter((document) => !granted.has(document));

  return {
    required: missing.length > 0,
    missing: [...missing],
    versions: {
      privacy: PRIVACY_POLICY_VERSION,
      terms: TERMS_OF_SERVICE_VERSION,
    },
  };
}

export async function hasRequiredConsent(userId: string): Promise<boolean> {
  return !(await getConsentStatus(userId)).required;
}

export interface RecordConsentInput {
  userId: string;
  document: PrivacyConsentDocument;
  channel?: string;
  ip?: string | null;
  userAgent?: string | null;
  evidence?: Prisma.InputJsonValue | null;
}

export async function recordConsent(input: RecordConsentInput): Promise<void> {
  const version = getDocumentVersion(input.document);
  if (!version) {
    throw new Error(`Unsupported consent document: ${input.document}`);
  }

  const channel = input.channel ?? "web";
  const occurredAt = new Date();
  const ipHash = input.ip ? hashIdentifier(input.ip) : null;
  const contentHash = await getCurrentContentHash(input.document);

  await prisma.$transaction(async (tx) => {
    await tx.privacyConsent.upsert({
      where: {
        userId_document_version_channel: {
          userId: input.userId,
          document: input.document,
          version,
          channel,
        },
      },
      create: {
        userId: input.userId,
        document: input.document,
        version,
        contentHash,
        channel,
        ipHash,
        userAgent: input.userAgent ?? null,
        evidence: input.evidence ?? undefined,
      },
      update: {
        grantedAt: occurredAt,
        revokedAt: null,
        contentHash: contentHash ?? undefined,
        ipHash,
        userAgent: input.userAgent ?? null,
        evidence: input.evidence ?? undefined,
      },
    });

    await tx.consentEvent.create({
      data: {
        userId: input.userId,
        subjectType: "USER",
        subjectHash: hashIdentifier(input.userId),
        project: resolveConsentProject(channel),
        document: input.document,
        version,
        contentHash,
        action: "GRANTED",
        channel,
        occurredAt,
        ipHash,
        userAgent: input.userAgent ?? null,
        evidence: input.evidence ?? undefined,
      },
    });
  });
}

export async function revokeConsent(
  userId: string,
  document: PrivacyConsentDocument,
  channel = "web"
): Promise<void> {
  const version = getDocumentVersion(document);
  if (!version) {
    throw new Error(`Unsupported consent document: ${document}`);
  }

  const occurredAt = new Date();

  await prisma.$transaction(async (tx) => {
    const result = await tx.privacyConsent.updateMany({
      where: {
        userId,
        document,
        version,
        channel,
        revokedAt: null,
      },
      data: { revokedAt: occurredAt },
    });

    if (result.count === 0) return;

    await tx.consentEvent.create({
      data: {
        userId,
        subjectType: "USER",
        subjectHash: hashIdentifier(userId),
        project: resolveConsentProject(channel),
        document,
        version,
        contentHash: null,
        action: "REVOKED",
        channel,
        occurredAt,
        ipHash: null,
        userAgent: null,
      },
    });
  });
}

export async function cleanupExpiredConsentEvents(): Promise<number> {
  const result = await prisma.consentEvent.deleteMany({
    where: { retentionUntil: { lt: new Date() } },
  });
  return result.count;
}

import { prisma } from "@/lib/prisma";
import { hashIdentifier } from "@/lib/auth-security";
import { getConsentPolicyForDocument, getConsentPolicySnapshotFresh } from "@/lib/consent-policy";
import { CONSENT_EVIDENCE_RETENTION_YEARS, getDocumentVersion } from "@/lib/consent-constants";
import type {
  ConsentEventProject,
  Prisma,
  PrivacyConsentDocument,
} from "@/generated/prisma/client";

/**
 * 隐私政策与服务条款的当前版本。
 * 文本每次发生实质变更时必须同时更新这两个值，并要求用户重新同意。
 */
export {
  CONSENT_EVIDENCE_RETENTION_YEARS,
  MARKETING_CONSENT_VERSION,
  PRIVACY_POLICY_VERSION,
  REQUIRED_CONSENT_DOCUMENTS,
  TERMS_OF_SERVICE_VERSION,
  getDocumentVersion,
} from "@/lib/consent-constants";
export { getConsentStatus, hasRequiredConsent, type ConsentStatus } from "@/lib/consent-status";

export function consentRetentionUntil(from: Date = new Date()): Date {
  const until = new Date(from);
  until.setFullYear(until.getFullYear() + CONSENT_EVIDENCE_RETENTION_YEARS);
  return until;
}

const PROJECT_BY_CHANNEL: Record<string, ConsentEventProject> = {
  web: "MAIN",
  "wechat-mp-points": "POINTS",
  "wechat-mp-skin": "SKIN",
  q6n4aitms0wgn2sz1nj96au5: "SKIN",
  "wecom-kf": "KF",
  ba: "BA",
};

function resolveConsentProject(channel: string): ConsentEventProject {
  return PROJECT_BY_CHANNEL[channel] ?? "UNKNOWN";
}

export interface RecordConsentInput {
  userId: string;
  document: PrivacyConsentDocument;
  channel?: string;
  ip?: string | null;
  userAgent?: string | null;
  evidence?: Prisma.InputJsonValue | null;
  idempotencyKey?: string | null;
}

function isIdempotencyConflict(error: unknown): boolean {
  if (
    typeof error !== "object" ||
    error === null ||
    !("code" in error) ||
    (error as { code?: unknown }).code !== "P2002"
  ) {
    return false;
  }

  const target = (error as { meta?: { target?: unknown } }).meta?.target;
  if (Array.isArray(target)) return target.includes("idempotencyKey");
  return typeof target === "string" && target.includes("idempotencyKey");
}

export async function recordConsent(input: RecordConsentInput): Promise<void> {
  const version = getDocumentVersion(input.document);
  if (!version) {
    throw new Error(`Unsupported consent document: ${input.document}`);
  }

  const channel = input.channel ?? "web";
  const occurredAt = new Date();
  const ipHash = input.ip ? hashIdentifier(input.ip) : null;
  const isMarketing = input.document === "MARKETING";

  try {
    await prisma.$transaction(async (tx) => {
      if (input.idempotencyKey) {
        const existing = await tx.consentEvent.findFirst({
          where: { userId: input.userId, idempotencyKey: input.idempotencyKey },
          select: { id: true },
        });
        if (existing) return;
      }

      const policy = isMarketing ? null : await getConsentPolicySnapshotFresh(tx);
      const documentPolicy = policy ? getConsentPolicyForDocument(policy, input.document) : null;
      const documentVersion = documentPolicy?.publishedVersion ?? null;
      const legalDocumentVersionId = documentPolicy?.publishedVersionId ?? null;
      const contentHash = documentPolicy?.publishedContentHash ?? null;

      await tx.userConsentState.upsert({
        where: {
          userId_document_channel: {
            userId: input.userId,
            document: input.document,
            channel,
          },
        },
        create: {
          userId: input.userId,
          document: input.document,
          channel,
          legalDocumentVersionId,
          status: "GRANTED",
          grantedAt: occurredAt,
          contentHash,
          ipHash,
          userAgent: input.userAgent ?? null,
          evidence: input.evidence ?? undefined,
        },
        update: {
          legalDocumentVersionId,
          status: "GRANTED",
          grantedAt: occurredAt,
          revokedAt: null,
          contentHash,
          ipHash,
          userAgent: input.userAgent ?? null,
          evidence: input.evidence ?? undefined,
        },
      });

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
          documentVersion,
          contentHash,
          channel,
          ipHash,
          userAgent: input.userAgent ?? null,
          evidence: input.evidence ?? undefined,
        },
        update: {
          grantedAt: occurredAt,
          revokedAt: null,
          documentVersion,
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
          documentVersion,
          legalDocumentVersionId,
          contentHash,
          action: "GRANTED",
          channel,
          idempotencyKey: input.idempotencyKey ?? null,
          occurredAt,
          ipHash,
          userAgent: input.userAgent ?? null,
          evidence: input.evidence ?? undefined,
        },
      });
    });
  } catch (error) {
    if (input.idempotencyKey && isIdempotencyConflict(error)) return;
    throw error;
  }
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
  const isMarketing = document === "MARKETING";

  await prisma.$transaction(async (tx) => {
    const policy = isMarketing ? null : await getConsentPolicySnapshotFresh(tx);
    const documentPolicy = policy ? getConsentPolicyForDocument(policy, document) : null;
    const documentVersion = documentPolicy?.publishedVersion ?? null;
    const legalDocumentVersionId = documentPolicy?.publishedVersionId ?? null;

    const stateResult = await tx.userConsentState.updateMany({
      where: {
        userId,
        document,
        channel,
        revokedAt: null,
      },
      data: {
        status: "REVOKED",
        revokedAt: occurredAt,
      },
    });

    const result = await tx.privacyConsent.updateMany({
      where: {
        userId,
        document,
        channel,
        revokedAt: null,
      },
      data: { revokedAt: occurredAt },
    });

    if (result.count === 0 && stateResult.count === 0) return;

    await tx.consentEvent.create({
      data: {
        userId,
        subjectType: "USER",
        subjectHash: hashIdentifier(userId),
        project: resolveConsentProject(channel),
        document,
        version,
        documentVersion,
        legalDocumentVersionId,
        contentHash: documentPolicy?.publishedContentHash ?? null,
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

import { prisma } from "@/lib/prisma";
import { hashIdentifier } from "@/lib/auth-security";
import type { Prisma, PrivacyConsentDocument } from "@/generated/prisma/client";

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

  const ipHash = input.ip ? hashIdentifier(input.ip) : null;

  await prisma.privacyConsent.upsert({
    where: {
      userId_document_version_channel: {
        userId: input.userId,
        document: input.document,
        version,
        channel: input.channel ?? "web",
      },
    },
    create: {
      userId: input.userId,
      document: input.document,
      version,
      channel: input.channel ?? "web",
      ipHash,
      userAgent: input.userAgent ?? null,
      evidence: input.evidence ?? undefined,
    },
    update: {
      grantedAt: new Date(),
      revokedAt: null,
      ipHash,
      userAgent: input.userAgent ?? null,
      evidence: input.evidence ?? undefined,
    },
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

  await prisma.privacyConsent.updateMany({
    where: {
      userId,
      document,
      version,
      channel,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });
}

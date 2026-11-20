import { prisma } from "@/lib/prisma";
import {
  getConsentPolicyForDocument,
  getConsentPolicySnapshot,
} from "@/lib/consent-policy";
import {
  PRIVACY_POLICY_VERSION,
  REQUIRED_CONSENT_DOCUMENTS,
  TERMS_OF_SERVICE_VERSION,
  getDocumentVersion,
} from "@/lib/consent-constants";
import type { PrivacyConsentDocument } from "@/generated/prisma/client";

export interface ConsentStatus {
  required: boolean;
  missing: PrivacyConsentDocument[];
  versions: {
    privacy: string;
    terms: string;
  };
}

export async function getConsentStatus(userId: string): Promise<ConsentStatus> {
  const [policy, rows] = await Promise.all([
    getConsentPolicySnapshot(),
    prisma.privacyConsent.findMany({
      where: {
        userId,
        revokedAt: null,
        document: { in: ["PRIVACY", "TERMS"] },
      },
      select: {
        document: true,
        version: true,
        documentVersion: true,
        grantedAt: true,
      },
      orderBy: { grantedAt: "desc" },
    }),
  ]);

  const latestByDocument = new Map<PrivacyConsentDocument, (typeof rows)[number]>();
  for (const row of rows) {
    if (!latestByDocument.has(row.document)) {
      latestByDocument.set(row.document, row);
    }
  }

  const isCurrent = (document: PrivacyConsentDocument): boolean => {
    const row = latestByDocument.get(document);
    if (!row) return false;

    const documentPolicy = getConsentPolicyForDocument(policy, document);
    if (documentPolicy.requiredVersion != null) {
      return (
        row.documentVersion != null &&
        row.documentVersion >= documentPolicy.requiredVersion
      );
    }

    if (documentPolicy.publishedVersion != null) return true;
    return row.version === getDocumentVersion(document);
  };

  const missing = REQUIRED_CONSENT_DOCUMENTS.filter((document) => !isCurrent(document));

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

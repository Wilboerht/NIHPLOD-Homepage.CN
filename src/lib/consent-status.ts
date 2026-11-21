import { prisma } from "@/lib/prisma";
import {
  getConsentPolicyForDocument,
  getConsentPolicySnapshot,
  type ConsentDocumentPolicy,
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

type StateRow = {
  document: PrivacyConsentDocument;
  legalDocumentVersionId: string | null;
  status: "GRANTED" | "REVOKED";
  grantedAt: Date;
  revokedAt: Date | null;
  legalDocumentVersion: { id: string; version: number } | null;
};

type LegacyRow = {
  document: PrivacyConsentDocument;
  version: string;
  documentVersion: number | null;
  grantedAt: Date;
};

function isStateCurrent(row: StateRow, policy: ConsentDocumentPolicy): boolean {
  if (row.status !== "GRANTED" || row.revokedAt) return false;

  if (policy.requiredVersionId && row.legalDocumentVersionId === policy.requiredVersionId) {
    return true;
  }

  if (policy.requiredVersion != null) {
    return (
      row.legalDocumentVersion != null && row.legalDocumentVersion.version >= policy.requiredVersion
    );
  }

  return true;
}

function isLegacyCurrent(row: LegacyRow, policy: ConsentDocumentPolicy): boolean {
  if (policy.requiredVersion != null) {
    return row.documentVersion != null && row.documentVersion >= policy.requiredVersion;
  }

  if (policy.publishedVersion != null) return true;
  return row.version === getDocumentVersion(row.document);
}

async function getStateRows(userId: string): Promise<StateRow[]> {
  return prisma.userConsentState.findMany({
    where: {
      userId,
      document: { in: ["PRIVACY", "TERMS"] },
    },
    select: {
      document: true,
      legalDocumentVersionId: true,
      status: true,
      grantedAt: true,
      revokedAt: true,
      legalDocumentVersion: { select: { id: true, version: true } },
    },
  });
}

async function getLegacyRows(
  userId: string,
  documents: PrivacyConsentDocument[]
): Promise<LegacyRow[]> {
  return prisma.privacyConsent.findMany({
    where: {
      userId,
      document: { in: documents },
      revokedAt: null,
    },
    select: {
      document: true,
      version: true,
      documentVersion: true,
      grantedAt: true,
    },
    orderBy: { grantedAt: "desc" },
  });
}

export async function getConsentStatus(userId: string): Promise<ConsentStatus> {
  const [policy, stateRows] = await Promise.all([getConsentPolicySnapshot(), getStateRows(userId)]);

  const stateByDocument = new Map<PrivacyConsentDocument, StateRow>();
  for (const row of stateRows) {
    const current = stateByDocument.get(row.document);
    if (!current || row.grantedAt.getTime() > current.grantedAt.getTime()) {
      stateByDocument.set(row.document, row);
    }
  }

  const documentsNeedingLegacy = REQUIRED_CONSENT_DOCUMENTS.filter((document) => {
    const state = stateByDocument.get(document);
    if (!state) return true;
    return (
      state.status === "GRANTED" &&
      !state.revokedAt &&
      !state.legalDocumentVersionId &&
      !state.legalDocumentVersion
    );
  });
  const legacyRows =
    documentsNeedingLegacy.length > 0 ? await getLegacyRows(userId, documentsNeedingLegacy) : [];
  const legacyByDocument = new Map<PrivacyConsentDocument, LegacyRow>();
  for (const row of legacyRows) {
    if (!legacyByDocument.has(row.document)) {
      legacyByDocument.set(row.document, row);
    }
  }

  const isCurrent = (document: PrivacyConsentDocument): boolean => {
    const documentPolicy = getConsentPolicyForDocument(policy, document);
    const state = stateByDocument.get(document);
    if (state) {
      if (state.status !== "GRANTED" || state.revokedAt) return false;
      if (!state.legalDocumentVersionId && !state.legalDocumentVersion) {
        const legacy = legacyByDocument.get(document);
        if (legacy) return isLegacyCurrent(legacy, documentPolicy);
      }
      return isStateCurrent(state, documentPolicy);
    }

    const legacy = legacyByDocument.get(document);
    if (legacy) return isLegacyCurrent(legacy, documentPolicy);

    return false;
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

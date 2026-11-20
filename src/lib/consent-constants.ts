import type { PrivacyConsentDocument } from "@/generated/prisma/client";

export const PRIVACY_POLICY_VERSION = "2026-11-19";
export const TERMS_OF_SERVICE_VERSION = "2026-11-19";
export const MARKETING_CONSENT_VERSION = "2026-11-19";

export const REQUIRED_CONSENT_DOCUMENTS = [
  "PRIVACY",
  "TERMS",
] as const satisfies readonly PrivacyConsentDocument[];

export const CONSENT_EVIDENCE_RETENTION_YEARS = 3;

export function getDocumentVersion(document: PrivacyConsentDocument): string | null {
  if (document === "PRIVACY") return PRIVACY_POLICY_VERSION;
  if (document === "TERMS") return TERMS_OF_SERVICE_VERSION;
  if (document === "MARKETING") return MARKETING_CONSENT_VERSION;
  return null;
}

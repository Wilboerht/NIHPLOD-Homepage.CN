export type ConsentDocumentKey = "privacy" | "terms" | "marketing" | "face" | "health" | "ai";

export type ConsentDocumentState =
  "current" | "outdated" | "revoked" | "missing" | "unversioned" | "not_applicable";

export type ConsentProjectKey = "main" | "points" | "skin" | "kf" | "ba" | "recruit" | "legacy";

export type ConsentProjectTransportState = "ok" | "degraded" | "not_linked";

export type ConsentOverallState = ConsentDocumentState | "not_linked" | "degraded";

export interface ConsentDocumentStatus {
  state: ConsentDocumentState;
  version: string | null;
  documentVersion?: number | null;
  grantedAt: string | null;
  revokedAt: string | null;
  channel: string | null;
}

export interface ConsentEventSummary {
  action: "GRANTED" | "REVOKED";
  document: string;
  version: string;
  channel: string;
  occurredAt: string;
}

export interface ConsentProjectStatus {
  key: ConsentProjectKey;
  label: string;
  state: ConsentProjectTransportState;
  overall: ConsentOverallState;
  documents: Partial<Record<ConsentDocumentKey, ConsentDocumentStatus>>;
  lastUpdatedAt: string | null;
  note?: string;
  events: ConsentEventSummary[];
}

export interface UserConsentOverview {
  fetchedAt: string;
  currentVersions: {
    main: { privacy: string; terms: string };
    skin: { privacy: string; terms: string } | null;
  };
  summary: {
    current: number;
    outdated: number;
    missing: number;
    revoked: number;
    unversioned: number;
    notApplicable: number;
    notLinked: number;
    degraded: number;
  };
  projects: ConsentProjectStatus[];
  warnings: string[];
}

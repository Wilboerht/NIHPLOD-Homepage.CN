import type { BaComplaintListItem } from "@/lib/ba-complaints";

export interface BaDashboardData {
  certificates: {
    total: number;
    valid: number;
    pending: number;
    expiring30d: number;
  };
  complaints: {
    pending: number;
    investigating: number;
    resolvedThisMonth: number;
    recent: BaComplaintListItem[];
  };
  dealers: {
    total: number;
  };
  admins: {
    total: number;
    sso: number;
    local: number;
  };
  recentAudit: {
    id: string;
    action: string;
    actorName: string | null;
    createdAt: string;
  }[];
  generatedAt: string;
}

export type BaDashboardDegradedReason =
  | "not_configured"
  | "unauthorized"
  | "rate_limited"
  | "upstream_error";

export interface BaDashboardPayload {
  dashboard: BaDashboardData | null;
  degraded: boolean;
  reason?: BaDashboardDegradedReason;
  canReadComplaints?: boolean;
}

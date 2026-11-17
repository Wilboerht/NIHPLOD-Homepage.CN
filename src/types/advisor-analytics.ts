import type { AdvisorDashboardDegradedReason } from "./advisor-dashboard";

export type AdvisorAnalyticsSection = "funnel" | "reportQuality" | "aiCosts";

export interface AdvisorFunnelSummary {
  days: number;
  totalSessions: number;
  reportCompleted: number;
  resultViewed: number;
  reportCompletionRate: number;
}

export interface AdvisorReportQualitySummary {
  days: number;
  totalReports: number;
  aiNarrative: number;
  fallback: number;
  fallbackRate: number;
  avgDurationMs: number;
}

export interface AdvisorAICostSummary {
  period: string;
  totalCost: number;
  totalCalls: number;
  failedCalls: number;
  successRate: number;
  avgDurationMs: number;
}

export interface AdvisorAnalytics {
  funnel: AdvisorFunnelSummary | null;
  reportQuality: AdvisorReportQualitySummary | null;
  aiCosts: AdvisorAICostSummary | null;
  failed: AdvisorAnalyticsSection[];
  generatedAt: string;
}

export interface AdvisorAnalyticsPayload {
  analytics: AdvisorAnalytics | null;
  degraded: boolean;
  reason?: AdvisorDashboardDegradedReason;
}

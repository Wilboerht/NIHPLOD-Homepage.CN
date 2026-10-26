export interface AdvisorDashboardOverview {
  totalUsers: number;
  totalProducts: number;
  totalSessions: number;
  completedSessions: number;
  todaySessions: number;
  todayCompletions: number;
  completionRate: number;
}

export interface AdvisorSkinTypeDistributionItem {
  key: string;
  name: string;
  value: number;
  fill: string;
}

export interface AdvisorWeeklyGrowthItem {
  day: string;
  started: number;
  completed: number;
}

export interface AdvisorAIHealth {
  budget: {
    dailyTokens: number;
    dailyCost: number;
    monthlyTokens: number;
    monthlyCost: number;
  };
  usage: {
    dailyTokens: number;
    dailyCost: number;
    monthlyTokens: number;
    monthlyCost: number;
  };
  dailyUsagePercent: number;
  monthlyUsagePercent: number;
  exhausted: boolean;
  exhaustedReason: string | null;
  circuits: Array<{
    service: string;
    state: string;
    failureCount: number;
    isBlocked: boolean;
  }>;
  status: "healthy" | "warning" | "critical";
}

export interface AdvisorSubsiteDashboard {
  overview: AdvisorDashboardOverview;
  skinTypeDistribution: AdvisorSkinTypeDistributionItem[];
  weeklyGrowth: AdvisorWeeklyGrowthItem[];
  health: AdvisorAIHealth | null;
  generatedAt: string;
}

export type AdvisorDashboardDegradedReason =
  "not_configured" | "unauthorized" | "rate_limited" | "upstream_error";

export interface AdvisorDashboardPayload {
  dashboard: AdvisorSubsiteDashboard | null;
  degraded: boolean;
  reason?: AdvisorDashboardDegradedReason;
}

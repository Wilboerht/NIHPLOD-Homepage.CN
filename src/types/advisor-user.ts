export interface AdvisorUserAccount {
  role: string;
  dailyTestLimit: number;
  createdAt: string;
  lastActiveAt: string | null;
}

export interface AdvisorUserUsage {
  level: string | null;
  totalUsed: number;
  todayUsed: number;
  quota: {
    lifetimeLimit: number | null;
    dailyLimit: number | null;
    unlimited: boolean;
  };
  remaining: number | null;
  todayCheckedIn?: boolean;
}

export interface AdvisorUserSession {
  sessionId: string;
  createdAt: string;
  completedAt: string | null;
  overallScore: number | null;
  skinTypeLabel: string | null;
}

export interface AdvisorUserDiary {
  date: string;
  skinState: string;
  tags: string[];
}

export interface AdvisorUserOverview {
  account: AdvisorUserAccount | null;
  usage: AdvisorUserUsage;
  counts: {
    sessions: number;
    completedSessions: number;
    diaryEntries: number;
  };
  recentSessions: AdvisorUserSession[];
  recentDiary: AdvisorUserDiary[];
}

export interface AdvisorUserSnapshot {
  role: string;
  dailyTestLimit: number;
}

export interface AdvisorUserUpdateResult {
  changed: boolean;
  previous: AdvisorUserSnapshot;
  current: AdvisorUserSnapshot;
  revokedRefreshTokens: number;
}

export type AdvisorOverviewDegradedReason =
  | "not_configured"
  | "unauthorized"
  | "rate_limited"
  | "upstream_error";

export interface AdvisorOverviewPayload {
  overview: AdvisorUserOverview | null;
  degraded: boolean;
  reason?: AdvisorOverviewDegradedReason;
}

export interface AdvisorReportListItem {
  sessionId: string;
  createdAt: string;
  completedAt: string;
  overallScore: number | null;
  skinTypeLabel: string | null;
  persona: string | null;
  personaLabel: string | null;
  reportVersion: number | null;
  dataSource: string | null;
  expired: boolean;
}

export interface AdvisorReportPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface AdvisorReportListPayload {
  reports: AdvisorReportListItem[];
  pagination: AdvisorReportPagination;
}

export interface AdvisorReportQuestionnaire {
  ageRange?: string;
  primaryConcerns?: string[];
  allergies?: string[];
  pregnancy?: string;
  medicalBeauty?: string;
  sleepQuality?: string;
  stressLevel?: string;
  menstrualCycle?: string;
  waterIntake?: string;
  exerciseFrequency?: string;
  dietaryHabits?: string;
  sunExposure?: string;
  skincareFrequency?: string;
  skincareLevel?: string;
  budget?: string;
}

export interface AdvisorReportSummary {
  found?: boolean;
  sessionId?: string;
  nickname?: string;
  gender?: "male" | "female" | null;
  skinType?: string;
  skinTypeLabel?: string;
  skinAge?: number | null;
  overallScore?: number | null;
  percentile?: number | null;
  issues?: Array<{ label: string; score: number }>;
  dimensions?: Array<{ key: string; label: string; score: number }>;
  concerns?: string[];
  questionnaire?: AdvisorReportQuestionnaire;
  dataSource?: string;
  createdAt?: string;
}

export interface AdvisorReportDimension {
  score?: number;
  percentile?: number;
  grade?: "excellent" | "good" | "average" | "fair" | "poor";
  details?: string;
  blackheads?: number;
  pimples?: number;
}

export interface AdvisorReportZoneData {
  condition?: string;
  advice?: string;
  wrinkles?: number;
  oil?: number;
  texture?: number;
  spots?: number;
  redness?: number;
  darkCircles?: number;
  firmness?: number;
  contour?: number;
}

export interface AdvisorReportFaceAnalysis {
  validation?: { isValid: boolean; message?: string };
  skinType?: { type: string; confidence?: number; description?: string };
  skinAge?: { estimated?: number; factors?: string[] };
  gender?: { value: "male" | "female"; confidence?: number };
  dimensions?: Record<string, AdvisorReportDimension | undefined>;
  hydration?: { level: string; percent?: number; description?: string };
  overallScore?: number;
  summary?: string;
  recommendations?: string[];
  skinConditions?: Array<{
    condition: string;
    severity?: "mild" | "moderate" | "severe";
    area?: string;
    description?: string;
  }>;
  zoneAnalysis?: {
    forehead?: AdvisorReportZoneData;
    tZone?: AdvisorReportZoneData;
    leftCheek?: AdvisorReportZoneData;
    rightCheek?: AdvisorReportZoneData;
    eyeArea?: AdvisorReportZoneData;
    jawline?: AdvisorReportZoneData;
  };
  labAnalysis?: {
    glogau?: { value: string; status: string };
    homogeneity?: { value?: number; unit?: string; range?: string; status: string };
    wrinkleGrade?: { value: string; status: string };
  };
}

export interface AdvisorReportIssue {
  title: string;
  severity: "mild" | "moderate" | "severe";
  observation: string;
  directCauses: string;
  indirectCauses: string;
  skincarePlan: string;
  lifestylePlan: string;
  medicalBoundary?: string;
  relatedDimensions?: string[];
}

export interface AdvisorReportConsultant {
  overview: string;
  issues: AdvisorReportIssue[];
  strengths: string[];
  routineNote?: string;
  productReasons?: Array<{ id: string | number; reason?: string }>;
}

export interface AdvisorReportProduct {
  id: string;
  name: string;
  category: string;
  reason: string;
  image?: string;
  images?: string[] | null;
  price?: string;
  description?: string | null;
  keyIngredients?: string[];
  benefits?: string[];
  origin?: string | null;
  capacity?: string | null;
  howToUse?: string | null;
  source?: "persona" | "algorithm" | "ai";
}

export interface AdvisorReportResult {
  skinProfile: {
    type: string;
    typeLabel: string;
    concerns: string[];
    skinAge?: number;
  };
  analysis: {
    summary: string;
    details: string[];
    lifestyleTips?: string[];
  };
  products?: AdvisorReportProduct[];
  dataSource?: string;
  persona?: string;
  expiresAt?: string;
  analyzedAt?: string;
  skinState?: string;
  nickname?: string;
  reportVersion?: number;
  consultantReport?: AdvisorReportConsultant;
}

export interface AdvisorReportDetail {
  sessionId: string;
  createdAt: string;
  completedAt: string;
  expiresAt: string | null;
  expired: boolean;
  personaLabel: string | null;
  summary: AdvisorReportSummary;
  result: AdvisorReportResult;
  faceAnalysis: AdvisorReportFaceAnalysis | null;
}

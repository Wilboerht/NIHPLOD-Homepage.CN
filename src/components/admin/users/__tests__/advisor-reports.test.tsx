// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
}));

vi.mock("@/lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-client")>("@/lib/api-client");
  return { ...actual, apiGet: mocks.apiGet };
});

import { AdvisorReports } from "@/components/admin/users/AdvisorReports";

const listPayload = {
  reports: [
    {
      sessionId: "session-1",
      createdAt: "2026-10-01T10:00:00.000Z",
      completedAt: "2026-10-01T10:10:00.000Z",
      overallScore: 82,
      skinTypeLabel: "混合偏干",
      persona: "desert",
      personaLabel: "沙漠派",
      reportVersion: 2,
      dataSource: "comprehensive",
      expired: false,
    },
  ],
  pagination: { page: 1, limit: 8, total: 1, totalPages: 1 },
};

const detail = {
  sessionId: "session-1",
  createdAt: "2026-10-01T10:00:00.000Z",
  completedAt: "2026-10-01T10:10:00.000Z",
  expiresAt: null,
  expired: false,
  personaLabel: "沙漠派",
  summary: {
    overallScore: 82,
    skinAge: 28,
    skinTypeLabel: "混合偏干",
    percentile: 80,
    dataSource: "comprehensive",
    questionnaire: {
      ageRange: "26-30岁",
      primaryConcerns: ["色斑/暗沉"],
      allergies: ["无过敏史"],
    },
  },
  result: {
    reportVersion: 2,
    skinProfile: { type: "combination_dry", typeLabel: "混合偏干", concerns: ["spots"] },
    analysis: { summary: "整体稳定。", details: ["两颊偏干"], lifestyleTips: ["规律作息"] },
    consultantReport: {
      overview: "你的肌肤整体稳定。",
      issues: [
        {
          title: "两颊干燥",
          severity: "mild",
          observation: "两颊有轻微干燥。",
          directCauses: "屏障水分不足。",
          indirectCauses: "空调环境。",
          skincarePlan: "加强保湿。",
          lifestylePlan: "多喝水。",
          medicalBoundary: "",
          relatedDimensions: ["waterOil"],
        },
      ],
      strengths: ["T 区油脂控制较好"],
      routineNote: "保持现有节奏。",
    },
    products: [
      { id: "p1", name: "修护面霜", category: "面霜", reason: "适合两颊干燥", price: "280" },
    ],
  },
  faceAnalysis: {
    overallScore: 82,
    skinAge: { estimated: 28 },
    dimensions: {
      waterOil: { score: 70, grade: "good", details: "水油基本平衡" },
    },
    skinConditions: [],
    recommendations: ["注意防晒"],
  },
};

describe("AdvisorReports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.apiGet.mockImplementation((url: string) =>
      url.includes("/reports/session-1") ? Promise.resolve(detail) : Promise.resolve(listPayload)
    );
  });

  it("加载列表并可查看完整报告正文", async () => {
    render(<AdvisorReports userId="user-1" />);

    expect(await screen.findByText("混合偏干")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "查看报告" }));

    expect(await screen.findByText("完整测肤报告")).toBeInTheDocument();
    expect(screen.getByText("顾问诊断")).toBeInTheDocument();
    expect(screen.getByText("两颊干燥")).toBeInTheDocument();
    expect(screen.getByText("十维评分")).toBeInTheDocument();
    expect(screen.getByText("产品推荐")).toBeInTheDocument();
    expect(screen.getByText("修护面霜")).toBeInTheDocument();
    expect(screen.getByText("问卷档案")).toBeInTheDocument();
    expect(screen.getByText("26-30岁")).toBeInTheDocument();
    expect(screen.queryByText("原始数据")).not.toBeInTheDocument();
  });
});

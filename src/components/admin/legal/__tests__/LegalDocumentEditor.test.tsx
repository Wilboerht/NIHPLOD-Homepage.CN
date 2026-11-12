// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/Toast";

const mocks = vi.hoisted(() => {
  class MockApiError extends Error {
    constructor(public readonly code: string) {
      super(code);
    }
  }
  const content = {
    title: "服务条款",
    description: "使用前请阅读",
    lastUpdated: "2026年9月7日",
    sections: [{ id: "terms-1", title: "1. 隐私权", body: "请阅读隐私政策。" }],
  };
  const document = {
    slug: "terms",
    title: "服务条款",
    publishedVersion: 1,
    publishedAt: "2026-09-07T00:00:00.000Z",
    publishedBy: "Owner",
    hasDraft: false,
    draftRevision: 1,
    draftUpdatedAt: null,
    draftUpdatedBy: null,
    contentSource: "published",
    content,
    publishedContent: content,
    draftContent: null,
  };
  return {
    document,
    apiGet: vi.fn().mockResolvedValue(document),
    can: vi.fn().mockReturnValue(true),
    MockApiError,
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/api-client", () => ({
  ApiError: mocks.MockApiError,
  apiGet: mocks.apiGet,
  apiPut: vi.fn(),
  apiPost: vi.fn(),
  apiDelete: vi.fn(),
  getApiErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

vi.mock("@/hooks/useAdminPermissions", () => ({
  useAdminPermissions: () => ({ can: mocks.can, role: "owner" }),
}));

vi.mock("@/hooks/useTotpConfirm", () => ({
  useTotpConfirm: () => ({ requireTotp: vi.fn(), totpModal: null }),
  isTotpRequired: () => false,
}));

import { LegalDocumentEditor } from "../LegalDocumentEditor";

describe("LegalDocumentEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.apiGet.mockResolvedValue(mocks.document);
    mocks.can.mockReturnValue(true);
  });

  it("加载文档并渲染基本信息、章节与发布状态", async () => {
    render(
      <ToastProvider>
        <LegalDocumentEditor slug="terms" />
      </ToastProvider>
    );

    expect(await screen.findByText("服务条款 · 法务文档")).toBeInTheDocument();
    expect(screen.getByText("基本信息")).toBeInTheDocument();
    expect(screen.getByLabelText("页面描述")).toHaveValue("使用前请阅读");
    expect(screen.getByLabelText("章节标题")).toHaveValue("1. 隐私权");
    expect(screen.getByText("已发布 v1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /保存草稿/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^发布$/ })).toBeInTheDocument();
  });

  it("无写权限时隐藏编辑与发布操作", async () => {
    mocks.can.mockReturnValue(false);
    render(
      <ToastProvider>
        <LegalDocumentEditor slug="terms" />
      </ToastProvider>
    );

    expect(await screen.findByText("服务条款 · 法务文档")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /保存草稿/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^发布$/ })).toBeNull();
    expect(screen.getByText("只读")).toBeInTheDocument();
    expect(screen.getByLabelText("章节标题")).toHaveAttribute("readonly");
  });
});

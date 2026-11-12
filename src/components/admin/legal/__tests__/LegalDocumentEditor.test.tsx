// @vitest-environment jsdom

import { fireEvent, render, screen, within } from "@testing-library/react";
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
    apiDelete: vi.fn(),
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
  apiDelete: mocks.apiDelete,
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
    const publishButton = screen.getByRole("button", { name: /^发布$/ });
    expect(publishButton).toBeInTheDocument();
    expect(publishButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("页面描述"), {
      target: { value: "修改后的描述" },
    });
    expect(publishButton).toBeEnabled();
  });

  it("未发布过版本时允许首次发布", async () => {
    mocks.apiGet.mockResolvedValue({
      ...mocks.document,
      publishedVersion: 0,
      publishedAt: null,
      publishedBy: null,
      contentSource: "default",
      publishedContent: null,
    });
    render(
      <ToastProvider>
        <LegalDocumentEditor slug="terms" />
      </ToastProvider>
    );

    const publishButton = await screen.findByRole("button", { name: /^发布$/ });
    expect(publishButton).toBeEnabled();
  });

  it("丢弃草稿遇到 STALE_UPDATE 时自动刷新", async () => {
    mocks.apiGet.mockResolvedValue({
      ...mocks.document,
      hasDraft: true,
      draftRevision: 2,
      draftContent: mocks.document.content,
      contentSource: "draft",
      draftUpdatedBy: "Owner",
      draftUpdatedAt: "2026-11-12T00:00:00.000Z",
    });
    mocks.apiDelete.mockRejectedValue(new mocks.MockApiError("STALE_UPDATE"));

    render(
      <ToastProvider>
        <LegalDocumentEditor slug="terms" />
      </ToastProvider>
    );

    await screen.findByText("服务条款 · 法务文档");
    fireEvent.click(screen.getByRole("button", { name: "丢弃草稿" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "丢弃草稿" }));

    expect(await screen.findByText("草稿已被其他管理员修改，正在刷新最新内容")).toBeInTheDocument();
    expect(mocks.apiGet.mock.calls.length).toBeGreaterThanOrEqual(2);
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

// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LazyMotion, domAnimation } from "framer-motion";
import { ToastProvider } from "@/components/ui/Toast";
import { LegalVersionHistory } from "../LegalVersionHistory";
import type { LegalDocumentContent } from "@/types/legal";

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}));

vi.mock("@/lib/api-client", () => ({
  apiGet: mocks.apiGet,
  apiPost: mocks.apiPost,
  getApiErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

const content: LegalDocumentContent = {
  title: "服务条款",
  description: "描述",
  lastUpdated: "2026年11月12日",
  sections: [{ id: "terms-1", title: "1. 隐私权", body: "正文" }],
};

const versionBase = {
  note: null,
  contentHash: "hash",
  sectionCount: 1,
  createdAt: "2026-11-12T00:00:00.000Z",
  createdBy: "Owner",
};

describe("LegalVersionHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.apiGet.mockResolvedValue({
      versions: [
        { ...versionBase, id: "v3", version: 3, isCurrentPublished: true },
        { ...versionBase, id: "v2", version: 2, isCurrentPublished: false },
      ],
      nextCursor: null,
    });
  });

  it("当前线上版本不允许恢复为草稿", async () => {
    render(
      <LazyMotion features={domAnimation}>
        <ToastProvider>
          <LegalVersionHistory
            open
            onClose={vi.fn()}
            slug="terms"
            currentContent={content}
            revision={1}
            readOnly={false}
            onRestored={vi.fn()}
          />
        </ToastProvider>
      </LazyMotion>
    );

    expect(await screen.findByText("当前线上")).toBeInTheDocument();
    const restoreButtons = screen.getAllByRole("button", { name: "恢复为草稿" });
    expect(restoreButtons).toHaveLength(2);
    expect(restoreButtons[0]).toBeDisabled();
    expect(restoreButtons[1]).toBeEnabled();
  });

  it("可选择任意两个版本进行对比", async () => {
    const v2Detail = {
      ...versionBase,
      id: "v2",
      version: 2,
      isCurrentPublished: false,
      content: {
        ...content,
        sections: [{ ...content.sections[0], body: "v2 正文" }],
      },
    };
    const v3Detail = {
      ...versionBase,
      id: "v3",
      version: 3,
      isCurrentPublished: true,
      content,
    };
    mocks.apiGet.mockImplementation((url: string) => {
      if (url.endsWith("/versions/v2")) return Promise.resolve(v2Detail);
      if (url.endsWith("/versions/v3")) return Promise.resolve(v3Detail);
      return Promise.resolve({
        versions: [
          { ...versionBase, id: "v3", version: 3, isCurrentPublished: true },
          { ...versionBase, id: "v2", version: 2, isCurrentPublished: false },
        ],
        nextCursor: null,
      });
    });

    render(
      <LazyMotion features={domAnimation}>
        <ToastProvider>
          <LegalVersionHistory
            open
            onClose={vi.fn()}
            slug="terms"
            currentContent={content}
            revision={1}
            readOnly={false}
            onRestored={vi.fn()}
          />
        </ToastProvider>
      </LazyMotion>
    );

    await screen.findByText("当前线上");
    fireEvent.change(screen.getByLabelText("基准"), { target: { value: "v2" } });
    fireEvent.change(screen.getByLabelText("对比"), { target: { value: "v3" } });
    fireEvent.click(screen.getByRole("button", { name: "对比" }));

    expect(await screen.findByText("版本对比")).toBeInTheDocument();
    expect(await screen.findByText("修改")).toBeInTheDocument();
    expect(mocks.apiGet).toHaveBeenCalledWith("/api/admin/legal/terms/versions/v2");
    expect(mocks.apiGet).toHaveBeenCalledWith("/api/admin/legal/terms/versions/v3");
  });
});

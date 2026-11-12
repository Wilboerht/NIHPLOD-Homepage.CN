// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LazyMotion, domAnimation } from "framer-motion";
import { LegalPublishDialog } from "../LegalPublishDialog";
import type { LegalDocumentContent } from "@/types/legal";

const content: LegalDocumentContent = {
  title: "服务条款",
  description: "描述",
  lastUpdated: "2026年11月12日",
  sections: [{ id: "terms-1", title: "1. 隐私权", body: "正文" }],
};

describe("LegalPublishDialog", () => {
  it("发布说明必填，至少 2 个字符后才能确认", () => {
    const onConfirm = vi.fn();
    render(
      <LazyMotion features={domAnimation}>
        <LegalPublishDialog
          open
          onClose={vi.fn()}
          onConfirm={onConfirm}
          loading={false}
          content={content}
          baseContent={null}
          nextVersion={1}
        />
      </LazyMotion>
    );

    const noteInput = screen.getByLabelText(/发布说明/);
    const confirmButton = screen.getByRole("button", { name: /确认发布 v1/ });
    expect(confirmButton).toBeDisabled();

    fireEvent.change(noteInput, { target: { value: "一" } });
    expect(confirmButton).toBeDisabled();

    fireEvent.change(noteInput, { target: { value: "法务更新" } });
    expect(confirmButton).toBeEnabled();
    fireEvent.click(confirmButton);
    expect(onConfirm).toHaveBeenCalledWith("法务更新");
  });
});

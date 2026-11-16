// @vitest-environment jsdom

import React from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  BaCertificateIssueDialog,
  type BaCertificateIssueDialogProps,
} from "@/components/admin/BaCertificateIssueDialog";
import type { BaCertificateListItem } from "@/lib/ba-certificates";

const apiRequestMock = vi.fn();

vi.mock("@/lib/api-client", () => ({
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
  getApiErrorMessage: (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback,
}));

const rect = {
  width: 100,
  height: 40,
  top: 0,
  left: 0,
  right: 100,
  bottom: 40,
  x: 0,
  y: 0,
  toJSON: () => ({}),
} as DOMRect;

beforeAll(() => {
  HTMLElement.prototype.getClientRects = function getClientRects() {
    return [rect] as unknown as DOMRectList;
  };
});

beforeEach(() => {
  apiRequestMock.mockReset();
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:seal-preview"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
  const root = document.createElement("div");
  root.id = "app-root";
  document.body.appendChild(root);
});

afterEach(() => {
  cleanup();
  document.getElementById("app-root")?.remove();
  vi.restoreAllMocks();
});

const certificate: BaCertificateListItem = {
  id: "cert-1",
  certNumber: "BAVP-2026-TEST",
  status: "PENDING",
  displayStatus: "PENDING",
  companyName: "测试公司",
  shopName: "测试店铺",
  scopeText: "授权范围内容",
  authorizer: "旎柏（上海）商贸有限公司",
  phoneMasked: "138****0000",
  phone: null,
  startDate: "2026-01-01",
  endDate: "2026-12-31",
  auditorName: "提交人",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  artifact: { pngReady: false, pdfReady: false },
  allowedActions: {},
};

type ConfirmHandler = BaCertificateIssueDialogProps["onConfirm"];

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function renderDialog(onConfirm: ConfirmHandler) {
  const onClose = vi.fn();
  render(
    <BaCertificateIssueDialog
      open
      certificate={certificate}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
  return { onClose };
}

function selectSealFile(file: File) {
  fireEvent.change(screen.getByLabelText("选择自定义签章图片"), {
    target: { files: [file] },
  });
}

describe("BaCertificateIssueDialog", () => {
  it("展示只读摘要和默认公章", () => {
    renderDialog(vi.fn<ConfirmHandler>(async () => "issued"));

    expect(screen.getByRole("dialog", { name: "核发证书" })).toBeInTheDocument();
    expect(screen.getByText("BAVP-2026-TEST")).toBeInTheDocument();
    expect(screen.getByText("测试公司")).toBeInTheDocument();
    expect(screen.getByText("系统默认公章")).toBeInTheDocument();
  });

  it("未操作签章时不携带 sealImage", async () => {
    const onConfirm = vi.fn<ConfirmHandler>(async () => "issued");
    renderDialog(onConfirm);

    fireEvent.click(screen.getByRole("button", { name: "确认核发" }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    const payload = onConfirm.mock.calls[0][0];
    expect(payload.draft).not.toHaveProperty("sealImage");
    expect(payload.draft.companyName).toBe("测试公司");
    expect(payload.idempotencyKey).toBeTruthy();
  });

  it("上传自定义签章后携带上传 URL", async () => {
    apiRequestMock.mockResolvedValue({ url: "/uploads/certificates/custom.png" });
    const onConfirm = vi.fn<ConfirmHandler>(async () => "issued");
    renderDialog(onConfirm);

    selectSealFile(new File(["x"], "custom.png", { type: "image/png" }));
    await waitFor(() => expect(screen.getByText("自定义签章")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "确认核发" }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onConfirm.mock.calls[0][0].draft.sealImage).toBe(
      "/uploads/certificates/custom.png"
    );
  });

  it("上传后恢复默认会显式携带空 sealImage", async () => {
    apiRequestMock.mockResolvedValue({ url: "/uploads/certificates/custom.png" });
    const onConfirm = vi.fn<ConfirmHandler>(async () => "issued");
    renderDialog(onConfirm);

    selectSealFile(new File(["x"], "custom.png", { type: "image/png" }));
    await waitFor(() => expect(screen.getByText("自定义签章")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /恢复默认签章/ }));

    fireEvent.click(screen.getByRole("button", { name: "确认核发" }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onConfirm.mock.calls[0][0].draft).toHaveProperty("sealImage", "");
  });

  it("提交中禁用确认按钮", async () => {
    const deferred = createDeferred<"issued">();
    const onConfirm = vi.fn<ConfirmHandler>(() => deferred.promise);
    renderDialog(onConfirm);

    fireEvent.click(screen.getByRole("button", { name: "确认核发" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "确认核发" })).toBeDisabled()
    );

    deferred.resolve("issued");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "确认核发" })).not.toBeDisabled()
    );
  });
});

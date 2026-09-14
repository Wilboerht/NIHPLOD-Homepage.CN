// @vitest-environment jsdom

/**
 * 消费补录面板测试
 * 覆盖：渠道差异字段——经销渠道必填经销商名称、「其它」渠道说明置顶并替代底部备注、
 * 提交载荷（dealerName / note）与拦截提示。
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { mockFetchWithAuth } = vi.hoisted(() => ({ mockFetchWithAuth: vi.fn() }));
const mockShowSuccess = vi.fn();
const mockShowError = vi.fn();

vi.mock("@/lib/fetch-with-auth", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/fetch-with-auth")>("@/lib/fetch-with-auth");
  return { ...actual, fetchWithAuth: mockFetchWithAuth };
});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ redirectToLogin: vi.fn() }),
}));

vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ success: mockShowSuccess, error: mockShowError }),
}));

import { SpentAdjustmentPanel } from "@/components/website/user-center/SpentAdjustmentPanel";

function jsonResponse(body: unknown) {
  return { status: 200, json: async () => body } as unknown as Response;
}

function renderForm() {
  render(<SpentAdjustmentPanel view="form" onViewChange={vi.fn()} />);
}

/** 取 POST 请求体 */
function lastPostBody(): Record<string, unknown> {
  const call = mockFetchWithAuth.mock.calls.find(([, init]) => init?.method === "POST");
  expect(call).toBeTruthy();
  return JSON.parse((call![1] as RequestInit).body as string);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchWithAuth.mockImplementation((url: string, init?: RequestInit) => {
    if (url === "/api/user/spent-adjustments" && init?.method === "POST") {
      return Promise.resolve(jsonResponse({ success: true, data: { application: { id: "a1" } } }));
    }
    // 首屏申请列表请求保持挂起：本文件只验证表单条件字段与提交载荷
    return new Promise(() => {});
  });
});

describe("SpentAdjustmentPanel 表单", () => {
  it("经销渠道显示必填的经销商名称；未填写时提交被拦截", async () => {
    renderForm();
    fireEvent.click(await screen.findByRole("button", { name: "经销渠道" }));

    expect(screen.getByLabelText(/经销商名称/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/订单号/), { target: { value: "DL001" } });
    fireEvent.click(screen.getByRole("button", { name: "提交申请" }));

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalledWith("请填写经销商名称");
    });
    expect(mockFetchWithAuth.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  it("经销渠道填写经销商名称后提交，载荷携带 dealerName", async () => {
    renderForm();
    fireEvent.click(await screen.findByRole("button", { name: "经销渠道" }));
    fireEvent.change(screen.getByLabelText(/经销商名称/), {
      target: { value: "XX 美妆集合店" },
    });
    fireEvent.change(screen.getByLabelText(/订单号/), { target: { value: "DL001" } });
    fireEvent.click(screen.getByRole("button", { name: "提交申请" }));

    await waitFor(() => {
      expect(mockShowSuccess).toHaveBeenCalledWith("申请已提交，等待审核");
    });
    expect(lastPostBody()).toMatchObject({
      channel: "DEALER",
      dealerName: "XX 美妆集合店",
    });
  });

  it("「其它」渠道：说明位于订单号之前，且不再显示底部备注", async () => {
    renderForm();
    fireEvent.click(await screen.findByRole("button", { name: "其它" }));

    const desc = screen.getByLabelText(/^说明/);
    const orderNo = screen.getByLabelText(/订单号/);
    expect(desc.compareDocumentPosition(orderNo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByLabelText(/^备注/)).not.toBeInTheDocument();
  });

  it("「其它」渠道提交时说明写入 note，且不携带 dealerName", async () => {
    renderForm();
    fireEvent.click(await screen.findByRole("button", { name: "其它" }));
    fireEvent.change(screen.getByLabelText(/^说明/), { target: { value: "朋友代购" } });
    fireEvent.change(screen.getByLabelText(/订单号/), { target: { value: "OTHER-1" } });
    fireEvent.click(screen.getByRole("button", { name: "提交申请" }));

    await waitFor(() => {
      expect(mockShowSuccess).toHaveBeenCalledWith("申请已提交，等待审核");
    });
    const body = lastPostBody();
    expect(body).toMatchObject({ channel: "OTHER", note: "朋友代购" });
    expect(body.dealerName).toBeUndefined();
  });
});

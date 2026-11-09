// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const apiGetMock = vi.fn();
const apiPostMock = vi.fn();
vi.mock("@/lib/api-client", () => ({
  apiGet: (...args: unknown[]) => apiGetMock(...args),
  apiPost: (...args: unknown[]) => apiPostMock(...args),
  ApiError: class ApiError extends Error {
    code?: string;
  },
}));

const canMock = vi.fn();
vi.mock("@/hooks/useAdminPermissions", () => ({
  useAdminPermissions: () => ({ can: canMock, role: "support" }),
}));
vi.mock("@/contexts/AdminSessionContext", () => ({
  useAdminSession: () => ({
    can: canMock,
    loading: false,
    redirecting: false,
    error: null,
    refresh: vi.fn(),
  }),
}));
vi.mock("@/hooks/useTotpConfirm", () => ({
  useTotpConfirm: () => ({ requireTotp: vi.fn().mockResolvedValue(true), totpModal: null }),
  isTotpRequired: () => false,
}));
vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

import RedemptionAfterSalesPage from "../redemption-after-sales/page";

const baseItem = {
  id: "rd-1",
  productName: "测试礼品",
  points: 500,
  status: "AFTER_SALES_REQUESTED",
  createdAt: "2026-11-01T10:00:00.000Z",
  afterSalesRequestedAt: "2026-11-01T10:00:00.000Z",
  afterSalesReason: "商品破损",
  afterSalesReviewNote: null,
  afterSalesApprovedAt: null,
  returnWaybillNo: null,
  returnCarrier: null,
  returnReceivedAt: null,
  refundedPoints: 0,
  refundedAt: null,
  user: { id: "user-1", phone: "138****8000", nickname: "测试用户", status: "ACTIVE" },
};

function mockList(item = baseItem) {
  apiGetMock.mockResolvedValue({
    redemptions: [item],
    counts: { [item.status]: 1 },
    pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
  });
}

describe("兑换售后页面", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    canMock.mockImplementation((permission: string) =>
      ["redemptions:after-sales", "approvals:request"].includes(permission)
    );
    apiPostMock.mockResolvedValue({});
    mockList();
  });

  it("审核通过使用正式弹窗提交，而不是原生 prompt", async () => {
    render(<RedemptionAfterSalesPage />);

    fireEvent.click(await screen.findByRole("button", { name: "通过" }));
    expect(await screen.findByText("通过售后申请")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "确认通过" }));

    await waitFor(() => {
      expect(apiPostMock).toHaveBeenCalledWith(
        "/api/admin/point-redemptions/rd-1/after-sales/review",
        expect.objectContaining({ approve: true })
      );
    });
  });

  it("非退分权限客服可对高积分订单发起 owner 审批", async () => {
    mockList({ ...baseItem, status: "RETURNED", points: 12000 });

    render(<RedemptionAfterSalesPage />);

    expect(await screen.findByRole("button", { name: "申请退分审批" })).toBeInTheDocument();
  });
});

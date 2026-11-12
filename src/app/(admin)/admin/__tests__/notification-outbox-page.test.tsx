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

const canMock = vi.fn().mockReturnValue(true);
vi.mock("@/hooks/useAdminPermissions", () => ({
  useAdminPermissions: () => ({ can: canMock, role: "owner" }),
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
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/admin/notification-outbox",
}));

import NotificationOutboxPage from "../notification-outbox/page";

const item = {
  id: "outbox-1",
  idempotencyKey: "spent-review:app-1:sms",
  channel: "SMS",
  eventType: "spent_review_result",
  aggregateType: "spent_adjustment",
  aggregateId: "app-1",
  userId: "user-1",
  recipient: { phone: "138****8000" },
  templateKey: "spent_review_result",
  status: "DEAD",
  attempts: 6,
  maxAttempts: 6,
  nextAttemptAt: "2026-11-09T00:00:00.000Z",
  lastError: "gateway down",
  providerMessageId: null,
  sentAt: null,
  createdAt: "2026-11-08T00:00:00.000Z",
  updatedAt: "2026-11-09T00:00:00.000Z",
};

describe("事务通知队列页面", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    canMock.mockReturnValue(true);
    apiGetMock.mockResolvedValue({
      items: [item],
      pagination: { page: 1, pageSize: 30, total: 1, totalPages: 1 },
      counts: { DEAD: 1 },
    });
    apiPostMock.mockResolvedValue({ message: "已重新入队" });
  });

  it("展示死信并支持正式确认弹窗重试", async () => {
    render(<NotificationOutboxPage />);

    expect((await screen.findAllByText("spent_review_result")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("死信").length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole("button", { name: "重试" })[0]);
    expect(await screen.findByText("重新入队通知")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重新入队" }));

    await waitFor(() => {
      expect(apiPostMock).toHaveBeenCalledWith("/api/admin/notification-outbox", {
        id: "outbox-1",
        action: "retry",
      });
    });
  });
});

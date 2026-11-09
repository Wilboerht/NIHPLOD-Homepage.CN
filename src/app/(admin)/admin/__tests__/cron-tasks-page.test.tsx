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

import AdminCronTasksPage from "../cron-tasks/page";

const failedRun = {
  id: "run-1",
  taskKey: "expire-points",
  taskName: "Expire Points",
  trigger: "cron",
  status: "FAILED",
  success: false,
  error: "db down",
  startedAt: "2026-11-08T04:30:00.000Z",
  finishedAt: "2026-11-08T04:30:01.000Z",
  durationMs: 1000,
  heartbeatAt: null,
};

describe("定时任务页面", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    canMock.mockReturnValue(true);
    apiGetMock.mockResolvedValue({
      cronEnabled: true,
      cronMode: "local",
      tasks: [
        {
          key: "expire-points",
          name: "Expire Points",
          cronExpression: "30 4 * * *",
          isCleanup: false,
          timeoutMs: 600000,
          lastRun: failedRun,
        },
      ],
      recentRuns: [
        failedRun,
        {
          ...failedRun,
          id: "run-timeout",
          status: "TIMEOUT",
          success: false,
          error: "执行超时",
        },
      ],
    });
    apiPostMock.mockResolvedValue({ message: "任务执行完成", status: "SUCCESS", runId: "run-2" });
  });

  it("展示 FAILED/TIMEOUT 状态并支持重跑", async () => {
    render(<AdminCronTasksPage />);

    expect((await screen.findAllByText("Expire Points")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("失败").length).toBeGreaterThan(0);
    expect(screen.getAllByText("超时").length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole("button", { name: "重跑" })[0]);
    expect(await screen.findByText("手动执行定时任务")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "确认执行" }));

    await waitFor(() => {
      expect(apiPostMock).toHaveBeenCalledWith(
        "/api/admin/cron-tasks",
        expect.objectContaining({ taskKey: "expire-points", sourceRunId: "run-1" }),
        { timeoutMs: 600000 }
      );
    });
  });
});

// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

const apiGetMock = vi.fn();
const apiPatchMock = vi.fn();
const apiPostMock = vi.fn();
const apiDeleteMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/admin/users",
}));

vi.mock("@/lib/api-client", () => ({
  apiGet: (...args: unknown[]) => apiGetMock(...args),
  apiPatch: (...args: unknown[]) => apiPatchMock(...args),
  apiPost: (...args: unknown[]) => apiPostMock(...args),
  apiDelete: (...args: unknown[]) => apiDeleteMock(...args),
  ApiError: class ApiError extends Error {
    code?: string;
    status?: number;
  },
  getApiErrorMessage: (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback,
}));

vi.mock("@/hooks/useAdminPermissions", () => ({
  useAdminPermissions: () => ({
    id: "admin-1",
    role: "owner",
    permissions: new Set(["users:read", "users:write", "users:delete"]),
    can: () => true,
    loading: false,
    error: false,
    refresh: vi.fn(),
  }),
}));

vi.mock("@/contexts/AdminSessionContext", () => ({
  useAdminSession: () => ({
    id: "admin-1",
    role: "owner",
    name: "Owner",
    permissions: new Set(["users:read"]),
    customized: false,
    can: () => true,
    loading: false,
    redirecting: false,
    error: false,
    refresh: vi.fn(),
  }),
}));

vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
    update: vi.fn(),
    promise: vi.fn(),
    apiError: vi.fn(),
  }),
}));

vi.mock("@/hooks/useTotpConfirm", () => ({
  useTotpConfirm: () => ({ requireTotp: vi.fn().mockResolvedValue(true), totpModal: null }),
  isTotpRequired: () => false,
}));

import AdminUsersPage from "../users/page";

const user = {
  id: "user-1",
  phone: "138****8000",
  nickname: "测试用户",
  avatar: null,
  status: "ACTIVE" as const,
  membershipLevel: "GOLD",
  createdAt: "2026-11-01T10:00:00.000Z",
};

function mockUsers(items = [user], total = 1) {
  apiGetMock.mockImplementation((url: string) => {
    if (url === "/api/admin/users") {
      return Promise.resolve({
        users: items,
        pagination: { page: 1, pageSize: 20, total, totalPages: Math.max(1, Math.ceil(total / 20)) },
      });
    }
    return Promise.resolve({});
  });
}

describe("用户管理列表", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsers();
  });

  it("渲染共享 DataTable 与用户信息", async () => {
    render(<AdminUsersPage />);

    const table = await screen.findByRole("table", { name: "用户列表" });
    expect(within(table).getByText("测试用户")).toBeInTheDocument();
    expect(within(table).getByText("138****8000")).toBeInTheDocument();
    expect(within(table).getByText("金卡会员")).toBeInTheDocument();
    expect(within(table).getByText("正常")).toBeInTheDocument();
  });

  it("勾选用户后显示批量操作栏", async () => {
    render(<AdminUsersPage />);

    await screen.findByRole("table", { name: "用户列表" });
    fireEvent.click(screen.getAllByLabelText("选择 测试用户")[0]);

    expect(await screen.findByText("已选 1 位")).toBeInTheDocument();
  });

  it("空态与分页总数", async () => {
    mockUsers([], 0);
    render(<AdminUsersPage />);

    expect((await screen.findAllByText("暂无用户")).length).toBeGreaterThan(0);
    expect(screen.queryByText(/共 0 条/)).not.toBeInTheDocument();
  });

  it("加载失败展示重试入口", async () => {
    apiGetMock.mockRejectedValue(new Error("网络异常"));
    render(<AdminUsersPage />);

    expect((await screen.findAllByText("网络异常")).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "重试" }).length).toBeGreaterThan(0);
  });
});

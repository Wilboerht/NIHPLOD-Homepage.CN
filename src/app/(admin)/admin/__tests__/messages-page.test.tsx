// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

const apiGetMock = vi.fn();
const apiPostMock = vi.fn();
const apiPatchMock = vi.fn();
const apiDeleteMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/admin/messages",
}));

vi.mock("@/lib/api-client", () => ({
  apiGet: (...args: unknown[]) => apiGetMock(...args),
  apiPost: (...args: unknown[]) => apiPostMock(...args),
  apiPatch: (...args: unknown[]) => apiPatchMock(...args),
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
    permissions: new Set(["messages:read", "messages:write", "messages:delete"]),
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
    permissions: new Set(["messages:read"]),
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

vi.mock("@/components/admin/MessagesSourceTabs", () => ({
  MessagesSourceTabs: () => null,
}));

import MessagesPage from "../messages/page";

const message = {
  id: "message-1",
  userId: null,
  name: "张三",
  phone: "138****8000",
  type: "consultation",
  content: "想咨询一下产品的使用方法。",
  read: false,
  internalNote: null,
  notedAt: null,
  createdAt: "2026-11-01T10:00:00.000Z",
  updatedAt: "2026-11-01T10:00:00.000Z",
};

function mockMessages(items = [message], total = 1) {
  apiGetMock.mockImplementation((url: string) => {
    if (url === "/api/admin/messages") {
      return Promise.resolve({
        items,
        pagination: { total },
        unreadCount: items.filter((item) => !item.read).length,
        counts: { all: total, unread: items.filter((item) => !item.read).length, read: 0 },
      });
    }
    return Promise.resolve({});
  });
}

describe("留言管理列表", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMessages();
  });

  it("渲染共享 DataTable 与留言信息", async () => {
    render(<MessagesPage />);

    const table = await screen.findByRole("table", { name: "留言列表" });
    expect(within(table).getByText("张三")).toBeInTheDocument();
    expect(within(table).getByText("138****8000")).toBeInTheDocument();
    expect(within(table).getByText("产品咨询")).toBeInTheDocument();
    expect(within(table).getByText("未读")).toBeInTheDocument();
  });

  it("勾选留言后显示批量操作栏", async () => {
    render(<MessagesPage />);

    await screen.findByRole("table", { name: "留言列表" });
    fireEvent.click(screen.getAllByLabelText("选择 张三 的留言")[0]);

    expect(await screen.findByText("已选 1 条")).toBeInTheDocument();
  });

  it("空态显示暂无留言", async () => {
    mockMessages([], 0);
    render(<MessagesPage />);

    expect((await screen.findAllByText("暂无留言")).length).toBeGreaterThan(0);
  });

  it("加载失败展示重试入口", async () => {
    apiGetMock.mockRejectedValue(new Error("网络异常"));
    render(<MessagesPage />);

    expect(await screen.findByText("加载失败，请重试")).toBeInTheDocument();
  });
});

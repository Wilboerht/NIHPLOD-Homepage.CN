// @vitest-environment jsdom

import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { AdminShell } from "@/components/admin/AdminShell";
import { ToastProvider } from "@/components/ui/Toast";

const mockUseLinkStatus = vi.fn();
const mockPush = vi.fn();
const mockRefresh = vi.fn();

vi.mock("next/link", () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  useLinkStatus: () => mockUseLinkStatus(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin",
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

vi.mock("@/contexts/AdminSessionContext", () => ({
  useAdminSession: () => ({
    role: "owner",
    name: "测试管理员",
    permissions: new Set(["dashboard:read"]),
    loading: false,
    redirecting: false,
  }),
}));

describe("AdminShell 导航反馈", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseLinkStatus.mockReturnValue({ pending: false });
  });

  it("仅在 Link 导航 pending 时显示对应菜单的加载指示", () => {
    const { rerender } = render(
      <ToastProvider>
        <AdminShell>
          <div>仪表盘内容</div>
        </AdminShell>
      </ToastProvider>
    );

    expect(screen.queryByRole("status", { name: "页面加载中" })).toBeNull();

    mockUseLinkStatus.mockReturnValue({ pending: true });
    rerender(
      <ToastProvider>
        <AdminShell>
          <div>仪表盘内容</div>
        </AdminShell>
      </ToastProvider>
    );

    const dashboardLinks = screen.getAllByRole("link", { name: /仪表盘/ });
    expect(dashboardLinks).toHaveLength(2);
    for (const link of dashboardLinks) {
      expect(within(link).getByRole("status", { name: "页面加载中" })).toBeInTheDocument();
    }
  });
});

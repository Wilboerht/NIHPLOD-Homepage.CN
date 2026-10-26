// @vitest-environment jsdom

import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { AdminShell } from "@/components/admin/AdminShell";
import { ToastProvider } from "@/components/ui/Toast";
import { ADMIN_PERMISSIONS } from "@/lib/admin-permissions";

const mockUseLinkStatus = vi.fn();
const mockPush = vi.fn();
const mockRefresh = vi.fn();
const mockFetch = vi.fn();
let mockPermissions = new Set<string>(["dashboard:read"]);

vi.stubGlobal("fetch", mockFetch);

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
    permissions: mockPermissions,
    loading: false,
    redirecting: false,
  }),
}));

describe("AdminShell 导航反馈", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPermissions = new Set(["dashboard:read"]);
    mockUseLinkStatus.mockReturnValue({ pending: false });
    mockFetch.mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({
        success: true,
        data: {
          messages: 0,
          accountDeletions: 0,
          spentAdjustments: 0,
          pointRedemptions: 0,
          applications: 0,
          approvals: 0,
        },
      }),
    });
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

  it("owner 按新分组渲染，子站概览排在 SSO 管理之后", () => {
    mockPermissions = new Set(ADMIN_PERMISSIONS);

    render(
      <ToastProvider>
        <AdminShell>
          <div>仪表盘内容</div>
        </AdminShell>
      </ToastProvider>
    );

    const nav = screen.getAllByRole("navigation")[0];
    const groupLabels = within(nav)
      .getAllByText(/^(会员运营|商品管理|招聘管理|安全与审计|系统与集成|SSO 管理|子站概览)$/)
      .map((element) => element.textContent);

    expect(groupLabels).toEqual([
      "会员运营",
      "商品管理",
      "招聘管理",
      "安全与审计",
      "系统与集成",
      "SSO 管理",
      "子站概览",
    ]);
    expect(within(nav).queryByText("商城管理")).toBeNull();
    expect(within(nav).queryByText("系统管理")).toBeNull();
    expect(within(nav).queryByText("子项目")).toBeNull();
  });

  it("权限过滤后隐藏空分组，客服只看到会员运营与安全与审计", () => {
    mockPermissions = new Set([
      "dashboard:read",
      "approvals:request",
      "users:read",
      "messages:read",
      "spent:read",
      "gifts:read",
      "redemptions:read",
    ]);

    render(
      <ToastProvider>
        <AdminShell>
          <div>仪表盘内容</div>
        </AdminShell>
      </ToastProvider>
    );

    const nav = screen.getAllByRole("navigation")[0];
    expect(within(nav).getByText("会员运营")).toBeInTheDocument();
    expect(within(nav).getByText("安全与审计")).toBeInTheDocument();
    expect(within(nav).queryByText("商品管理")).toBeNull();
    expect(within(nav).queryByText("招聘管理")).toBeNull();
    expect(within(nav).queryByText("系统与集成")).toBeNull();
    expect(within(nav).queryByText("SSO 管理")).toBeNull();
    expect(within(nav).queryByText("子站概览")).toBeNull();
  });

  it("审批中心有待审批时显示红点提醒", async () => {
    mockPermissions = new Set(["dashboard:read", "approvals:request"]);
    mockFetch.mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({
        success: true,
        data: {
          messages: 0,
          accountDeletions: 0,
          spentAdjustments: 0,
          pointRedemptions: 0,
          applications: 0,
          approvals: 2,
        },
      }),
    });

    render(
      <ToastProvider>
        <AdminShell>
          <div>仪表盘内容</div>
        </AdminShell>
      </ToastProvider>
    );

    const nav = screen.getAllByRole("navigation")[0];
    const approvalLink = within(nav).getByRole("link", { name: /审批中心/ });
    expect(await within(approvalLink).findByLabelText("2 条待处理")).toBeInTheDocument();
  });

  it("底部安全设置入口指向 TOTP 页面", () => {
    render(
      <ToastProvider>
        <AdminShell>
          <div>仪表盘内容</div>
        </AdminShell>
      </ToastProvider>
    );

    const securityLinks = screen.getAllByRole("link", { name: "安全设置" });
    expect(securityLinks).toHaveLength(2);
    for (const link of securityLinks) {
      expect(link).toHaveAttribute("href", "/admin/settings/totp");
    }
  });
});

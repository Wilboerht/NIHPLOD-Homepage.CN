import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";

const mockGetCurrentAdmin = vi.hoisted(() => vi.fn());
const mockHeaders = vi.hoisted(() => vi.fn());
const mockRedirect = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  })
);

vi.mock("@/lib/auth", () => ({
  getCurrentAdmin: mockGetCurrentAdmin,
}));

vi.mock("next/headers", () => ({
  headers: mockHeaders,
}));

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}));

import AdminServerLayout from "../layout";
import { AdminAccessDenied } from "@/components/admin/AdminAccessDenied";
import { ADMIN_PAGE_PATH_HEADER } from "@/lib/admin-page-path";

type DeniedElement = ReactElement<{
  permissions?: string[];
  mode?: "all" | "any";
  description?: string;
}>;

function authenticated(role: string, permissionOverrides: string[] = []) {
  mockGetCurrentAdmin.mockResolvedValue({
    id: "admin-1",
    email: "admin@test.com",
    name: "Admin",
    role,
    permissionOverrides,
  });
}

function withPathname(pathname?: string) {
  mockHeaders.mockResolvedValue(
    new Headers(pathname ? { [ADMIN_PAGE_PATH_HEADER]: pathname } : undefined)
  );
}

describe("AdminServerLayout 服务端页面门禁", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticated("owner");
    withPathname("/admin/users");
  });

  it("未登录时跳转登录页", async () => {
    mockGetCurrentAdmin.mockResolvedValue(null);

    await expect(AdminServerLayout({ children: <div>page</div> })).rejects.toThrow("NEXT_REDIRECT");
    expect(mockRedirect).toHaveBeenCalledWith("/admin-login?reason=session_expired");
  });

  it("有权限时渲染页面内容", async () => {
    authenticated("hr");
    withPathname("/admin/jobs");

    const result = await AdminServerLayout({ children: <div>jobs</div> });

    expect((result as ReactElement).type).toBe("div");
  });

  it("无页面权限时服务端直接渲染无权提示", async () => {
    authenticated("hr");
    withPathname("/admin/users");

    const result = (await AdminServerLayout({ children: <div>users</div> })) as DeniedElement;

    expect(result.type).toBe(AdminAccessDenied);
    expect(result.props.permissions).toEqual(["users:read"]);
    expect(result.props.mode).toBe("all");
  });

  it("未知页面路径按 fail-closed 处理", async () => {
    withPathname("/admin/unknown");

    const result = (await AdminServerLayout({ children: <div>unknown</div> })) as DeniedElement;

    expect(result.type).toBe(AdminAccessDenied);
    expect(result.props.permissions).toEqual([]);
  });

  it("缺少 proxy 注入的路径头时 fail-closed", async () => {
    withPathname(undefined);

    const result = (await AdminServerLayout({ children: <div>page</div> })) as DeniedElement;

    expect(result.type).toBe(AdminAccessDenied);
    expect(result.props.description).toContain("无法校验页面权限");
  });
});

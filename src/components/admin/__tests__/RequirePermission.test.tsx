// @vitest-environment jsdom

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { AdminPermission } from "@/lib/admin-permissions";

interface MockSession {
  can: (permission: AdminPermission) => boolean;
  loading: boolean;
  redirecting: boolean;
  error: boolean;
  refresh: () => void;
}

const session = vi.hoisted(() => ({
  current: {
    can: () => true,
    loading: false,
    redirecting: false,
    error: false,
    refresh: vi.fn(),
  } as MockSession,
}));

vi.mock("@/contexts/AdminSessionContext", () => ({
  useAdminSession: () => session.current,
}));

import { RequirePermission } from "@/components/admin/RequirePermission";

const CONTENT = "页面敏感内容";

describe("RequirePermission", () => {
  it("权限加载中不渲染页面内容", () => {
    session.current = {
      can: () => true,
      loading: true,
      redirecting: false,
      error: false,
      refresh: vi.fn(),
    };

    render(
      <RequirePermission permission="users:read">
        <div>{CONTENT}</div>
      </RequirePermission>
    );

    expect(screen.queryByText(CONTENT)).toBeNull();
    expect(screen.queryByText("无权访问")).toBeNull();
  });

  it("无权限时不渲染页面内容，并展示无权提示", () => {
    session.current = {
      can: () => false,
      loading: false,
      redirecting: false,
      error: false,
      refresh: vi.fn(),
    };

    render(
      <RequirePermission permission="users:read">
        <div>{CONTENT}</div>
      </RequirePermission>
    );

    expect(screen.queryByText(CONTENT)).toBeNull();
    expect(screen.getByText("无权访问")).toBeInTheDocument();
    expect(screen.getByText(/用户查看/)).toBeInTheDocument();
  });

  it("有权限时渲染页面内容", () => {
    session.current = {
      can: () => true,
      loading: false,
      redirecting: false,
      error: false,
      refresh: vi.fn(),
    };

    render(
      <RequirePermission permission="users:read">
        <div>{CONTENT}</div>
      </RequirePermission>
    );

    expect(screen.getByText(CONTENT)).toBeInTheDocument();
  });

  it("权限接口失败时 fail-closed，不渲染页面内容", () => {
    session.current = {
      can: () => true,
      loading: false,
      redirecting: false,
      error: true,
      refresh: vi.fn(),
    };

    render(
      <RequirePermission permission="users:read">
        <div>{CONTENT}</div>
      </RequirePermission>
    );

    expect(screen.queryByText(CONTENT)).toBeNull();
    expect(screen.getByText("网络错误")).toBeInTheDocument();
  });
});

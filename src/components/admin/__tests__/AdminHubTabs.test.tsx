// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AdminHubTabs } from "@/components/admin/AdminHubTabs";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/subsites/ba/certificates",
}));

vi.mock("@/hooks/useAdminPermissions", () => ({
  useAdminPermissions: () => ({
    permissions: new Set(["ba:access", "ba:certificates:read"]),
    loading: false,
  }),
}));

describe("AdminHubTabs", () => {
  it("嵌套路由只高亮最具体的页签", () => {
    render(<AdminHubTabs section="ba" />);

    expect(screen.getByRole("link", { name: "证书管理" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(screen.getByRole("link", { name: "平台概览" })).not.toHaveAttribute("aria-current");
  });
});

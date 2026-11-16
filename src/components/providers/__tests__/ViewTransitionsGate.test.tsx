// @vitest-environment jsdom

import React from "react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ViewTransitionsGate } from "@/components/providers/ViewTransitionsGate";

let mockPathname = "/about";

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

vi.mock("next-view-transitions", async () => {
  const React = await import("react");
  return {
    ViewTransitions: ({ children }: { children: ReactNode }) =>
      React.createElement("div", { "data-testid": "view-transitions" }, children),
  };
});

afterEach(() => {
  cleanup();
});

describe("ViewTransitionsGate", () => {
  it("管理端不挂载 ViewTransitions", () => {
    mockPathname = "/admin/subsites/ba/certificates";
    render(
      <ViewTransitionsGate>
        <span>管理端内容</span>
      </ViewTransitionsGate>
    );

    expect(screen.getByText("管理端内容")).toBeInTheDocument();
    expect(screen.queryByTestId("view-transitions")).not.toBeInTheDocument();
  });

  it("管理端登录页不挂载 ViewTransitions", () => {
    mockPathname = "/admin-login";
    render(
      <ViewTransitionsGate>
        <span>登录内容</span>
      </ViewTransitionsGate>
    );

    expect(screen.getByText("登录内容")).toBeInTheDocument();
    expect(screen.queryByTestId("view-transitions")).not.toBeInTheDocument();
  });

  it("官网页面保留 ViewTransitions", () => {
    mockPathname = "/about";
    render(
      <ViewTransitionsGate>
        <span>官网内容</span>
      </ViewTransitionsGate>
    );

    expect(screen.getByTestId("view-transitions")).toBeInTheDocument();
    expect(screen.getByText("官网内容")).toBeInTheDocument();
  });
});

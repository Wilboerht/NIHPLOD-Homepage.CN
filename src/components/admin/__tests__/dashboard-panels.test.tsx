// @vitest-environment jsdom

import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CollapsiblePanel } from "@/components/admin/CollapsiblePanel";
import { StatStrip } from "@/components/admin/StatStrip";

describe("管理端仪表盘组件", () => {
  it("CollapsiblePanel 默认收起，并提供一行摘要", () => {
    render(
      <CollapsiblePanel title="SSO 概览" summary="3 个 Client">
        <p>展开内容</p>
      </CollapsiblePanel>
    );

    const details = screen.getByText("SSO 概览").closest("details");
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute("open");
    expect(screen.getByText("3 个 Client")).toBeInTheDocument();
  });

  it("CollapsiblePanel 支持 defaultOpen", () => {
    render(
      <CollapsiblePanel title="SSO 概览" defaultOpen>
        <p>展开内容</p>
      </CollapsiblePanel>
    );

    expect(screen.getByText("SSO 概览").closest("details")).toHaveAttribute("open");
  });

  it("StatStrip 渲染标签、数值与说明", () => {
    render(
      <StatStrip items={[{ label: "用户总数", value: "1,234", description: "含已注销账号" }]} />
    );

    expect(screen.getByText("用户总数")).toBeInTheDocument();
    expect(screen.getByText("1,234")).toBeInTheDocument();
    expect(screen.getByText("含已注销账号")).toBeInTheDocument();
  });
});

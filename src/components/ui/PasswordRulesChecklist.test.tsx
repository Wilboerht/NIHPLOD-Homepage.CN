// @vitest-environment jsdom

/**
 * 密码规则实时清单测试
 * 覆盖：规则项渲染、满足/不满足状态切换、弱密码规则口径与后端一致
 */
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PasswordRulesChecklist } from "./PasswordRulesChecklist";

describe("PasswordRulesChecklist", () => {
  it("渲染全部 5 条规则", () => {
    render(<PasswordRulesChecklist password="" />);
    expect(screen.getByText("8-32 个字符")).toBeTruthy();
    expect(screen.getByText("包含大写字母")).toBeTruthy();
    expect(screen.getByText("包含小写字母")).toBeTruthy();
    expect(screen.getByText("包含数字")).toBeTruthy();
    expect(screen.getByText("不是常见弱密码或连续字符")).toBeTruthy();
  });

  it("空密码时所有规则均为未满足（灰色）", () => {
    render(<PasswordRulesChecklist password="" />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(5);
    for (const item of items) {
      expect(item.className).not.toContain("text-emerald-600");
    }
  });

  it("强密码所有规则点亮", () => {
    render(<PasswordRulesChecklist password="Hello123" />);
    const items = screen.getAllByRole("listitem");
    for (const item of items) {
      expect(item.className).toContain("text-emerald-600");
    }
  });

  it("弱密码规则：123456 不点亮，短密码 123 同样不点亮但不报简单（长度项未满足）", () => {
    const { rerender } = render(<PasswordRulesChecklist password="Hello123456" />);
    // 含 6 位连续数字 → 弱密码项不亮，其余亮
    const weakItem = screen.getByText("不是常见弱密码或连续字符").closest("li")!;
    expect(weakItem.className).not.toContain("text-emerald-600");
    expect(screen.getByText("8-32 个字符").closest("li")!.className).toContain("text-emerald-600");

    rerender(<PasswordRulesChecklist password="123" />);
    expect(screen.getByText("8-32 个字符").closest("li")!.className).not.toContain(
      "text-emerald-600"
    );
  });
});

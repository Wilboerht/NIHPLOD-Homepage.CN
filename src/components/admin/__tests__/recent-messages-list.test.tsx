// @vitest-environment jsdom

import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { RecentMessagesList } from "@/components/admin/RecentMessagesList";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const messages = [
  {
    id: "message-1",
    name: "张三",
    phone: "138****8000",
    content: "想咨询一下产品的使用方法。",
    read: false,
    createdAt: new Date().toISOString(),
  },
];

describe("RecentMessagesList", () => {
  it("点击最近留言直接打开详情弹窗，而不是跳转页面", () => {
    render(<RecentMessagesList messages={messages} />);

    fireEvent.click(screen.getByRole("button", { name: "查看 张三 的留言" }));

    const dialog = screen.getByRole("dialog", { name: "留言详情" });
    expect(within(dialog).getByText("张三")).toBeInTheDocument();
    expect(within(dialog).getByText("138****8000")).toBeInTheDocument();
    expect(within(dialog).getByText("想咨询一下产品的使用方法。")).toBeInTheDocument();
    expect(within(dialog).getByText("未读")).toBeInTheDocument();
  });

  it("弹窗内可前往留言管理", () => {
    render(<RecentMessagesList messages={messages} />);

    fireEvent.click(screen.getByRole("button", { name: "查看 张三 的留言" }));
    fireEvent.click(screen.getByRole("button", { name: "前往留言管理" }));

    expect(push).toHaveBeenCalledWith("/admin/messages");
  });
});

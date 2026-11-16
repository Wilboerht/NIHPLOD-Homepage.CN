// @vitest-environment jsdom

import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { RecentMessagesList } from "@/components/admin/RecentMessagesList";
import { ToastProvider } from "@/components/ui/Toast";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/api-client", () => ({
  apiPatch: vi.fn().mockResolvedValue({}),
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

function renderList() {
  return render(
    <ToastProvider>
      <RecentMessagesList messages={messages} />
    </ToastProvider>
  );
}

describe("RecentMessagesList", () => {
  it("点击最近留言就地展开详情，而不是跳转页面", () => {
    renderList();

    fireEvent.click(screen.getByRole("button", { name: "查看 张三 的留言" }));

    const region = screen.getByRole("region", { name: "张三 的留言详情" });
    expect(within(region).getByText("张三")).toBeInTheDocument();
    expect(within(region).getByText("138****8000")).toBeInTheDocument();
    expect(within(region).getByText("想咨询一下产品的使用方法。")).toBeInTheDocument();
    expect(within(region).getByText("已读")).toBeInTheDocument();
  });

  it("展开后可前往留言管理", () => {
    renderList();

    fireEvent.click(screen.getByRole("button", { name: "查看 张三 的留言" }));
    const link = screen.getByRole("link", { name: "前往留言管理" });

    expect(link).toHaveAttribute("href", "/admin/messages");
  });
});

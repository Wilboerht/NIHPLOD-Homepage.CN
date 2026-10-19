// @vitest-environment jsdom

import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DataTable, type Column } from "@/components/admin/DataTable";
import { MobileList } from "@/components/admin/MobileList";
import { Modal } from "@/components/ui/Modal";

interface Row {
  id: string;
  name: string;
}

describe("管理端响应式契约", () => {
  it("DataTable 提供 mobileCard 时移动端渲染卡片，桌面端保留表格", () => {
    const columns: Column<Row>[] = [
      { key: "name", title: "名称" },
      { key: "id", title: "ID" },
    ];

    render(
      <DataTable
        columns={columns}
        data={[{ id: "1", name: "产品 A" }]}
        rowKey="id"
        mobileCard={(record) => <span>{`移动卡片-${record.name}`}</span>}
      />
    );

    expect(screen.getByText("移动卡片-产品 A")).toBeInTheDocument();
    const table = document.querySelector("table");
    expect(table).not.toBeNull();
    expect(table?.parentElement).toHaveClass("hidden", "md:block");
  });

  it("MobileList 默认仅在移动端显示，并提供统一空态", () => {
    const { container, rerender } = render(<MobileList>内容</MobileList>);
    expect(container.firstElementChild).toHaveClass("md:hidden");

    rerender(<MobileList empty="暂无记录" />);
    expect(screen.getByText("暂无记录")).toBeInTheDocument();
  });

  it("Modal 的 mobileFullScreen 在手机端使用全屏高度", () => {
    const { container } = render(
      <Modal open onClose={vi.fn()} title="长表单" mobileFullScreen>
        <button type="button">内容</button>
      </Modal>
    );

    const dialog = screen.getByRole("dialog", { name: "长表单" });
    expect(dialog).toHaveClass("max-sm:h-dvh", "max-sm:max-h-dvh", "max-sm:rounded-none");
    expect(container).toBeInTheDocument();
  });
});

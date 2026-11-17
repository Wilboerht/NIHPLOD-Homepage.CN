// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DataTable, type Column } from "@/components/admin/DataTable";

interface Row {
  id: string;
  name: string;
}

const columns: Column<Row>[] = [
  { key: "name", title: "名称" },
];

describe("DataTable", () => {
  it("渲染展开行内容", () => {
    render(
      <DataTable
        columns={columns}
        data={[
          { id: "1", name: "第一行" },
          { id: "2", name: "第二行" },
        ]}
        rowKey="id"
        ariaLabel="测试表格"
        expandedRow={(row) =>
          row.id === "1" ? <div>展开详情</div> : null
        }
      />
    );

    expect(screen.getByRole("table", { name: "测试表格" })).toBeInTheDocument();
    expect(screen.getByText("展开详情")).toBeInTheDocument();
    expect(screen.getAllByText("第一行")).toHaveLength(1);
  });

  it("筛选空态提供清除筛选入口", () => {
    render(
      <DataTable
        columns={columns}
        data={[]}
        rowKey="id"
        isFiltered
        onClearFilters={() => undefined}
      />
    );

    expect(screen.getByRole("button", { name: "清除筛选" })).toBeInTheDocument();
  });
});

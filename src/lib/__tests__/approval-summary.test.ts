import { describe, expect, it } from "vitest";
import { buildApprovalSummary } from "@/lib/approval-summary";

describe("buildApprovalSummary", () => {
  it("把积分调整渲染成可读字段，并提示越权代执行", () => {
    const summary = buildApprovalSummary({
      policyKey: "points.adjust",
      payload: { userId: "user-1", amount: 1200, note: "客服补偿" },
      targetSnapshot: {
        status: "ACTIVE",
        requesterPermission: { actionPermission: "points:adjust", hadActionPermission: false },
      },
      targetLabel: "张三 · 138****8000",
    });

    expect(summary.title).toBe("人工调整积分");
    expect(summary.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "用户", value: "张三 · 138****8000" }),
        expect.objectContaining({ label: "调整分值", value: "+1200" }),
        expect.objectContaining({ label: "调整原因", value: "客服补偿" }),
      ])
    );
    expect(summary.riskNotes.join(" ")).toContain("申请人原本不具备");
  });

  it("导入类审批不展示预览令牌", () => {
    const summary = buildApprovalSummary({
      policyKey: "spent.import.execute",
      payload: { previewToken: "secret", reason: "补录" },
      targetSnapshot: { rowCount: 12, fileHash: "abcdef1234567890" },
      targetLabel: "batch.xlsx",
    });

    expect(summary.fields.map((field) => field.label)).not.toContain("previewToken");
    expect(summary.fields.find((field) => field.label === "文件")?.value).toBe("batch.xlsx");
  });

  it("未知政策降级为键值列表，不抛错", () => {
    const summary = buildApprovalSummary({
      policyKey: "unknown.policy",
      payload: { foo: "bar" },
      targetSnapshot: null,
      targetLabel: null,
    });

    expect(summary.title).toBe("unknown.policy");
    expect(summary.fields).toEqual([{ label: "foo", value: "bar" }]);
  });
});

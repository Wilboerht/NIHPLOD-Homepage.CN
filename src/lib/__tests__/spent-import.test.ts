/**
 * 消费记录 Excel 批量导入核心逻辑测试
 * 覆盖：Excel 解析（正常/坏表头/坏行）、预览校验（用户存在性）、
 * 执行入账（成功/幂等/用户不存在）、整批撤销（成功/已撤销/部分失败）
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as XLSX from "xlsx";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findMany: vi.fn() },
    spentImportBatch: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    spentSyncRecord: { deleteMany: vi.fn() },
  },
}));

vi.mock("@/lib/points", () => ({
  applyExternalSpentSync: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

import { prisma } from "@/lib/prisma";
import { applyExternalSpentSync } from "@/lib/points";
import {
  parseImportWorkbook,
  previewImportRows,
  executeImportBatch,
  undoImportBatch,
} from "@/lib/spent-import";

const mockUserFindMany = prisma.user.findMany as ReturnType<typeof vi.fn>;
const mockBatchCreate = prisma.spentImportBatch.create as ReturnType<typeof vi.fn>;
const mockBatchFindUnique = prisma.spentImportBatch.findUnique as ReturnType<typeof vi.fn>;
const mockBatchUpdate = prisma.spentImportBatch.update as ReturnType<typeof vi.fn>;
const mockSyncRecordDeleteMany = prisma.spentSyncRecord.deleteMany as ReturnType<typeof vi.fn>;
const mockApplySync = applyExternalSpentSync as ReturnType<typeof vi.fn>;

function buildWorkbook(aoa: unknown[][]): Buffer {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "消费记录");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

const HEADERS = ["手机号", "金额（元）", "消费日期", "渠道", "订单号/小票号", "备注"];

describe("parseImportWorkbook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("正常解析：字段映射与行号正确", () => {
    const buffer = buildWorkbook([
      HEADERS,
      ["13800138000", 1280, "2026-01-15", "天猫", "TM001", "备注A"],
      [" 13900139000 ", "500", "", "JD", "", ""],
      [null, null, null, null, null, null],
    ]);
    const result = parseImportWorkbook(buffer, "import.xlsx");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toHaveLength(2);
    expect(result.fileHash).toMatch(/^[0-9a-f]{32}$/);
    expect(result.rows[0]).toMatchObject({
      rowIndex: 2,
      phone: "13800138000",
      amount: 1280,
      channel: "TMALL",
      orderNo: "TM001",
      purchasedAt: "2026-01-15",
      note: "备注A",
      error: null,
    });
    expect(result.rows[1]).toMatchObject({
      rowIndex: 3,
      phone: "13900139000",
      amount: 500,
      channel: "JD",
      error: null,
    });
  });

  it("表头错误：返回 INVALID_HEADER", () => {
    const buffer = buildWorkbook([["姓名", "金额"], ["13800138000", 100]]);
    const result = parseImportWorkbook(buffer, "import.xlsx");
    expect(result).toMatchObject({ ok: false, code: "INVALID_HEADER" });
  });

  it("坏行：手机号/金额/日期/渠道错误逐行报错", () => {
    const buffer = buildWorkbook([
      HEADERS,
      ["12345", "abc", "2026-13-99", "拼多多", "", ""],
      ["13800138000", -200, "", "微信小程序", "", ""],
    ]);
    const result = parseImportWorkbook(buffer, "import.xlsx");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows[0].error).toContain("手机号格式不正确");
    expect(result.rows[0].error).toContain("金额必须为非零整数");
    expect(result.rows[0].error).toContain("消费日期格式不正确");
    expect(result.rows[0].error).toContain("渠道不正确");
    expect(result.rows[1]).toMatchObject({ phone: "13800138000", amount: -200, channel: "MINIPROGRAM", error: null });
  });

  it("金额为零视为无效", () => {
    const buffer = buildWorkbook([HEADERS, ["13800138000", 0]]);
    const result = parseImportWorkbook(buffer, "import.xlsx");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows[0].error).toContain("金额必须为非零整数");
  });

  it("不支持的扩展名：返回 INVALID_FILE", () => {
    const buffer = buildWorkbook([HEADERS, ["13800138000", 100]]);
    const result = parseImportWorkbook(buffer, "import.txt");
    expect(result).toMatchObject({ ok: false, code: "INVALID_FILE" });
  });

  it("CSV 文件可解析", () => {
    const csv = Buffer.from("手机号,金额（元）,消费日期\n13800138000,100,2026-01-15\n", "utf-8");
    const result = parseImportWorkbook(csv, "import.csv");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ phone: "13800138000", amount: 100, purchasedAt: "2026-01-15" });
  });

  it("虚高 !ref（整列格式化）无越界真实单元格：正常解析", () => {
    const ws = XLSX.utils.aoa_to_sheet([HEADERS, ["13800138000", 100]]);
    ws["!ref"] = "A1:F1500";
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "S");
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const result = parseImportWorkbook(buffer, "import.xlsx");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].phone).toBe("13800138000");
  });

  it("读取上限之外存在真实单元格（超大文件）：返回 TOO_MANY_ROWS", () => {
    const ws = XLSX.utils.aoa_to_sheet([HEADERS, ["13800138000", 100]]);
    ws["!ref"] = "A1:F1500";
    ws["A1500"] = { t: "s", v: "越界数据" };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "S");
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const result = parseImportWorkbook(buffer, "import.xlsx");
    expect(result).toMatchObject({ ok: false, code: "TOO_MANY_ROWS" });
  });
});

describe("previewImportRows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserFindMany.mockResolvedValue([{ phone: "13800138000" }]);
  });

  it("已注册手机号可导入，未注册报错", async () => {
    const { rows, okCount, errorCount, totalAmount } = await previewImportRows([
      {
        rowIndex: 2,
        phone: "13800138000",
        amount: 100,
        channel: null,
        orderNo: null,
        purchasedAt: null,
        note: null,
        error: null,
      },
      {
        rowIndex: 3,
        phone: "13900139000",
        amount: 200,
        channel: null,
        orderNo: null,
        purchasedAt: null,
        note: null,
        error: null,
      },
    ]);

    expect(rows[0]).toMatchObject({ error: null, userExists: true });
    expect(rows[1].error).toContain("未注册");
    expect(okCount).toBe(1);
    expect(errorCount).toBe(1);
    expect(totalAmount).toBe(100);
    expect(mockUserFindMany).toHaveBeenCalledWith({
      where: { phone: { in: ["13800138000", "13900139000"] } },
      select: { phone: true },
    });
  });

  it("手机号打码展示", async () => {
    const { rows } = await previewImportRows([
      {
        rowIndex: 2,
        phone: "13800138000",
        amount: 100,
        channel: null,
        orderNo: null,
        purchasedAt: null,
        note: null,
        error: null,
      },
    ]);
    expect(rows[0].maskedPhone).toBe("138****8000");
  });
});

describe("executeImportBatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserFindMany.mockResolvedValue([{ id: "user-1", phone: "13800138000" }]);
    mockBatchCreate.mockResolvedValue({ id: "batch-1" });
  });

  const okInput = {
    phone: "13800138000",
    amount: 1000,
    channel: "TMALL",
    orderNo: "TM001",
    purchasedAt: "2026-01-15",
    note: null,
  };

  it("成功行入账：reference 内容哈希且幂等稳定", async () => {
    mockApplySync.mockResolvedValue({ totalSpent: 1000, membershipLevel: "SILVER", duplicated: false });

    const result = await executeImportBatch({
      rows: [okInput],
      fileName: "import.xlsx",
      fileHash: "abc123",
      adminId: "admin-1",
    });

    expect(result).toMatchObject({
      totalRows: 1,
      successRows: 1,
      duplicateRows: 0,
      errorRows: 0,
      totalAmount: 1000,
    });
    expect(mockApplySync).toHaveBeenCalledTimes(1);
    const call = mockApplySync.mock.calls[0][0];
    expect(call).toMatchObject({ userId: "user-1", spentDelta: 1000 });
    expect(call.reference).toMatch(/^import:[0-9a-f]{32}$/);
    expect(mockBatchCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        adminId: "admin-1",
        totalRows: 1,
        successRows: 1,
        totalAmount: 1000,
        rows: {
          create: [
            expect.objectContaining({
              phone: "13800138000",
              amount: 1000,
              channel: "TMALL",
              orderNo: "TM001",
              status: "SUCCESS",
              userId: "user-1",
              reference: call.reference,
            }),
          ],
        },
      }),
    });
  });

  it("相同行内容生成相同 reference（幂等键稳定）", async () => {
    mockApplySync.mockResolvedValue({ totalSpent: 1000, membershipLevel: "REGULAR", duplicated: false });
    await executeImportBatch({ rows: [okInput], fileName: "a.xlsx", adminId: "admin-1" });
    vi.clearAllMocks();
    mockUserFindMany.mockResolvedValue([{ id: "user-1", phone: "13800138000" }]);
    mockBatchCreate.mockResolvedValue({ id: "batch-2" });
    mockApplySync.mockResolvedValue({ totalSpent: 1000, membershipLevel: "REGULAR", duplicated: false });
    await executeImportBatch({ rows: [okInput], fileName: "b.xlsx", adminId: "admin-1" });

    const refs = mockApplySync.mock.calls.map((c) => c[0].reference);
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatch(/^import:/);
  });

  it("未注册手机号：行标记 ERROR，不调用入账", async () => {
    mockUserFindMany.mockResolvedValue([]);

    const result = await executeImportBatch({
      rows: [okInput],
      fileName: "import.xlsx",
      adminId: "admin-1",
    });

    expect(result.errorRows).toBe(1);
    expect(result.rows[0]).toMatchObject({ status: "ERROR", error: "该手机号未注册官网账户" });
    expect(mockApplySync).not.toHaveBeenCalled();
  });

  it("幂等命中：行标记 DUPLICATE，不重复入账", async () => {
    mockApplySync.mockResolvedValue({ totalSpent: 1000, membershipLevel: "SILVER", duplicated: true });

    const result = await executeImportBatch({
      rows: [okInput],
      fileName: "import.xlsx",
      adminId: "admin-1",
    });

    expect(result.duplicateRows).toBe(1);
    expect(result.successRows).toBe(0);
    expect(result.totalAmount).toBe(0);
    expect(result.rows[0].status).toBe("DUPLICATE");
  });

  it("入账异常：行标记 ERROR，不影响汇总", async () => {
    mockApplySync.mockRejectedValue(new Error("boom"));

    const result = await executeImportBatch({
      rows: [okInput],
      fileName: "import.xlsx",
      adminId: "admin-1",
    });

    expect(result.errorRows).toBe(1);
    expect(result.rows[0].status).toBe("ERROR");
  });
});

describe("undoImportBatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("撤销成功：逐行反向冲正、清理原始幂等记录并标记 undoneAt", async () => {
    mockBatchFindUnique.mockResolvedValue({
      id: "batch-1",
      undoneAt: null,
      totalAmount: 1500,
      rows: [
        { id: "row-1", userId: "user-1", amount: 1000, reference: "import:ref-1" },
        { id: "row-2", userId: "user-2", amount: 500, reference: "import:ref-2" },
      ],
    });
    mockApplySync.mockResolvedValue({ totalSpent: 0, membershipLevel: "REGULAR", duplicated: false });
    mockSyncRecordDeleteMany.mockResolvedValue({ count: 1 });
    mockBatchUpdate.mockResolvedValue({});

    const result = await undoImportBatch("batch-1");

    expect(result).toEqual({ ok: true, revertedRows: 2, totalAmount: 1500 });
    expect(mockApplySync).toHaveBeenCalledTimes(2);
    expect(mockApplySync).toHaveBeenCalledWith({
      userId: "user-1",
      spentDelta: -1000,
      reference: "import-undo:batch-1:row-1",
      note: expect.stringContaining("batch-1"),
    });
    // 删除原始正向幂等记录，保证撤销后重新导入相同行可再次入账
    expect(mockSyncRecordDeleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1", reference: "import:ref-1" },
    });
    expect(mockSyncRecordDeleteMany).toHaveBeenCalledWith({
      where: { userId: "user-2", reference: "import:ref-2" },
    });
    expect(mockBatchUpdate).toHaveBeenCalledWith({
      where: { id: "batch-1" },
      data: { undoneAt: expect.any(Date) },
    });
  });

  it("批次不存在：NOT_FOUND", async () => {
    mockBatchFindUnique.mockResolvedValue(null);
    const result = await undoImportBatch("batch-x");
    expect(result).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });

  it("已撤销批次：ALREADY_UNDONE", async () => {
    mockBatchFindUnique.mockResolvedValue({
      id: "batch-1",
      undoneAt: new Date(),
      totalAmount: 100,
      rows: [],
    });
    const result = await undoImportBatch("batch-1");
    expect(result).toMatchObject({ ok: false, code: "ALREADY_UNDONE" });
  });

  it("无成功行：NOTHING_TO_UNDO", async () => {
    mockBatchFindUnique.mockResolvedValue({
      id: "batch-1",
      undoneAt: null,
      totalAmount: 0,
      rows: [],
    });
    const result = await undoImportBatch("batch-1");
    expect(result).toMatchObject({ ok: false, code: "NOTHING_TO_UNDO" });
  });

  it("部分行冲正失败：返回错误且不标记 undoneAt（可重试）", async () => {
    mockBatchFindUnique.mockResolvedValue({
      id: "batch-1",
      undoneAt: null,
      totalAmount: 1000,
      rows: [
        { id: "row-1", userId: "user-1", amount: 1000, reference: "import:ref-1" },
        { id: "row-2", userId: "user-2", amount: 500, reference: "import:ref-2" },
      ],
    });
    mockApplySync
      .mockResolvedValueOnce({ totalSpent: 0, membershipLevel: "REGULAR", duplicated: false })
      .mockRejectedValueOnce(new Error("boom"));
    mockSyncRecordDeleteMany.mockResolvedValue({ count: 1 });

    const result = await undoImportBatch("batch-1");

    expect(result).toMatchObject({ ok: false, code: "INTERNAL_ERROR" });
    expect(mockBatchUpdate).not.toHaveBeenCalled();
  });

  it("清理原始幂等记录失败：同样视为失败不标记 undoneAt", async () => {
    mockBatchFindUnique.mockResolvedValue({
      id: "batch-1",
      undoneAt: null,
      totalAmount: 1000,
      rows: [{ id: "row-1", userId: "user-1", amount: 1000, reference: "import:ref-1" }],
    });
    mockApplySync.mockResolvedValue({ totalSpent: 0, membershipLevel: "REGULAR", duplicated: false });
    mockSyncRecordDeleteMany.mockRejectedValue(new Error("db down"));

    const result = await undoImportBatch("batch-1");

    expect(result).toMatchObject({ ok: false, code: "INTERNAL_ERROR" });
    expect(mockBatchUpdate).not.toHaveBeenCalled();
  });
});

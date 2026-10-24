/**
 * 消费记录 Excel 批量导入核心逻辑测试
 * 覆盖：Excel 解析（正常/坏表头/坏行）、预览校验（用户存在性）、
 * 执行入账（成功/幂等/用户不存在）、整批撤销（成功/已撤销/部分失败）
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as XLSX from "xlsx";

vi.mock("@/lib/prisma", () => {
  const prisma: Record<string, unknown> = {
    user: { findMany: vi.fn() },
    spentImportBatch: { create: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    spentImportRow: { update: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    spentAdjustmentApplication: { findMany: vi.fn() },
    spentSyncRecord: { updateMany: vi.fn(), deleteMany: vi.fn() },
  };
  prisma.$transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma));
  prisma.$executeRaw = vi.fn().mockResolvedValue([]);
  return { prisma, default: prisma };
});

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
  parseImportWorkbookIsolated,
  previewImportRows,
  executeImportBatch,
  undoImportBatch,
  signImportPreviewToken,
  verifyImportPreviewToken,
} from "@/lib/spent-import";

const mockUserFindMany = prisma.user.findMany as ReturnType<typeof vi.fn>;
const mockBatchCreate = prisma.spentImportBatch.create as ReturnType<typeof vi.fn>;
const mockBatchFindFirst = prisma.spentImportBatch.findFirst as ReturnType<typeof vi.fn>;
const mockBatchFindUnique = prisma.spentImportBatch.findUnique as ReturnType<typeof vi.fn>;
const mockBatchUpdate = prisma.spentImportBatch.update as ReturnType<typeof vi.fn>;
const mockRowUpdate = prisma.spentImportRow.update as ReturnType<typeof vi.fn>;
const mockRowFindFirst = prisma.spentImportRow.findFirst as ReturnType<typeof vi.fn>;
const mockRowFindMany = prisma.spentImportRow.findMany as ReturnType<typeof vi.fn>;
const mockSyncRecordUpdateMany = prisma.spentSyncRecord.updateMany as ReturnType<typeof vi.fn>;
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
      [" 13900139000 ", "500", "", "JD", "TM002", ""],
      [null, null, null, null, null, null],
    ]);
    const result = parseImportWorkbook(buffer, "import.xlsx");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toHaveLength(2);
    expect(result.fileHash).toMatch(/^[0-9a-f]{64}$/);
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

  it("渠道解析：新渠道标签、历史渠道与旧标签均兼容", () => {
    const buffer = buildWorkbook([
      HEADERS,
      ["13800138000", 100, "", "天猫国际", "A1", ""],
      ["13800138000", 100, "", "抖音商城", "B1", ""],
      ["13800138000", 100, "", "小红书", "C1", ""],
      ["13800138000", 100, "", "经销渠道", "D1", ""],
      ["13800138000", 100, "", "其它", "E1", ""],
      ["13800138000", 100, "", "天猫", "F1", ""],
      ["13800138000", 100, "", "微信小程序", "G1", ""],
    ]);
    const result = parseImportWorkbook(buffer, "import.xlsx");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows.map((r) => r.channel)).toEqual([
      "TMALL",
      "DOUYIN",
      "XIAOHONGSHU",
      "DEALER",
      "OTHER",
      "TMALL",
      "MINIPROGRAM",
    ]);
    expect(result.rows.every((r) => r.error === null)).toBe(true);
  });

  it("表头错误：返回 INVALID_HEADER", () => {
    const buffer = buildWorkbook([
      ["姓名", "金额"],
      ["13800138000", 100],
    ]);
    const result = parseImportWorkbook(buffer, "import.xlsx");
    expect(result).toMatchObject({ ok: false, code: "INVALID_HEADER" });
  });

  it("坏行：手机号/金额/日期/渠道错误逐行报错", () => {
    const buffer = buildWorkbook([
      HEADERS,
      ["12345", "abc", "2026-13-99", "拼多多", "", ""],
      ["13800138000", -200, "", "微信小程序", "TM003", ""],
    ]);
    const result = parseImportWorkbook(buffer, "import.xlsx");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows[0].error).toContain("手机号格式不正确");
    expect(result.rows[0].error).toContain("金额必须为非零整数");
    expect(result.rows[0].error).toContain("消费日期格式不正确");
    expect(result.rows[0].error).toContain("渠道不正确");
    expect(result.rows[1]).toMatchObject({
      phone: "13800138000",
      amount: -200,
      channel: "MINIPROGRAM",
      error: null,
    });
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

  it("CSV 文件可解析，并支持 GBK 编码", () => {
    const text =
      "手机号,金额（元）,消费日期,订单号/小票号\n13800138000,100,2026-01-15,CSV001\n";
    const utf8 = parseImportWorkbook(Buffer.from(text, "utf-8"), "import.csv");
    expect(utf8.ok).toBe(true);
    if (!utf8.ok) return;
    expect(utf8.rows[0]).toMatchObject({
      phone: "13800138000",
      amount: 100,
      purchasedAt: "2026-01-15",
    });

    const gbkBuffer = Buffer.from(
      "yta7+rrFLL3wtu6jqNSqo6ksz/u30cjVxtostqm1pbrFL9ChxrG6xQoxMzgwMDEzODAwMCwxMDAsMjAyNi0wMS0xNSxDU1YwMDEK",
      "base64"
    );
    const gbk = parseImportWorkbook(gbkBuffer, "import-gbk.csv");
    expect(gbk.ok).toBe(true);
    if (!gbk.ok) return;
    expect(gbk.rows[0]).toMatchObject({
      phone: "13800138000",
      amount: 100,
      orderNo: "CSV001",
    });
  });

  it("表头可重排，订单号必填", () => {
    const reordered = buildWorkbook([
      ["金额（元）", "订单号/小票号", "手机号", "备注", "渠道", "消费日期"],
      [1280, "REORDER-1", "13800138000", "备注", "天猫", "2026-01-15"],
    ]);
    const result = parseImportWorkbook(reordered, "reordered.xlsx");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows[0]).toMatchObject({
      phone: "13800138000",
      amount: 1280,
      orderNo: "REORDER-1",
      channel: "TMALL",
      error: null,
    });

    const missingOrder = parseImportWorkbook(
      buildWorkbook([HEADERS, ["13800138000", 100, "", "", "", ""]]),
      "missing-order.xlsx"
    );
    expect(missingOrder.ok).toBe(true);
    if (!missingOrder.ok) return;
    expect(missingOrder.rows[0].error).toContain("订单号/小票号必填");
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

  it("worker 隔离解析正常 xlsx", async () => {
    const buffer = buildWorkbook([HEADERS, ["13800138000", 100, "2026-01-15", "", "W001"]]);
    const result = await parseImportWorkbookIsolated(buffer, "import.xlsx");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].phone).toBe("13800138000");
  }, 20_000);
});

describe("previewImportRows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserFindMany.mockResolvedValue([
      { id: "user-1", phone: "13800138000", status: "ACTIVE" },
    ]);
    (prisma.spentAdjustmentApplication.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    mockRowFindMany.mockResolvedValue([]);
  });

  it("已注册手机号可导入，未注册报错", async () => {
    const { rows, okCount, errorCount, totalAmount } = await previewImportRows([
      {
        rowIndex: 2,
        phone: "13800138000",
        amount: 100,
        channel: null,
        orderNo: "PREVIEW-1",
        orderNoKey: "PREVIEW-1",
        purchasedAt: null,
        note: null,
        error: null,
      },
      {
        rowIndex: 3,
        phone: "13900139000",
        amount: 200,
        channel: null,
        orderNo: "PREVIEW-2",
        orderNoKey: "PREVIEW-2",
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
      select: { id: true, phone: true, status: true },
    });
  });

  it("手机号打码展示", async () => {
    const { rows } = await previewImportRows([
      {
        rowIndex: 2,
        phone: "13800138000",
        amount: 100,
        channel: null,
        orderNo: "PREVIEW-1",
        orderNoKey: "PREVIEW-1",
        purchasedAt: null,
        note: null,
        error: null,
      },
    ]);
    expect(rows[0].maskedPhone).toBe("138****8000");
  });

  it("预览阶段识别已审核、已导入和文件内重复订单号", async () => {
    (prisma.spentAdjustmentApplication.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { userId: "user-1", orderNo: "APPROVED-1", status: "APPROVED" },
    ]);
    mockRowFindMany.mockResolvedValue([
      { userId: "user-1", orderNo: "IMPORTED-1" },
    ]);

    const baseRow = {
      rowIndex: 2,
      phone: "13800138000",
      amount: 100,
      channel: null,
      purchasedAt: null,
      note: null,
      error: null,
    };
    const { rows, okCount } = await previewImportRows([
      { ...baseRow, orderNo: "APPROVED-1", orderNoKey: "APPROVED-1" },
      { ...baseRow, rowIndex: 3, orderNo: "IMPORTED-1", orderNoKey: "IMPORTED-1" },
      { ...baseRow, rowIndex: 4, orderNo: "NEW-1", orderNoKey: "NEW-1" },
      { ...baseRow, rowIndex: 5, orderNo: "NEW-1", orderNoKey: "NEW-1" },
    ]);

    expect(rows[0].error).toContain("补录审核");
    expect(rows[1].error).toContain("Excel 导入");
    expect(rows[2].error).toBeNull();
    expect(rows[3].error).toContain("文件内订单号重复");
    expect(okCount).toBe(1);
  });

  it("待审核补录订单在预览阶段被拦截", async () => {
    (prisma.spentAdjustmentApplication.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { userId: "user-1", orderNo: "PENDING-1", status: "PENDING" },
    ]);

    const { rows, okCount } = await previewImportRows([
      {
        rowIndex: 2,
        phone: "13800138000",
        amount: 100,
        channel: null,
        orderNo: "PENDING-1",
        orderNoKey: "PENDING-1",
        purchasedAt: null,
        note: null,
        error: null,
      },
    ]);

    expect(rows[0].error).toContain("待审核");
    expect(okCount).toBe(0);
  });
});

describe("executeImportBatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserFindMany.mockResolvedValue([
      { id: "user-1", phone: "13800138000", status: "ACTIVE" },
    ]);
    (prisma.spentAdjustmentApplication.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    mockRowFindMany.mockResolvedValue([]);
    mockBatchFindFirst.mockResolvedValue(null);
    mockBatchCreate.mockImplementation(
      (args: { data: { rows: { create: Record<string, unknown>[] } } }) => ({
        id: "batch-1",
        rows: args.data.rows.create.map((row, index) => ({ ...row, id: `row-${index + 1}` })),
      })
    );
    mockRowUpdate.mockResolvedValue({});
    mockRowFindFirst.mockResolvedValue(null);
    mockBatchUpdate.mockResolvedValue({});
    mockSyncRecordUpdateMany.mockResolvedValue({ count: 1 });
  });

  const okInput = {
    phone: "13800138000",
    amount: 1000,
    channel: "TMALL",
    orderNo: "TM001",
    purchasedAt: "2026-01-15",
    note: null,
  };

  it("待审核补录订单在执行阶段被再次拦截", async () => {
    (prisma.spentAdjustmentApplication.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { userId: "user-1", orderNo: "TM001", status: "PENDING" },
    ]);

    const result = await executeImportBatch({
      rows: [okInput],
      fileName: "pending.xlsx",
      fileHash: "pending123",
      reason: "待审核测试",
      adminId: "admin-1",
    });

    expect(result.errorRows).toBe(1);
    expect(result.rows[0].error).toContain("待审核");
    expect(mockApplySync).not.toHaveBeenCalled();
  });

  it("成功行入账：reference 内容哈希且幂等稳定", async () => {
    mockApplySync.mockResolvedValue({
      totalSpent: 1000,
      membershipLevel: "SILVER",
      appliedDelta: 1000,
      duplicated: false,
    });

    const result = await executeImportBatch({
      rows: [okInput],
      fileName: "import.xlsx",
      fileHash: "abc123",
      reason: "测试导入",
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
    // SpentSyncRecord 仍使用批内唯一 reference，保证撤销后可重新导入
    expect(call.reference).toMatch(/^import:[0-9a-f]{32}:[0-9a-f-]+$/);
    const contentReference = call.reference.replace(/:[0-9a-f-]+$/, "");

    // 批次先创建，行初始为 PENDING；成功后批次更新为 COMPLETED
    expect(mockBatchCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        adminId: "admin-1",
        reason: "测试导入",
        totalRows: 1,
        status: "PROCESSING",
        rows: {
          create: [
            expect.objectContaining({
              phone: "13800138000",
              amount: 1000,
              channel: "TMALL",
              orderNo: "TM001",
              orderNoKey: "TM001",
              status: "PENDING",
              userId: "user-1",
              syncReference: contentReference,
              reference: call.reference,
            }),
          ],
        },
      }),
      include: { rows: true },
    });
    expect(mockBatchUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "batch-1" },
        data: expect.objectContaining({
          status: "COMPLETED",
          successRows: 1,
          totalAmount: 1000,
        }),
      })
    );
  });

  it("相同内容跨批次：第二次上传通过 syncReference 预检标记重复，不重复入账", async () => {
    mockApplySync.mockResolvedValue({
      totalSpent: 1000,
      membershipLevel: "REGULAR",
      appliedDelta: 1000,
      duplicated: false,
    });
    await executeImportBatch({
      rows: [okInput],
      fileName: "a.xlsx",
      fileHash: "aaa111",
      reason: "测试导入",
      adminId: "admin-1",
    });
    // 模拟已存在一条成功且未撤销的同内容行
    mockRowFindFirst.mockResolvedValueOnce({ id: "row-existing" });
    const second = await executeImportBatch({
      rows: [okInput],
      fileName: "b.xlsx",
      fileHash: "def456",
      reason: "测试导入",
      adminId: "admin-1",
    });

    expect(mockApplySync).toHaveBeenCalledTimes(1);
    expect(second).toMatchObject({ successRows: 0, duplicateRows: 1, errorRows: 0 });
  });

  it("未注册手机号：行标记 ERROR，不调用入账", async () => {
    mockUserFindMany.mockResolvedValue([]);

    const result = await executeImportBatch({
      rows: [okInput],
      fileName: "import.xlsx",
      fileHash: "abc123",
      reason: "测试导入",
      adminId: "admin-1",
    });

    expect(result.errorRows).toBe(1);
    expect(result.rows[0]).toMatchObject({ status: "ERROR", error: "该手机号未注册官网账户" });
    expect(mockApplySync).not.toHaveBeenCalled();
  });

  it("幂等命中：行标记 DUPLICATE，不重复入账", async () => {
    mockApplySync.mockResolvedValue({
      totalSpent: 1000,
      membershipLevel: "SILVER",
      appliedDelta: 0,
      duplicated: true,
    });

    const result = await executeImportBatch({
      rows: [okInput],
      fileName: "import.xlsx",
      fileHash: "abc123",
      reason: "测试导入",
      adminId: "admin-1",
    });

    expect(result.duplicateRows).toBe(1);
    expect(result.successRows).toBe(0);
    expect(result.totalAmount).toBe(0);
    expect(result.rows[0].status).toBe("DUPLICATE");
    expect(mockBatchUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "FAILED" }),
      })
    );
  });

  it("并发订单唯一冲突：自动冲正并按重复处理", async () => {
    mockApplySync
      .mockResolvedValueOnce({
        totalSpent: 1000,
        membershipLevel: "SILVER",
        appliedDelta: 1000,
        duplicated: false,
      })
      .mockResolvedValueOnce({
        totalSpent: 0,
        membershipLevel: "REGULAR",
        appliedDelta: -1000,
        duplicated: false,
      });
    mockRowUpdate
      .mockRejectedValueOnce(Object.assign(new Error("unique"), { code: "P2002" }))
      .mockResolvedValue({});

    const result = await executeImportBatch({
      rows: [okInput],
      fileName: "race.xlsx",
      fileHash: "race123",
      reason: "并发测试",
      adminId: "admin-1",
    });

    expect(result.duplicateRows).toBe(1);
    expect(mockApplySync).toHaveBeenCalledTimes(2);
    expect(mockApplySync).toHaveBeenLastCalledWith(
      expect.objectContaining({ userId: "user-1", spentDelta: -1000 })
    );
  });

  it("入账异常：行标记 ERROR，不影响汇总", async () => {
    mockApplySync.mockRejectedValue(new Error("boom"));

    const result = await executeImportBatch({
      rows: [okInput],
      fileName: "import.xlsx",
      fileHash: "abc123",
      reason: "测试导入",
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
        {
          id: "row-1",
          userId: "user-1",
          amount: 1000,
          appliedDelta: 1000,
          revertedAt: null,
          reference: "import:ref-1",
        },
        {
          id: "row-2",
          userId: "user-2",
          amount: 500,
          appliedDelta: 500,
          revertedAt: null,
          reference: "import:ref-2",
        },
      ],
    });
    mockApplySync.mockResolvedValue({
      totalSpent: 0,
      membershipLevel: "REGULAR",
      appliedDelta: -1000,
      duplicated: false,
    });
    mockSyncRecordUpdateMany.mockResolvedValue({ count: 1 });
    mockRowUpdate.mockResolvedValue({});
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
    // 标记原始记录已撤销（保留审计，不物理删除）
    expect(mockSyncRecordUpdateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", reference: "import:ref-1" },
      data: { revertedAt: expect.any(Date) },
    });
    expect(mockSyncRecordUpdateMany).toHaveBeenCalledWith({
      where: { userId: "user-2", reference: "import:ref-2" },
      data: { revertedAt: expect.any(Date) },
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
        {
          id: "row-1",
          userId: "user-1",
          amount: 1000,
          appliedDelta: 1000,
          revertedAt: null,
          reference: "import:ref-1",
        },
        {
          id: "row-2",
          userId: "user-2",
          amount: 500,
          appliedDelta: 500,
          revertedAt: null,
          reference: "import:ref-2",
        },
      ],
    });
    mockApplySync
      .mockResolvedValueOnce({
        totalSpent: 0,
        membershipLevel: "REGULAR",
        appliedDelta: -1000,
        duplicated: false,
      })
      .mockRejectedValueOnce(new Error("boom"));
    mockSyncRecordUpdateMany.mockResolvedValue({ count: 1 });

    const result = await undoImportBatch("batch-1");

    expect(result).toMatchObject({ ok: false, code: "INTERNAL_ERROR" });
    expect(mockBatchUpdate).not.toHaveBeenCalled();
  });

  it("清理原始幂等记录失败：同样视为失败不标记 undoneAt", async () => {
    mockBatchFindUnique.mockResolvedValue({
      id: "batch-1",
      undoneAt: null,
      totalAmount: 1000,
      rows: [
        {
          id: "row-1",
          userId: "user-1",
          amount: 1000,
          appliedDelta: 1000,
          revertedAt: null,
          reference: "import:ref-1",
        },
      ],
    });
    mockApplySync.mockResolvedValue({
      totalSpent: 0,
      membershipLevel: "REGULAR",
      appliedDelta: -1000,
      duplicated: false,
    });
    mockSyncRecordUpdateMany.mockRejectedValue(new Error("db down"));

    const result = await undoImportBatch("batch-1");

    expect(result).toMatchObject({ ok: false, code: "INTERNAL_ERROR" });
    expect(mockBatchUpdate).not.toHaveBeenCalled();
  });
});

describe("导入预览加密令牌", () => {
  const rows = [
    {
      rowIndex: 2,
      phone: "13800138000",
      amount: 100,
      channel: null,
      orderNo: "TOKEN-1",
      orderNoKey: "TOKEN-1",
      purchasedAt: null,
      note: null,
      error: null,
    },
  ];

  it("令牌不包含明文手机号，可还原完整行并绑定管理员", () => {
    const token = signImportPreviewToken({
      adminId: "admin-1",
      fileName: "a.xlsx",
      fileHash: "file-hash-1",
      rows,
    });
    expect(token).not.toContain("13800138000");
    const verified = verifyImportPreviewToken(token, "admin-1");
    expect(verified.ok).toBe(true);
    if (!verified.ok) return;
    expect(verified.payload.rows[0]).toMatchObject({
      phone: "13800138000",
      orderNo: "TOKEN-1",
    });
    expect(verifyImportPreviewToken(token, "admin-2")).toMatchObject({
      ok: false,
      code: "TOKEN_FORBIDDEN",
    });
  });

  it("篡改令牌或过期令牌被拒绝", () => {
    const token = signImportPreviewToken({
      adminId: "admin-1",
      fileName: "a.xlsx",
      fileHash: "file-hash-1",
      rows,
    });
    const parts = token.split(".");
    parts[3] = `${parts[3][0] === "A" ? "B" : "A"}${parts[3].slice(1)}`;
    expect(verifyImportPreviewToken(parts.join("."), "admin-1")).toMatchObject({
      ok: false,
      code: "INVALID_TOKEN",
    });
  });
});

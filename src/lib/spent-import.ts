/**
 * 消费记录 Excel 批量导入服务模块（管理端）
 *
 * 流程（两阶段）：
 * 1. 上传 + 预览：parseImportWorkbook 解析 Excel → previewImportRows 逐行校验
 *    （含手机号格式、金额、用户存在性），不落库不入账。
 * 2. 确认执行：executeImportBatch 重新全量校验（不信任客户端），逐行调用
 *    applyExternalSpentSync 入账（幂等、自动重算等级、失效 profile 缓存）。
 *
 * 幂等：逐行 reference 由行内容（手机号+金额+订单号+日期）内容哈希生成，
 * 同一文件重复上传、仅修改部分行后重新导入，未变化行均命中幂等跳过。
 * 支持整批撤销（undoImportBatch）：对每行成功入账反向冲正，撤销本身幂等。
 */
import { createHash } from "crypto";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { apiConsole } from "@/lib/logger";
import { applyExternalSpentSync } from "@/lib/points";
import { SPENT_CHANNEL_LABELS, SPENT_CHANNELS } from "@/lib/spent-adjustment-meta";
import type { SpentAdjustmentChannel } from "@/generated/prisma/client";

export const IMPORT_MAX_FILE_SIZE = 5 * 1024 * 1024; // 上传文件大小上限（5MB）
export const IMPORT_MAX_ROWS = 1000; // 单次导入数据行上限
export const IMPORT_MAX_AMOUNT = 1_000_000; // 单行金额绝对值上限（元）
export const IMPORT_MAX_ORDER_NO_LENGTH = 64;
export const IMPORT_MAX_NOTE_LENGTH = 500;
export const IMPORT_ALLOWED_EXTENSIONS = [".xlsx", ".xls", ".csv"];

export const IMPORT_HEADERS = [
  "手机号",
  "金额（元）",
  "消费日期",
  "渠道",
  "订单号/小票号",
  "备注",
] as const;

export interface ParsedImportRow {
  rowIndex: number; // Excel 中的数据行号（表头为第 1 行，数据从 2 开始）
  phone: string | null;
  amount: number | null;
  channel: SpentAdjustmentChannel | null;
  orderNo: string | null;
  purchasedAt: string | null; // YYYY-MM-DD
  note: string | null;
  error: string | null;
}

export interface PreviewRow extends ParsedImportRow {
  channelLabel: string | null;
  userExists: boolean | null;
  maskedPhone: string | null;
}

export interface ImportPreview {
  fileName: string;
  fileHash: string;
  rows: PreviewRow[];
  okCount: number;
  errorCount: number;
  totalAmount: number;
}

export interface ExecuteRowInput {
  phone: string;
  amount: number;
  channel?: string | null;
  orderNo?: string | null;
  purchasedAt?: string | null; // YYYY-MM-DD
  note?: string | null;
}

export interface ExecuteRowResult {
  rowIndex: number;
  phone: string;
  amount: number;
  status: "SUCCESS" | "DUPLICATE" | "ERROR";
  error: string | null;
  reference: string | null;
}

export interface ExecuteResult {
  batchId: string;
  totalRows: number;
  successRows: number;
  duplicateRows: number;
  errorRows: number;
  totalAmount: number;
  rows: ExecuteRowResult[];
}

export type ImportParseError = {
  ok: false;
  code: "INVALID_FILE" | "TOO_MANY_ROWS" | "INVALID_HEADER";
  message: string;
};

export type ImportParseResult =
  | { ok: true; fileHash: string; rows: ParsedImportRow[] }
  | ImportParseError;

const CHANNEL_BY_LABEL: Record<string, SpentAdjustmentChannel> = {};
for (const channel of SPENT_CHANNELS) {
  CHANNEL_BY_LABEL[SPENT_CHANNEL_LABELS[channel]] = channel;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatDateISO(y: number, m: number, d: number): string | null {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

function parseExcelDateValue(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
  }
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return formatDateISO(parsed.y, parsed.m, parsed.d);
  }
  if (typeof value === "string") {
    const s = value.trim();
    if (!s) return null;
    const match = s.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?$/);
    if (match) {
      return formatDateISO(Number(match[1]), Number(match[2]), Number(match[3]));
    }
    const parsed = new Date(s);
    if (Number.isNaN(parsed.getTime())) return null;
    return `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}-${pad2(parsed.getDate())}`;
  }
  return null;
}

function parsePhoneValue(value: unknown): string | null {
  if (typeof value === "number") {
    const s = String(Math.trunc(value));
    return /^1[3-9]\d{9}$/.test(s) ? s : null;
  }
  if (typeof value === "string") {
    const s = value.trim().replace(/[\s-]/g, "");
    return /^1[3-9]\d{9}$/.test(s) ? s : null;
  }
  return null;
}

function parseAmountValue(value: unknown): number | null {
  let n: number;
  if (typeof value === "number") {
    n = value;
  } else if (typeof value === "string") {
    const s = value.trim().replace(/[¥,，\s]/g, "");
    if (!/^-?\d+$/.test(s)) return null;
    n = Number(s);
  } else {
    return null;
  }
  if (!Number.isFinite(n) || !Number.isInteger(n) || n === 0) return null;
  if (Math.abs(n) > IMPORT_MAX_AMOUNT) return null;
  return n;
}

function parseChannelValue(value: unknown): {
  channel: SpentAdjustmentChannel | null;
  invalid: boolean;
} {
  if (value == null) return { channel: null, invalid: false };
  if (typeof value !== "string" && typeof value !== "number") {
    return { channel: null, invalid: true };
  }
  const raw = String(value).trim();
  if (!raw) return { channel: null, invalid: false };
  const upper = raw.toUpperCase();
  if ((SPENT_CHANNELS as readonly string[]).includes(upper)) {
    return { channel: upper as SpentAdjustmentChannel, invalid: false };
  }
  const byLabel = CHANNEL_BY_LABEL[raw];
  if (byLabel) return { channel: byLabel, invalid: false };
  return { channel: null, invalid: true };
}

function parseOrderNoValue(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.slice(0, IMPORT_MAX_ORDER_NO_LENGTH);
}

function parseNoteValue(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.slice(0, IMPORT_MAX_NOTE_LENGTH);
}

function rowReference(phone: string, amount: number, orderNo: string | null, purchasedAt: string | null): string {
  const hash = createHash("sha256")
    .update(`${phone}|${amount}|${orderNo ?? ""}|${purchasedAt ?? ""}`)
    .digest("hex")
    .slice(0, 32);
  return `import:${hash}`;
}

// 逐行入账并发度：控制批量导入总耗时（客户端 30s 超时），
// 同用户并发冲突由 applyExternalSpentSync 的 CAS 重试兜底。
const IMPORT_EXECUTE_CONCURRENCY = 8;

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function cellText(cell: unknown): string {
  if (cell == null) return "";
  return String(cell).trim();
}

/**
 * 解析 Excel/CSV 文件（不落库），返回文件哈希与逐行解析结果。
 * 表头必须与 IMPORT_HEADERS 一致（仅校验前两列关键字，其余按列位读取）。
 */
export function parseImportWorkbook(
  buffer: Buffer,
  fileName: string
): ImportParseResult {
  const ext = fileName.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? "";
  if (!IMPORT_ALLOWED_EXTENSIONS.includes(ext)) {
    return {
      ok: false,
      code: "INVALID_FILE",
      message: "仅支持 .xlsx / .xls / .csv 格式文件",
    };
  }
  if (buffer.length > IMPORT_MAX_FILE_SIZE) {
    return {
      ok: false,
      code: "INVALID_FILE",
      message: `文件大小不能超过 ${IMPORT_MAX_FILE_SIZE / 1024 / 1024}MB`,
    };
  }

  let sheet: XLSX.WorkSheet;
  try {
    // codepage 65001：CSV 内容按 UTF-8 解码，避免中文表头乱码
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false, codepage: 65001 });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      return { ok: false, code: "INVALID_FILE", message: "文件中没有工作表" };
    }
    sheet = workbook.Sheets[firstSheetName];
  } catch {
    return { ok: false, code: "INVALID_FILE", message: "文件解析失败，请确认文件未损坏" };
  }

  // 防 DoS：!ref 声明范围可能被恶意文件虚标到数百万行/列（zip 高度可压缩），
  // sheet_to_json 会按声明范围逐行填充，直接转换可导致内存爆炸。
  // 因此：1) 检测读取上限之外是否真实存在单元格（格式刷整列只会虚高 !ref，不产生真实单元格）；
  // 2) 仅在上限范围内转换。真实单元格只按实际存在的数量迭代，开销可控。
  const declaredRange = sheet["!ref"]
    ? XLSX.utils.decode_range(sheet["!ref"])
    : { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } };
  const MAX_READ_ROWS = IMPORT_MAX_ROWS + 200; // 表头 + 1000 行 + 容错空行
  const MAX_READ_COLS = 20; // 模板仅 6 列，留余量

  const rowLimit = declaredRange.s.r + MAX_READ_ROWS - 1;
  if (declaredRange.e.r > rowLimit) {
    for (const key of Object.keys(sheet)) {
      if (key.startsWith("!")) continue;
      const cell = XLSX.utils.decode_cell(key);
      if (cell.r > rowLimit) {
        return {
          ok: false,
          code: "TOO_MANY_ROWS",
          message: `单次最多导入 ${IMPORT_MAX_ROWS} 行，请拆分文件后重试`,
        };
      }
    }
  }

  const readRange = XLSX.utils.encode_range({
    s: declaredRange.s,
    e: {
      r: Math.min(declaredRange.e.r, rowLimit),
      c: Math.min(declaredRange.e.c, MAX_READ_COLS - 1),
    },
  });
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    range: readRange,
  });

  const headerRowIndex = aoa.findIndex((row) => cellText(row?.[0]).includes("手机号"));
  if (headerRowIndex === -1) {
    return {
      ok: false,
      code: "INVALID_HEADER",
      message: "表头不正确：第一列应为「手机号」，请使用下载的模板填写",
    };
  }
  const header = aoa[headerRowIndex];
  if (!cellText(header?.[1]).includes("金额")) {
    return {
      ok: false,
      code: "INVALID_HEADER",
      message: "表头不正确：第二列应为「金额（元）」，请使用下载的模板填写",
    };
  }

  const dataRows = aoa.slice(headerRowIndex + 1).filter((row) =>
    row.some((cell) => cellText(cell) !== "")
  );
  if (dataRows.length === 0) {
    return { ok: false, code: "INVALID_FILE", message: "文件中没有数据行" };
  }
  if (dataRows.length > IMPORT_MAX_ROWS) {
    return {
      ok: false,
      code: "TOO_MANY_ROWS",
      message: `单次最多导入 ${IMPORT_MAX_ROWS} 行，当前 ${dataRows.length} 行`,
    };
  }

  const rows: ParsedImportRow[] = dataRows.map((row, i) => {
    const rowIndex = headerRowIndex + 2 + i;
    const phone = parsePhoneValue(row[0]);
    const amount = parseAmountValue(row[1]);
    const purchasedAt = parseExcelDateValue(row[2]);
    const channelResult = parseChannelValue(row[3]);
    const orderNo = parseOrderNoValue(row[4]);
    const note = parseNoteValue(row[5]);

    const errors: string[] = [];
    if (phone === null) errors.push("手机号格式不正确（应为 11 位大陆手机号）");
    if (amount === null) errors.push("金额必须为非零整数（元），绝对值不超过 100 万");
    if (cellText(row[2]) && purchasedAt === null) errors.push("消费日期格式不正确（如 2026-01-15）");
    if (channelResult.invalid) {
      errors.push(
        `渠道不正确（可选：${SPENT_CHANNELS.map((c) => SPENT_CHANNEL_LABELS[c]).join(" / ")}）`
      );
    }

    return {
      rowIndex,
      phone,
      amount,
      channel: channelResult.channel,
      orderNo,
      purchasedAt,
      note,
      error: errors.length > 0 ? errors.join("；") : null,
    };
  });

  const fileHash = createHash("md5").update(buffer).digest("hex");
  return { ok: true, fileHash, rows };
}

function maskPhoneValue(phone: string | null): string | null {
  if (!phone) return null;
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

/**
 * 预览校验：定位手机号对应用户（存在性检查），不落库不入账。
 */
export async function previewImportRows(
  rows: ParsedImportRow[]
): Promise<{ rows: PreviewRow[]; okCount: number; errorCount: number; totalAmount: number }> {
  const validPhones = [
    ...new Set(rows.filter((r) => r.phone && !r.error).map((r) => r.phone as string)),
  ];
  const users = await prisma.user.findMany({
    where: { phone: { in: validPhones } },
    select: { phone: true },
  });
  const existingPhones = new Set(users.map((u) => u.phone));

  let okCount = 0;
  let errorCount = 0;
  let totalAmount = 0;

  const previewRows: PreviewRow[] = rows.map((row) => {
    let error = row.error;
    let userExists: boolean | null = null;
    if (!error && row.phone) {
      userExists = existingPhones.has(row.phone);
      if (!userExists) {
        error = "该手机号未注册官网账户，请先注册或检查手机号";
      }
    }
    if (!error) {
      okCount += 1;
      totalAmount += row.amount ?? 0;
    } else {
      errorCount += 1;
    }
    return {
      ...row,
      channelLabel: row.channel ? SPENT_CHANNEL_LABELS[row.channel] : null,
      userExists,
      maskedPhone: maskPhoneValue(row.phone),
      error,
    };
  });

  return { rows: previewRows, okCount, errorCount, totalAmount };
}

function toParsedRow(input: ExecuteRowInput, rowIndex: number): ParsedImportRow {
  const phone = parsePhoneValue(input.phone);
  const amount = typeof input.amount === "number" ? input.amount : null;
  const validAmount =
    amount !== null &&
    Number.isInteger(amount) &&
    Math.abs(amount) <= IMPORT_MAX_AMOUNT &&
    amount !== 0;
  const purchasedAt =
    typeof input.purchasedAt === "string" && input.purchasedAt
      ? parseExcelDateValue(input.purchasedAt)
      : null;
  const purchasedAtInvalid = !!input.purchasedAt && purchasedAt === null;
  const channelResult = parseChannelValue(input.channel ?? null);
  const orderNo = parseOrderNoValue(input.orderNo ?? null);
  const note = parseNoteValue(input.note ?? null);

  if (!phone || !validAmount || purchasedAtInvalid || channelResult.invalid) {
    return {
      rowIndex,
      phone: phone ?? (typeof input.phone === "string" ? input.phone : null),
      amount: amount ?? null,
      channel: channelResult.channel,
      orderNo,
      purchasedAt,
      note,
      error: "参数不合法",
    };
  }

  return {
    rowIndex,
    phone,
    amount,
    channel: channelResult.channel,
    orderNo,
    purchasedAt,
    note,
    error: null,
  };
}

/**
 * 执行导入：逐行入账（重新全量校验，不信任客户端）。
 * 单行失败不影响其它行；幂等命中的行标记 DUPLICATE 不重复入账。
 */
export async function executeImportBatch(params: {
  rows: ExecuteRowInput[];
  fileName: string;
  fileHash?: string;
  adminId: string;
}): Promise<ExecuteResult> {
  const { rows: inputs, fileName, fileHash, adminId } = params;

  if (inputs.length === 0 || inputs.length > IMPORT_MAX_ROWS) {
    throw new Error("IMPORT_ROW_COUNT_INVALID");
  }

  const parsed = inputs.map((input, i) => toParsedRow(input, i + 2));
  const validRows = parsed.filter((r): r is ParsedImportRow & { phone: string; amount: number } => {
    return !r.error && r.phone !== null && r.amount !== null;
  });

  const phones = [...new Set(validRows.map((r) => r.phone))];
  const users = await prisma.user.findMany({
    where: { phone: { in: phones } },
    select: { id: true, phone: true },
  });
  const userIdByPhone = new Map(users.map((u) => [u.phone, u.id]));

  const rowResults = await mapWithConcurrency(
    parsed,
    IMPORT_EXECUTE_CONCURRENCY,
    async (row): Promise<ExecuteRowResult> => {
      if (row.error || row.phone === null || row.amount === null) {
        return {
          rowIndex: row.rowIndex,
          phone: row.phone ?? "",
          amount: row.amount ?? 0,
          status: "ERROR",
          error: row.error || "参数不合法",
          reference: null,
        };
      }

      const userId = userIdByPhone.get(row.phone);
      if (!userId) {
        return {
          rowIndex: row.rowIndex,
          phone: row.phone,
          amount: row.amount,
          status: "ERROR",
          error: "该手机号未注册官网账户",
          reference: null,
        };
      }

      const reference = rowReference(row.phone, row.amount, row.orderNo, row.purchasedAt);
      try {
        const result = await applyExternalSpentSync({
          userId,
          spentDelta: row.amount,
          reference,
          note: `Excel导入：${row.channel ? SPENT_CHANNEL_LABELS[row.channel] : "未填渠道"}${
            row.orderNo ? ` ${row.orderNo}` : ""
          }`,
        });
        if (!result) {
          return {
            rowIndex: row.rowIndex,
            phone: row.phone,
            amount: row.amount,
            status: "ERROR",
            error: "用户不存在",
            reference,
          };
        }
        return {
          rowIndex: row.rowIndex,
          phone: row.phone,
          amount: row.amount,
          status: result.duplicated ? "DUPLICATE" : "SUCCESS",
          error: result.duplicated ? "该记录已入账过（幂等跳过）" : null,
          reference,
        };
      } catch (error) {
        apiConsole.error(`[SpentImport] 行 ${row.rowIndex} 入账失败:`, error);
        return {
          rowIndex: row.rowIndex,
          phone: row.phone,
          amount: row.amount,
          status: "ERROR",
          error: "入账失败，请重试",
          reference,
        };
      }
    }
  );

  const successRows = rowResults.filter((r) => r.status === "SUCCESS").length;
  const duplicateRows = rowResults.filter((r) => r.status === "DUPLICATE").length;
  const errorRows = rowResults.filter((r) => r.status === "ERROR").length;
  const totalAmount = rowResults
    .filter((r) => r.status === "SUCCESS")
    .reduce((sum, r) => sum + r.amount, 0);

  const batch = await prisma.spentImportBatch.create({
    data: {
      adminId,
      fileName: fileName.slice(0, 200),
      fileHash: fileHash?.slice(0, 64) ?? null,
      totalRows: parsed.length,
      successRows,
      duplicateRows,
      errorRows,
      totalAmount,
      rows: {
        create: rowResults.map((r) => {
          const source = parsed.find((p) => p.rowIndex === r.rowIndex);
          const sourcePhone = source?.phone ?? null;
          return {
            phone: r.phone,
            amount: r.amount,
            channel: source?.channel ?? null,
            orderNo: source?.orderNo ?? null,
            purchasedAt: source?.purchasedAt
              ? new Date(`${source.purchasedAt}T00:00:00.000Z`)
              : null,
            note: source?.note ?? null,
            reference: r.reference ?? `import:failed:${r.rowIndex}`,
            status: r.status,
            error: r.error,
            userId: sourcePhone ? (userIdByPhone.get(sourcePhone) ?? null) : null,
          };
        }),
      },
    },
  });

  return {
    batchId: batch.id,
    totalRows: parsed.length,
    successRows,
    duplicateRows,
    errorRows,
    totalAmount,
    rows: rowResults,
  };
}

export type UndoResult =
  | { ok: true; revertedRows: number; totalAmount: number }
  | { ok: false; code: "NOT_FOUND" | "ALREADY_UNDONE" | "NOTHING_TO_UNDO" | "INTERNAL_ERROR"; message: string };

/**
 * 撤销整批导入：对每行 SUCCESS 反向冲正（reference 幂等，重试安全），
 * 并删除行对应的原始正向 SpentSyncRecord，保证撤销后重新导入相同行
 * 不会被幂等误判为重复（不再次入账）。
 * 仅当全部行冲正 + 清理成功才落 undoneAt；部分失败保持未撤销状态，可重试。
 */
export async function undoImportBatch(batchId: string): Promise<UndoResult> {
  const batch = await prisma.spentImportBatch.findUnique({
    where: { id: batchId },
    select: {
      id: true,
      undoneAt: true,
      totalAmount: true,
      rows: {
        where: { status: "SUCCESS" },
        select: { id: true, userId: true, amount: true, reference: true },
      },
    },
  });

  if (!batch) {
    return { ok: false, code: "NOT_FOUND", message: "导入批次不存在" };
  }
  if (batch.undoneAt) {
    return { ok: false, code: "ALREADY_UNDONE", message: "该批次已撤销，不能重复操作" };
  }
  const successRows = batch.rows.filter((r) => r.userId);
  if (successRows.length === 0) {
    return { ok: false, code: "NOTHING_TO_UNDO", message: "该批次没有可撤销的入账记录" };
  }

  const revertResults = await mapWithConcurrency(
    successRows,
    IMPORT_EXECUTE_CONCURRENCY,
    async (row) => {
      try {
        await applyExternalSpentSync({
          userId: row.userId as string,
          spentDelta: -row.amount,
          reference: `import-undo:${batch.id}:${row.id}`,
          note: `撤销Excel导入批次 ${batch.id}`,
        });
        await prisma.spentSyncRecord.deleteMany({
          where: { userId: row.userId as string, reference: row.reference },
        });
        return true;
      } catch (error) {
        apiConsole.error(`[SpentImport] 撤销批次 ${batch.id} 行 ${row.id} 冲正失败:`, error);
        return false;
      }
    }
  );
  const failed = revertResults.filter((ok) => !ok).length;

  if (failed > 0) {
    return {
      ok: false,
      code: "INTERNAL_ERROR",
      message: `冲正失败 ${failed} 行（已完成行不会重复冲正），请稍后重试撤销`,
    };
  }

  await prisma.spentImportBatch.update({
    where: { id: batch.id },
    data: { undoneAt: new Date() },
  });

  return { ok: true, revertedRows: successRows.length, totalAmount: batch.totalAmount };
}

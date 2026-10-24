/**
 * 消费记录 Excel 批量导入服务模块（管理端）
 *
 * 流程（两阶段）：
 * 1. 上传 + 预览：parseImportWorkbook 解析 Excel → previewImportRows 逐行校验
 *    （含手机号格式、金额、用户存在性），不落库不入账。
 * 2. 确认执行：executeImportBatch 重新全量校验（不信任客户端），逐行调用
 *    applyExternalSpentSync 入账（幂等、自动重算等级、失效 profile 缓存）。
 *
 * 幂等：预览令牌加密保存完整行快照；订单号必填，成功订单号在数据库层唯一，
 * 同一文件/跨文件重复订单会被预检或唯一索引拦截。
 * SpentSyncRecord.reference 仍使用批内唯一 `内容键:version`，保证撤销后可重新导入。
 * 支持整批撤销（undoImportBatch）：对每行成功入账反向冲正，撤销本身幂等。
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "crypto";
import { Worker } from "node:worker_threads";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { apiConsole } from "@/lib/logger";
import { applyExternalSpentSync } from "@/lib/points";
import {
  SPENT_CHANNEL_LABELS,
  SPENT_CHANNELS,
  ALL_SPENT_CHANNELS,
} from "@/lib/spent-adjustment-meta";
import {
  normalizeOrderNo,
  releaseSpentOrderClaim,
  SpentOrderConflictError,
} from "@/lib/spent-order";
import type { SpentAdjustmentChannel } from "@/generated/prisma/client";

export { normalizeOrderNo } from "@/lib/spent-order";

export const IMPORT_MAX_FILE_SIZE = 5 * 1024 * 1024; // 上传文件大小上限（5MB）
export const IMPORT_MAX_ROWS = 500; // 单次导入数据行上限（同步请求限制）
export const IMPORT_MAX_AMOUNT = 1_000_000; // 单行金额绝对值上限（元）
export const IMPORT_MAX_ORDER_NO_LENGTH = 64;
export const IMPORT_MAX_NOTE_LENGTH = 500;
export const IMPORT_ALLOWED_EXTENSIONS = [".xlsx", ".xls", ".csv"];
export const IMPORT_PREVIEW_TTL_MS = 30 * 60 * 1000;
export const IMPORT_PREVIEW_TOKEN_MAX_LENGTH = 2_000_000;

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
  /** 规范化订单号：去首尾空格并转大写，用于跨批次去重 */
  orderNoKey: string | null;
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
  /** 实际生效的消费额变动；错误行为 null，重复行为 0 */
  appliedDelta: number | null;
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
  { ok: true; fileHash: string; rows: ParsedImportRow[] } | ImportParseError;

export interface ImportPreviewTokenPayload {
  v: 1;
  adminId: string;
  fileName: string;
  fileHash: string;
  rows: ParsedImportRow[];
  iat: number;
  exp: number;
}

export type ImportPreviewTokenVerifyResult =
  | { ok: true; payload: ImportPreviewTokenPayload }
  | { ok: false; code: "INVALID_TOKEN" | "TOKEN_EXPIRED" | "TOKEN_FORBIDDEN"; message: string };

/**
 * 预览令牌使用 AES-256-GCM 加密，而不是 Base64/仅签名：
 * - 令牌内包含服务端解析后的全部行数据，执行接口不再信任客户端回传的金额/订单号等字段
 * - 绑定 adminId，令牌不能在管理员之间转交
 * - 30 分钟后过期，避免长期保存 PII
 */
function getImportPreviewTokenKey(): Buffer {
  const secret = process.env.JWT_ADMIN_SECRET;
  if (!secret) throw new Error("缺少 JWT_ADMIN_SECRET，无法签发导入预览令牌");
  return createHash("sha256").update(`spent_import_preview:v1:${secret}`).digest();
}

export function signImportPreviewToken(params: {
  adminId: string;
  fileName: string;
  fileHash: string;
  rows: ParsedImportRow[];
}): string {
  const now = Date.now();
  const payload: ImportPreviewTokenPayload = {
    v: 1,
    adminId: params.adminId,
    fileName: params.fileName,
    fileHash: params.fileHash,
    rows: params.rows,
    iat: now,
    exp: now + IMPORT_PREVIEW_TTL_MS,
  };
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getImportPreviewTokenKey(), iv);
  cipher.setAAD(Buffer.from("spent-import-preview:v1", "utf8"));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(
    "."
  );
}

export function verifyImportPreviewToken(
  token: string,
  expectedAdminId: string
): ImportPreviewTokenVerifyResult {
  if (!token || token.length > IMPORT_PREVIEW_TOKEN_MAX_LENGTH) {
    return { ok: false, code: "INVALID_TOKEN", message: "导入预览令牌无效" };
  }
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") {
    return { ok: false, code: "INVALID_TOKEN", message: "导入预览令牌无效" };
  }

  try {
    const iv = Buffer.from(parts[1], "base64url");
    const tag = Buffer.from(parts[2], "base64url");
    const ciphertext = Buffer.from(parts[3], "base64url");
    if (iv.length !== 12 || tag.length !== 16 || ciphertext.length === 0) {
      return { ok: false, code: "INVALID_TOKEN", message: "导入预览令牌无效" };
    }

    const decipher = createDecipheriv("aes-256-gcm", getImportPreviewTokenKey(), iv);
    decipher.setAAD(Buffer.from("spent-import-preview:v1", "utf8"));
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
    const payload = JSON.parse(plaintext) as ImportPreviewTokenPayload;

    if (
      payload.v !== 1 ||
      payload.adminId !== expectedAdminId ||
      typeof payload.fileHash !== "string" ||
      typeof payload.fileName !== "string" ||
      !Array.isArray(payload.rows) ||
      payload.rows.length === 0 ||
      payload.rows.length > IMPORT_MAX_ROWS
    ) {
      return { ok: false, code: "TOKEN_FORBIDDEN", message: "导入预览令牌与当前管理员不匹配" };
    }
    if (!Number.isFinite(payload.exp) || payload.exp < Date.now()) {
      return { ok: false, code: "TOKEN_EXPIRED", message: "导入预览已过期，请重新上传文件" };
    }
    return { ok: true, payload };
  } catch {
    return { ok: false, code: "INVALID_TOKEN", message: "导入预览令牌无效" };
  }
}

const CHANNEL_BY_LABEL: Record<string, SpentAdjustmentChannel> = {};
for (const channel of ALL_SPENT_CHANNELS) {
  CHANNEL_BY_LABEL[SPENT_CHANNEL_LABELS[channel]] = channel;
}
// 渠道更名前的历史标签兼容（旧 Excel 模板）
CHANNEL_BY_LABEL["天猫"] = "TMALL";
CHANNEL_BY_LABEL["其他"] = "OTHER";

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
    // 允许 Excel/ERP 常见的 1280.00 文本格式；金额模型仍为整数元
    const s = value.trim().replace(/[¥,，\s]/g, "");
    if (!/^-?\d+(?:\.0+)?$/.test(s)) return null;
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
  if ((ALL_SPENT_CHANNELS as readonly string[]).includes(upper)) {
    return { channel: upper as SpentAdjustmentChannel, invalid: false };
  }
  const byLabel = CHANNEL_BY_LABEL[raw];
  if (byLabel) return { channel: byLabel, invalid: false };
  return { channel: null, invalid: true };
}

function parseOrderNoValue(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s || s.length > IMPORT_MAX_ORDER_NO_LENGTH) return null;
  return s;
}

function parseNoteValue(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  if (s.length > IMPORT_MAX_NOTE_LENGTH) return null;
  return s;
}

function rowReference(
  phone: string,
  amount: number,
  orderNo: string | null,
  purchasedAt: string | null
): string {
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
 * CSV 编码兼容：中文 Excel 默认导出的 CSV 往往是 GBK/GB18030。
 * 先按 UTF-8 判断表头，失败再用 GB18030 解码为 UTF-8 后交给 xlsx。
 */
function normalizeCsvEncoding(buffer: Buffer, fileName: string): Buffer {
  if (!fileName.toLowerCase().endsWith(".csv")) return buffer;
  const utf8 = buffer.toString("utf8");
  if (utf8.includes("手机号")) return buffer;
  try {
    const gb = new TextDecoder("gb18030").decode(buffer);
    if (gb.includes("手机号")) return Buffer.from(gb, "utf8");
  } catch {
    // 运行环境不支持 GB18030 时保持原 buffer，由解析器返回明确错误
  }
  return buffer;
}

function validateImportFile(buffer: Buffer, fileName: string): ImportParseError | null {
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
  return null;
}

const HEADER_ALIASES: Record<
  "phone" | "amount" | "purchasedAt" | "channel" | "orderNo" | "note",
  string[]
> = {
  phone: ["手机号", "手机"],
  amount: ["金额"],
  purchasedAt: ["消费日期", "日期"],
  channel: ["渠道"],
  orderNo: ["订单号", "小票号", "订单"],
  note: ["备注"],
};

function findHeaderIndex(header: unknown[], aliases: string[]): number {
  return header.findIndex((cell) => {
    const text = cellText(cell);
    return aliases.some((alias) => text.includes(alias));
  });
}

function cellAt(row: unknown[], index: number): unknown {
  return index >= 0 ? row[index] : "";
}

function parseImportAoa(aoa: unknown[][], fileHash: string): ImportParseResult {
  const headerRowIndex = aoa.findIndex((row) =>
    row.some((cell) => cellText(cell).includes("手机号"))
  );
  if (headerRowIndex === -1) {
    return {
      ok: false,
      code: "INVALID_HEADER",
      message: "表头不正确：缺少「手机号」列，请使用下载的模板填写",
    };
  }

  const header = aoa[headerRowIndex] ?? [];
  const columnIndex = {
    phone: findHeaderIndex(header, HEADER_ALIASES.phone),
    amount: findHeaderIndex(header, HEADER_ALIASES.amount),
    purchasedAt: findHeaderIndex(header, HEADER_ALIASES.purchasedAt),
    channel: findHeaderIndex(header, HEADER_ALIASES.channel),
    orderNo: findHeaderIndex(header, HEADER_ALIASES.orderNo),
    note: findHeaderIndex(header, HEADER_ALIASES.note),
  };

  if (columnIndex.amount === -1) {
    return {
      ok: false,
      code: "INVALID_HEADER",
      message: "表头不正确：缺少「金额（元）」列，请使用下载的模板填写",
    };
  }
  if (columnIndex.orderNo === -1) {
    return {
      ok: false,
      code: "INVALID_HEADER",
      message: "表头不正确：缺少「订单号/小票号」列，请使用下载的模板填写",
    };
  }

  const dataRows = aoa
    .slice(headerRowIndex + 1)
    .filter((row) => row.some((cell) => cellText(cell) !== ""));
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
    const phone = parsePhoneValue(cellAt(row, columnIndex.phone));
    const amount = parseAmountValue(cellAt(row, columnIndex.amount));
    const purchasedAt = parseExcelDateValue(cellAt(row, columnIndex.purchasedAt));
    const channelResult = parseChannelValue(cellAt(row, columnIndex.channel));
    const orderNoRaw = cellText(cellAt(row, columnIndex.orderNo));
    const orderNo = parseOrderNoValue(orderNoRaw);
    const noteRaw = cellText(cellAt(row, columnIndex.note));
    const note = parseNoteValue(noteRaw);

    const errors: string[] = [];
    if (phone === null) errors.push("手机号格式不正确（应为 11 位大陆手机号）");
    if (amount === null) errors.push("金额必须为非零整数（元），绝对值不超过 100 万");
    if (cellText(cellAt(row, columnIndex.purchasedAt)) && purchasedAt === null) {
      errors.push("消费日期格式不正确（如 2026-01-15）");
    }
    if (channelResult.invalid) {
      errors.push(
        `渠道不正确（可选：${SPENT_CHANNELS.map((c) => SPENT_CHANNEL_LABELS[c]).join(" / ")}）`
      );
    }
    if (!orderNoRaw) {
      errors.push("订单号/小票号必填，用于跨批次去重");
    } else if (orderNo === null) {
      errors.push(`订单号/小票号不能超过 ${IMPORT_MAX_ORDER_NO_LENGTH} 个字符`);
    }
    if (noteRaw.length > IMPORT_MAX_NOTE_LENGTH) {
      errors.push(`备注不能超过 ${IMPORT_MAX_NOTE_LENGTH} 个字符`);
    }

    return {
      rowIndex,
      phone,
      amount,
      channel: channelResult.channel,
      orderNo,
      orderNoKey: orderNo ? normalizeOrderNo(orderNo) : null,
      purchasedAt,
      note,
      error: errors.length > 0 ? errors.join("；") : null,
    };
  });

  return { ok: true, fileHash, rows };
}

/**
 * 解析 Excel/CSV 文件（不落库），返回文件哈希与逐行解析结果。
 * 表头必须与 IMPORT_HEADERS 一致（仅校验前两列关键字，其余按列位读取）。
 */
export function parseImportWorkbook(buffer: Buffer, fileName: string): ImportParseResult {
  const validation = validateImportFile(buffer, fileName);
  if (validation) return validation;

  let sheet: XLSX.WorkSheet;
  try {
    // CSV 先统一为 UTF-8；xlsx 本身不受编码影响
    const normalized = normalizeCsvEncoding(buffer, fileName);
    const workbook = XLSX.read(normalized, { type: "buffer", cellDates: false, codepage: 65001 });
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
  const MAX_READ_ROWS = IMPORT_MAX_ROWS + 200; // 表头 + 数据行 + 容错空行
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

  const fileHash = createHash("sha256").update(buffer).digest("hex");
  return parseImportAoa(aoa, fileHash);
}

const SPENT_IMPORT_WORKER_SOURCE = `
const { parentPort, workerData } = require("node:worker_threads");
const XLSX = require("xlsx");

try {
  const workbook = XLSX.read(Buffer.from(workerData.buffer), {
    type: "buffer",
    cellDates: false,
    codepage: 65001,
  });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    parentPort.postMessage({ ok: false, code: "INVALID_FILE" });
  } else {
    const sheet = workbook.Sheets[firstSheetName];
    const declaredRange = sheet["!ref"]
      ? XLSX.utils.decode_range(sheet["!ref"])
      : { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } };
    const maxReadRows = ${IMPORT_MAX_ROWS} + 200;
    const maxReadCols = 20;
    const rowLimit = declaredRange.s.r + maxReadRows - 1;

    if (declaredRange.e.r > rowLimit) {
      let tooMany = false;
      for (const key of Object.keys(sheet)) {
        if (key.startsWith("!")) continue;
        const cell = XLSX.utils.decode_cell(key);
        if (cell.r > rowLimit) {
          tooMany = true;
          break;
        }
      }
      if (tooMany) {
        parentPort.postMessage({ ok: false, code: "TOO_MANY_ROWS" });
      } else {
        const readRange = XLSX.utils.encode_range({
          s: declaredRange.s,
          e: {
            r: Math.min(declaredRange.e.r, rowLimit),
            c: Math.min(declaredRange.e.c, maxReadCols - 1),
          },
        });
        const aoa = XLSX.utils.sheet_to_json(sheet, {
          header: 1,
          defval: "",
          range: readRange,
        });
        parentPort.postMessage({ ok: true, aoa });
      }
    } else {
      const readRange = XLSX.utils.encode_range({
        s: declaredRange.s,
        e: {
          r: Math.min(declaredRange.e.r, rowLimit),
          c: Math.min(declaredRange.e.c, maxReadCols - 1),
        },
      });
      const aoa = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: "",
        range: readRange,
      });
      parentPort.postMessage({ ok: true, aoa });
    }
  }
} catch {
  parentPort.postMessage({ ok: false, code: "INVALID_FILE" });
}
`;

class ImportWorkerError extends Error {
  constructor(public readonly code: "INVALID_FILE" | "TOO_MANY_ROWS") {
    super(code);
  }
}

function parseWorkbookInWorker(buffer: Buffer): Promise<unknown[][]> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const worker = new Worker(SPENT_IMPORT_WORKER_SOURCE, {
      eval: true,
      workerData: { buffer },
      resourceLimits: { maxOldGenerationSizeMb: 128 },
    });
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      void worker.terminate();
      reject(new ImportWorkerError("INVALID_FILE"));
    }, 15_000);

    const finish = (task: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      task();
    };

    worker.once("message", (message: { ok?: boolean; aoa?: unknown[][]; code?: string }) => {
      finish(() => {
        if (message.ok && Array.isArray(message.aoa)) {
          resolve(message.aoa);
        } else {
          reject(
            new ImportWorkerError(
              message.code === "TOO_MANY_ROWS" ? "TOO_MANY_ROWS" : "INVALID_FILE"
            )
          );
        }
      });
    });
    worker.once("error", () => {
      finish(() => reject(new ImportWorkerError("INVALID_FILE")));
    });
    worker.once("exit", (code) => {
      if (!settled && code !== 0) {
        finish(() => reject(new ImportWorkerError("INVALID_FILE")));
      }
    });
  });
}

/**
 * 生产路由使用：把不可信的 xlsx 解析放在独立 worker 中，限制内存并设置超时。
 * 行级手机号/金额等纯业务校验仍在主进程执行。
 */
export async function parseImportWorkbookIsolated(
  buffer: Buffer,
  fileName: string
): Promise<ImportParseResult> {
  const validation = validateImportFile(buffer, fileName);
  if (validation) return validation;

  try {
    const normalized = normalizeCsvEncoding(buffer, fileName);
    const aoa = await parseWorkbookInWorker(normalized);
    const fileHash = createHash("sha256").update(buffer).digest("hex");
    return parseImportAoa(aoa, fileHash);
  } catch (error) {
    if (error instanceof ImportWorkerError && error.code === "TOO_MANY_ROWS") {
      return {
        ok: false,
        code: "TOO_MANY_ROWS",
        message: `单次最多导入 ${IMPORT_MAX_ROWS} 行，请拆分文件后重试`,
      };
    }
    return {
      ok: false,
      code: "INVALID_FILE",
      message: "文件解析失败，请确认文件未损坏",
    };
  }
}

function maskPhoneValue(phone: string | null): string | null {
  if (!phone) return null;
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

/**
 * 预览校验：定位手机号对应用户（存在性检查），不落库不入账。
 */
const USER_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "正常",
  SUSPENDED: "冻结",
  BANNED: "封禁",
  DELETED: "已注销",
};

export async function previewImportRows(
  rows: ParsedImportRow[]
): Promise<{ rows: PreviewRow[]; okCount: number; errorCount: number; totalAmount: number }> {
  const validPhones = [
    ...new Set(rows.filter((r) => r.phone && !r.error).map((r) => r.phone as string)),
  ];
  const users = await prisma.user.findMany({
    where: { phone: { in: validPhones } },
    select: { id: true, phone: true, status: true },
  });
  const userByPhone = new Map(users.map((user) => [user.phone, user]));
  const userIds = users.map((user) => user.id);
  const orderNoKeys = [
    ...new Set(rows.map((row) => row.orderNoKey).filter((key): key is string => !!key)),
  ];

  const [adjustmentApplications, importedRows, orderClaims] = await Promise.all([
    userIds.length > 0
      ? prisma.spentAdjustmentApplication.findMany({
          where: {
            userId: { in: userIds },
            status: { in: ["PENDING", "APPROVED"] },
            orderNo: { not: "" },
          },
          select: { userId: true, orderNo: true, status: true },
        })
      : Promise.resolve([]),
    userIds.length > 0
      ? prisma.spentImportRow.findMany({
          where: {
            userId: { in: userIds },
            status: "SUCCESS",
            revertedAt: null,
            orderNo: { not: null },
          },
          select: { userId: true, orderNo: true },
        })
      : Promise.resolve([]),
    userIds.length > 0 && orderNoKeys.length > 0 && prisma.spentOrderClaim
      ? prisma.spentOrderClaim.findMany({
          where: {
            userId: { in: userIds },
            orderNoKey: { in: orderNoKeys },
          },
          select: { userId: true, orderNoKey: true },
        })
      : Promise.resolve([]),
  ]);

  const pendingOrderKeys = new Set(
    adjustmentApplications
      .filter((application) => application.status === "PENDING")
      .map((application) => `${application.userId}:${normalizeOrderNo(application.orderNo)}`)
  );
  const approvedOrderKeys = new Set(
    adjustmentApplications
      .filter((application) => application.status === "APPROVED")
      .map((application) => `${application.userId}:${normalizeOrderNo(application.orderNo)}`)
  );
  const importedOrderKeys = new Set(
    importedRows
      .filter((row): row is typeof row & { orderNo: string } => !!row.orderNo)
      .map((row) => `${row.userId}:${normalizeOrderNo(row.orderNo as string)}`)
  );
  const claimedOrderKeys = new Set(
    orderClaims.map((claim) => `${claim.userId}:${claim.orderNoKey}`)
  );
  const seenOrderKeys = new Set<string>();

  let okCount = 0;
  let errorCount = 0;
  let totalAmount = 0;

  const previewRows: PreviewRow[] = rows.map((row) => {
    let error = row.error;
    let userExists: boolean | null = null;
    const user = row.phone ? userByPhone.get(row.phone) : undefined;

    if (!error && row.phone) {
      userExists = !!user;
      if (!user) {
        error = "该手机号未注册官网账户，请先注册或检查手机号";
      } else if (user.status !== "ACTIVE") {
        error = `该账号当前状态为「${USER_STATUS_LABELS[user.status] || user.status}」，不能导入消费记录`;
      }
    }

    if (!error && user && row.orderNoKey) {
      const orderKey = `${user.id}:${row.orderNoKey}`;
      if (pendingOrderKeys.has(orderKey)) {
        error = "该订单号存在待审核的消费补录申请，请先处理补录申请";
      } else if (approvedOrderKeys.has(orderKey)) {
        error = "该订单号已通过消费补录审核入账，请勿重复导入";
      } else if (importedOrderKeys.has(orderKey)) {
        error = "该订单号已通过 Excel 导入入账，如需修正请先撤销原批次";
      } else if (claimedOrderKeys.has(orderKey)) {
        error = "该订单号已被商城同步或其他来源入账，请勿重复导入";
      } else if (seenOrderKeys.has(orderKey)) {
        error = "文件内订单号重复，请合并或删除重复行";
      } else {
        seenOrderKeys.add(orderKey);
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
  const orderNoRaw = typeof input.orderNo === "string" ? input.orderNo.trim() : "";
  const orderNo = parseOrderNoValue(orderNoRaw);
  const noteRaw = typeof input.note === "string" ? input.note.trim() : "";
  const note = parseNoteValue(noteRaw);

  if (
    !phone ||
    !validAmount ||
    purchasedAtInvalid ||
    channelResult.invalid ||
    !orderNo ||
    noteRaw.length > IMPORT_MAX_NOTE_LENGTH
  ) {
    return {
      rowIndex,
      phone: phone ?? (typeof input.phone === "string" ? input.phone : null),
      amount: amount ?? null,
      channel: channelResult.channel,
      orderNo,
      orderNoKey: orderNo ? normalizeOrderNo(orderNo) : null,
      purchasedAt,
      note,
      error: "参数不合法（订单号必填且需符合长度限制）",
    };
  }

  return {
    rowIndex,
    phone,
    amount,
    channel: channelResult.channel,
    orderNo,
    orderNoKey: normalizeOrderNo(orderNo),
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
  fileHash: string;
  reason: string;
  adminId: string;
}): Promise<ExecuteResult> {
  const { rows: inputs, fileName, fileHash, reason, adminId } = params;

  if (inputs.length === 0 || inputs.length > IMPORT_MAX_ROWS) {
    throw new Error("IMPORT_ROW_COUNT_INVALID");
  }

  const parsed = inputs.map((input, i) => toParsedRow(input, i + 2));
  const phones = [...new Set(parsed.map((r) => r.phone).filter((p): p is string => !!p))];
  const users = await prisma.user.findMany({
    where: { phone: { in: phones } },
    select: { id: true, phone: true, status: true },
  });
  const userIdByPhone = new Map(users.map((u) => [u.phone, u.id]));
  const userStatusById = new Map(users.map((u) => [u.id, u.status]));

  // 跨来源去重：待审核/已通过的补录订单都不允许再通过导入入账。
  const adjustmentApplications =
    users.length > 0
      ? await prisma.spentAdjustmentApplication.findMany({
          where: {
            userId: { in: users.map((u) => u.id) },
            status: { in: ["PENDING", "APPROVED"] },
            orderNo: { not: "" },
          },
          select: { userId: true, orderNo: true, status: true },
        })
      : [];
  const pendingOrderKeys = new Set(
    adjustmentApplications
      .filter((application) => application.status === "PENDING")
      .map((application) => `${application.userId}:${normalizeOrderNo(application.orderNo)}`)
  );
  const approvedOrderKeys = new Set(
    adjustmentApplications
      .filter((application) => application.status === "APPROVED")
      .map((application) => `${application.userId}:${normalizeOrderNo(application.orderNo)}`)
  );
  const importedRows =
    users.length > 0
      ? await prisma.spentImportRow.findMany({
          where: {
            userId: { in: users.map((u) => u.id) },
            status: "SUCCESS",
            revertedAt: null,
            orderNo: { not: null },
          },
          select: { userId: true, orderNo: true },
        })
      : [];
  const importedOrderKeys = new Set(
    importedRows
      .filter((row): row is typeof row & { orderNo: string } => !!row.orderNo)
      .map((row) => `${row.userId}:${normalizeOrderNo(row.orderNo)}`)
  );

  const version = randomUUID();
  const effectiveFileHash = fileHash.trim().slice(0, 64);
  if (!effectiveFileHash) throw new Error("IMPORT_FILE_HASH_REQUIRED");
  const now = new Date();

  // 先创建批次与 PENDING 行，再逐行入账：
  // 进程崩溃/超时后批次与行仍存在；超时批次由 failStaleImportBatches 标记 FAILED，
  // 管理端撤销已成功行后重新导入，避免“批次已撤销但后续行仍入账”的并发窗口。
  const batch = await prisma.$transaction(async (tx) => {
    const lockKey = `spent-import:${effectiveFileHash}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

    const active = await tx.spentImportBatch.findFirst({
      where: {
        fileHash: effectiveFileHash,
        undoneAt: null,
        status: { in: ["PROCESSING", "COMPLETED"] },
      },
      select: { id: true },
    });
    if (active) {
      throw new Error("IMPORT_ALREADY_EXISTS");
    }

    return tx.spentImportBatch.create({
      data: {
        adminId,
        fileName: fileName.slice(0, 200),
        fileHash: effectiveFileHash,
        reason: reason.slice(0, 200),
        version,
        status: "PROCESSING",
        startedAt: now,
        totalRows: parsed.length,
        successRows: 0,
        duplicateRows: 0,
        errorRows: 0,
        totalAmount: 0,
        rows: {
          create: parsed.map((row) => {
            const contentReference = rowReference(
              row.phone ?? "",
              row.amount ?? 0,
              row.orderNo,
              row.purchasedAt
            );
            return {
              rowIndex: row.rowIndex,
              phone: row.phone ?? "",
              amount: row.amount ?? 0,
              channel: row.channel,
              orderNo: row.orderNo,
              orderNoKey: row.orderNoKey,
              purchasedAt: row.purchasedAt ? new Date(`${row.purchasedAt}T00:00:00.000Z`) : null,
              note: row.note,
              // 批内行键：带随机 version，仅用于映射本批次行，不参与跨批次幂等
              reference: `${contentReference}:${version}`,
              // 跨批次稳定幂等键：只由内容生成，写入 SpentSyncRecord
              syncReference: contentReference,
              status: "PENDING",
              error: null,
              appliedDelta: null,
              userId: row.phone ? (userIdByPhone.get(row.phone) ?? null) : null,
            };
          }),
        },
      },
      include: { rows: true },
    });
  });

  const rowByReference = new Map(batch.rows.map((row) => [row.reference, row]));
  // 同一批次内内容/订单号完全相同的行：先到先入账，后续标记重复
  const claimedContentKeys = new Set<string>();
  const claimedOrderKeys = new Set<string>();

  let rowResults: ExecuteRowResult[];
  try {
    rowResults = await mapWithConcurrency(
      parsed,
      IMPORT_EXECUTE_CONCURRENCY,
      async (row): Promise<ExecuteRowResult> => {
        const syncReference = rowReference(
          row.phone ?? "",
          row.amount ?? 0,
          row.orderNo,
          row.purchasedAt
        );
        const batchReference = `${syncReference}:${version}`;
        const persisted = rowByReference.get(batchReference);
        if (!persisted) throw new Error("IMPORT_ROW_NOT_CREATED");

        const markError = async (message: string): Promise<ExecuteRowResult> => {
          await prisma.spentImportRow.update({
            where: { id: persisted.id },
            data: { status: "ERROR", error: message, appliedDelta: null },
          });
          return {
            rowIndex: row.rowIndex,
            phone: row.phone ?? "",
            amount: row.amount ?? 0,
            appliedDelta: null,
            status: "ERROR",
            error: message,
            reference: syncReference,
          };
        };

        const markDuplicate = async (): Promise<ExecuteRowResult> => {
          const message = "该记录已入账过（幂等跳过）";
          await prisma.spentImportRow.update({
            where: { id: persisted.id },
            data: { status: "DUPLICATE", error: message, appliedDelta: 0, userId: null },
          });
          return {
            rowIndex: row.rowIndex,
            phone: row.phone ?? "",
            amount: row.amount ?? 0,
            appliedDelta: 0,
            status: "DUPLICATE",
            error: message,
            reference: syncReference,
          };
        };

        if (row.error || row.phone === null || row.amount === null) {
          return markError(row.error || "参数不合法");
        }

        const userId = userIdByPhone.get(row.phone);
        if (!userId) return markError("该手机号未注册官网账户");
        const userStatus = userStatusById.get(userId);
        if (userStatus && userStatus !== "ACTIVE") {
          return markError(
            `该账号当前状态为「${USER_STATUS_LABELS[userStatus] || userStatus}」，不能导入消费记录`
          );
        }

        if (!row.orderNoKey) {
          return markError("订单号/小票号必填");
        }
        const orderKey = `${userId}:${row.orderNoKey}`;

        // 同一用户同一订单号已有待审/已通过补录，或已导入：阻止跨来源重复入账
        if (pendingOrderKeys.has(orderKey)) {
          return markError("该订单号存在待审核的消费补录申请，请先处理补录申请");
        }
        if (approvedOrderKeys.has(orderKey)) {
          return markError("该订单号已通过消费补录审核入账，请勿重复导入");
        }
        if (importedOrderKeys.has(orderKey)) {
          return markError("该订单号已通过 Excel 导入入账，如需修正请先撤销原批次");
        }
        if (claimedOrderKeys.has(orderKey)) return markDuplicate();
        claimedOrderKeys.add(orderKey);

        // 跨批次内容幂等：已成功且未撤销的同一内容不再入账。
        // 先占用进程内 key，避免同一批次并发行同时通过检查。
        const contentKey = `${userId}:${syncReference}`;
        if (claimedContentKeys.has(contentKey)) return markDuplicate();
        claimedContentKeys.add(contentKey);

        const activeDuplicate = await prisma.spentImportRow.findFirst({
          where: {
            userId,
            syncReference,
            status: "SUCCESS",
            revertedAt: null,
            id: { not: persisted.id },
          },
          select: { id: true },
        });
        if (activeDuplicate) return markDuplicate();

        try {
          const result = await applyExternalSpentSync({
            userId,
            spentDelta: row.amount,
            // 批内唯一 reference：撤销后可重新导入；跨批次去重由 syncReference 预检负责
            reference: batchReference,
            orderNo: row.orderNo,
            source: "SPENT_IMPORT",
            note: `Excel导入：${row.channel ? SPENT_CHANNEL_LABELS[row.channel] : "未填渠道"}${
              row.orderNo ? ` ${row.orderNo}` : ""
            }`,
          });
          if (!result) return markError("用户不存在");

          const appliedDelta = result.duplicated ? 0 : result.appliedDelta;
          const status = result.duplicated ? "DUPLICATE" : "SUCCESS";
          const error = result.duplicated ? "该记录已入账过（幂等跳过）" : null;

          try {
            await prisma.spentImportRow.update({
              where: { id: persisted.id },
              data: { status, error, appliedDelta, userId },
            });
          } catch (updateError) {
            // 成功行状态写入失败时，必须先冲正已入账金额，避免“钱已加、行状态没落”。
            // P2002 通常是并发同订单号命中数据库唯一索引；冲正后按重复处理。
            if (appliedDelta !== 0) {
              try {
                await applyExternalSpentSync({
                  userId,
                  spentDelta: -appliedDelta,
                  reference: `import-compensate:${batchReference}`,
                  note: "导入行状态写入失败自动冲正",
                });
                await releaseSpentOrderClaim(prisma, {
                  userId,
                  orderNoKey: row.orderNoKey,
                  source: "SPENT_IMPORT",
                  reference: batchReference,
                });
              } catch (compensateError) {
                apiConsole.error(
                  `[SpentImport] 第 ${row.rowIndex} 行冲正失败，需人工核对:`,
                  compensateError
                );
                throw new Error("IMPORT_COMPENSATION_FAILED");
              }
            }

            if ((updateError as { code?: string }).code === "P2002") {
              return markDuplicate();
            }
            apiConsole.error(`[SpentImport] 行 ${row.rowIndex} 状态写入失败:`, updateError);
            return markError("行状态写入失败，已自动冲正，请重试");
          }

          return {
            rowIndex: row.rowIndex,
            phone: row.phone,
            amount: row.amount,
            appliedDelta,
            status,
            error,
            reference: syncReference,
          };
        } catch (error) {
          apiConsole.error(`[SpentImport] 行 ${row.rowIndex} 入账失败:`, error);
          if (error instanceof Error && error.message === "IMPORT_COMPENSATION_FAILED") {
            throw error;
          }
          if (error instanceof SpentOrderConflictError) {
            return markError(
              `订单号已在其他来源入账（${error.source}），请先撤销原入账再导入`
            );
          }
          return markError("入账失败，请重试");
        }
      }
    );
  } catch (error) {
    await prisma.spentImportBatch
      .update({
        where: { id: batch.id },
        data: {
          status: "FAILED",
          lastError: (error instanceof Error ? error.message : String(error)).slice(0, 500),
          processedRows: batch.rows.length,
          finishedAt: new Date(),
        },
      })
      .catch(() => {});
    throw error;
  }

  const successRows = rowResults.filter((r) => r.status === "SUCCESS").length;
  const duplicateRows = rowResults.filter((r) => r.status === "DUPLICATE").length;
  const errorRows = rowResults.filter((r) => r.status === "ERROR").length;
  const totalAmount = rowResults
    .filter((r) => r.status === "SUCCESS")
    .reduce((sum, r) => sum + (r.appliedDelta ?? 0), 0);

  const noSuccess = successRows === 0;
  await prisma.spentImportBatch.update({
    where: { id: batch.id },
    data: {
      // 零成功批次不占用文件哈希，允许修正后重新上传同一文件
      status: noSuccess ? "FAILED" : "COMPLETED",
      lastError: noSuccess
        ? "没有成功入账的行：请检查重复/账号状态/订单号后重新导入"
        : null,
      processedRows: rowResults.length,
      successRows,
      duplicateRows,
      errorRows,
      totalAmount,
      finishedAt: new Date(),
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
  | {
      ok: false;
      code:
        | "NOT_FOUND"
        | "ALREADY_UNDONE"
        | "NOTHING_TO_UNDO"
        | "NOT_COMPLETED"
        | "INTERNAL_ERROR";
      message: string;
    };

/**
 * 回收因进程崩溃/请求超时长期停留在 PROCESSING 的导入批次。
 * 只标记 FAILED，不尝试继续入账：已成功行可由管理端撤销，未完成行重新导入。
 * 阈值默认 30 分钟，远大于单批正常执行时间，避免误伤仍在运行的任务。
 */
export async function failStaleImportBatches(maxAgeMinutes = 30): Promise<number> {
  const cutoff = new Date(Date.now() - maxAgeMinutes * 60 * 1000);
  const result = await prisma.spentImportBatch.updateMany({
    where: { status: "PROCESSING", startedAt: { lt: cutoff } },
    data: {
      status: "FAILED",
      lastError: "处理超时或进程中断：请撤销已成功行后重新导入",
      finishedAt: new Date(),
    },
  });
  return result.count;
}

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
      status: true,
      undoneAt: true,
      totalAmount: true,
      rows: {
        where: { status: "SUCCESS", revertedAt: null },
        select: {
          id: true,
          userId: true,
          amount: true,
          appliedDelta: true,
          orderNo: true,
          orderNoKey: true,
          // 注意：reference 是当初写入 SpentSyncRecord 的批内唯一键；
          // syncReference 只是跨批内容键，不能拿去匹配 SpentSyncRecord。
          reference: true,
        },
      },
    },
  });

  if (!batch) {
    return { ok: false, code: "NOT_FOUND", message: "导入批次不存在" };
  }
  if (batch.undoneAt) {
    return { ok: false, code: "ALREADY_UNDONE", message: "该批次已撤销，不能重复操作" };
  }
  // 执行中的批次可能仍在继续入账，撤销后会导致“批次已撤销但后续行仍入账”。
  // 崩溃残留的 PROCESSING 会由 failStaleImportBatches 定时标记为 FAILED 后再允许撤销。
  if (batch.status === "PROCESSING") {
    return {
      ok: false,
      code: "NOT_COMPLETED",
      message: "该批次仍在处理中，请等待完成后撤销（进程中断的批次会在超时后自动转失败）",
    };
  }

  // 历史行没有 appliedDelta：从原始 SpentSyncRecord 取实际生效金额，
  // 绝不能用 amount 代替——负数行当初可能被 0 下限钳制，直接撤销会反向多冲正。
  const rows: { row: (typeof batch.rows)[number]; appliedDelta: number }[] = [];
  let missingAppliedDelta = 0;
  for (const row of batch.rows) {
    if (!row.userId) continue;
    let appliedDelta = row.appliedDelta;
    if (appliedDelta === null) {
      const original = await prisma.spentSyncRecord.findUnique({
        where: {
          userId_reference: { userId: row.userId, reference: row.reference },
        },
        select: { spentDelta: true },
      });
      appliedDelta = original?.spentDelta ?? null;
    }
    if (appliedDelta === null) {
      missingAppliedDelta += 1;
      continue;
    }
    rows.push({ row, appliedDelta });
  }

  if (missingAppliedDelta > 0) {
    return {
      ok: false,
      code: "INTERNAL_ERROR",
      message: `有 ${missingAppliedDelta} 行历史入账缺少实际生效金额，无法安全撤销，请人工核对`,
    };
  }
  if (rows.length === 0) {
    return { ok: false, code: "NOTHING_TO_UNDO", message: "该批次没有可撤销的入账记录" };
  }

  const revertResults = await mapWithConcurrency(
    rows,
    IMPORT_EXECUTE_CONCURRENCY,
    async ({ row, appliedDelta }) => {
      try {
        const reference = `import-undo:${batch.id}:${row.id}`;

        // appliedDelta=0 的行当初未实际入账，也标记 reverted 以清除跨批内容幂等占用
        if (appliedDelta !== 0) {
          await applyExternalSpentSync({
            userId: row.userId as string,
            spentDelta: -appliedDelta,
            reference,
            note: `撤销Excel导入批次 ${batch.id}`,
          });
        }

        // 不物理删除原始 SpentSyncRecord，保留审计并通过 revertedAt 标记。
        // 原入账 reference 是 row.reference（含批次 version），不是 syncReference。
        await prisma.spentSyncRecord.updateMany({
          where: {
            userId: row.userId as string,
            reference: row.reference,
          },
          data: { revertedAt: new Date() },
        });
        await releaseSpentOrderClaim(prisma, {
          userId: row.userId as string,
          orderNoKey: row.orderNoKey,
          source: "SPENT_IMPORT",
          reference: row.reference,
        });
        await prisma.spentImportRow.update({
          where: { id: row.id },
          data: { revertedAt: new Date() },
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

  return { ok: true, revertedRows: rows.length, totalAmount: batch.totalAmount };
}

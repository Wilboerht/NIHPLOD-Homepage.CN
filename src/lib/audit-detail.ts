/**
 * 审计详情标准结构。
 *
 * 新写入的详情统一为：
 *   { before?: object; after?: object; changes?: Change[]; meta?: object; reason?: string }
 * 历史数据保持原样，读取端需兼容任意 JSON。
 */
export interface AuditChange {
  field: string;
  before: unknown;
  after: unknown;
}

export interface AuditDetail {
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  changes?: AuditChange[];
  meta?: Record<string, unknown>;
  reason?: string;
}

const DEFAULT_MAX_FIELDS = 200;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(normalize);
  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) result[key] = normalize(item);
    return result;
  }
  return value;
}

function stableValue(value: unknown): string {
  return JSON.stringify(normalize(value) ?? null);
}

/** 仅输出真正变化的字段，避免把整行对象塞进审计。 */
export function buildAuditChanges(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
  fields?: string[]
): AuditChange[] {
  const source = fields ?? [
    ...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]),
  ];
  const changes: AuditChange[] = [];
  for (const field of source.slice(0, DEFAULT_MAX_FIELDS)) {
    const beforeValue = before?.[field];
    const afterValue = after?.[field];
    if (stableValue(beforeValue) !== stableValue(afterValue)) {
      changes.push({ field, before: normalize(beforeValue), after: normalize(afterValue) });
    }
  }
  return changes;
}

export function buildAuditDetail(input: {
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  changes?: AuditChange[];
  meta?: Record<string, unknown>;
  reason?: string;
}): AuditDetail {
  const detail: AuditDetail = {};
  if (input.before) detail.before = normalize(input.before) as Record<string, unknown>;
  if (input.after) detail.after = normalize(input.after) as Record<string, unknown>;
  const changes =
    input.changes ??
    (input.before || input.after ? buildAuditChanges(input.before, input.after) : []);
  if (changes.length > 0) detail.changes = changes;
  if (input.meta) detail.meta = normalize(input.meta) as Record<string, unknown>;
  if (input.reason) detail.reason = input.reason;
  return detail;
}

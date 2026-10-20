/**
 * CSV 单元格转义（统一实现）
 *
 * 顺序要求：先做公式注入防护（前置单引号），再做引号转义与包裹。
 * 前导空白/Tab/CR/LF 也必须覆盖：部分表格软件会忽略前导空白后按公式解析。
 */
export function escapeCSV(val: string): string {
  const formulaPrefix = /^[\s]*[=+\-@]|^[\t\r\n]/;
  let escaped = formulaPrefix.test(val) ? `'${val}` : val;
  escaped = escaped.replace(/"/g, '""');
  if (/[",\n\r\t]/.test(escaped)) {
    escaped = `"${escaped}"`;
  }
  return escaped;
}

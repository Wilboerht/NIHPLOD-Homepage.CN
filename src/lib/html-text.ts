/**
 * HTML 富文本转纯文本工具
 *
 * 用于 GEO FAQ 兜底生成与 llms.txt/llms-full.txt 输出，
 * 避免把后台富文本中的标签直接暴露给 AI/搜索引擎。
 */

export function stripHtmlToText(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function truncateText(value: string, maxLength: number): string {
  const text = value.trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

/**
 * 法务文档内容归一化与展示工具（纯函数，客户端/服务端共用）
 *
 * 现有默认文案的来源：
 * - 服务条款：src/lib/terms-default-content.ts（每段第一行为章节标题）
 * - 隐私政策：src/lib/privacy-default-content.ts（章节 title 独立，正文数组首段重复标题）
 *
 * 归一化后统一为「章节标题 + 正文纯文本」，正文中的空行分段交给
 * PolicyContentRenderer 处理，保证与改造前渲染一致。
 */
import { getUtc8DateKey } from "./timezone";
import type { LegalDocumentContent, LegalDocumentSlug, LegalSection } from "@/types/legal";

export const LEGAL_DOCUMENT_TITLES: Record<LegalDocumentSlug, string> = {
  terms: "服务条款",
  privacy: "隐私政策",
};

export const LEGAL_DOCUMENT_DESCRIPTIONS: Record<LegalDocumentSlug, string> = {
  terms: "在使用我们的服务前，请仔细阅读以下条款",
  privacy: "了解我们如何收集、使用和保护您的个人信息。",
};

/** 从 "2026-11-12" 生成 "2026年11月12日" */
export function formatLegalLastUpdated(dateKey: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey.trim());
  if (!match) return dateKey;
  return `${match[1]}年${Number(match[2])}月${Number(match[3])}日`;
}

/** 当前 UTC+8 日期的展示文案 */
export function todayLegalLastUpdated(now: Date = new Date()): string {
  return formatLegalLastUpdated(getUtc8DateKey(now));
}

/** 是否为合法展示日期：YYYY年M月D日 */
export function isValidLegalLastUpdated(value: string): boolean {
  const match = /^(\d{4})年(\d{1,2})月(\d{1,2})日$/.exec(value.trim());
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/** 将「第一行为标题」的平铺条款文本拆成章节（保持现有 id 规则） */
export function buildLegalSectionsFromFlatTexts(
  texts: readonly string[],
  idPrefix = "terms"
): LegalSection[] {
  return texts.map((text, index) => {
    const lines = text.split(/\r?\n/);
    const firstLine = (lines[0] ?? "").trim();
    const numberMatch = firstLine.match(/^(\d+)\./);
    const id = numberMatch ? `${idPrefix}-${numberMatch[1]}` : `${idPrefix}-intro-${index + 1}`;
    const title = firstLine || `第 ${index + 1} 章`;
    const body = lines
      .slice(1)
      .join("\n")
      .replace(/^\s*\n+/, "")
      .trimEnd();
    return { id, title, body };
  });
}

/** 将「章节 title 独立、正文数组首段重复标题」的隐私政策拆成章节 */
export function buildLegalSectionsFromSectionsRecord(
  record: Record<string, { title: string; content: string[] }>,
  order: readonly string[]
): LegalSection[] {
  return order.map((id) => {
    const section = record[id];
    if (!section) {
      return { id, title: id, body: "" };
    }
    const [first = "", ...rest] = section.content;
    const lines = first.split(/\r?\n/);
    const firstLine = (lines[0] ?? "").trim();
    // 首段可能以标题开头（现有内容均如此），剥离后与后续段落用空行拼接。
    const bodyHead =
      firstLine === section.title.trim()
        ? lines
            .slice(1)
            .join("\n")
            .replace(/^\s*\n+/, "")
            .trimEnd()
        : first.trimEnd();
    const body = [bodyHead, ...rest]
      .filter((part) => part.trim().length > 0)
      .join("\n\n")
      .trim();
    return { id, title: section.title, body };
  });
}

/** 章节正文总字符数（用于列表/审计摘要） */
export function countLegalContentChars(content: LegalDocumentContent): number {
  return content.sections.reduce(
    (total, section) => total + section.title.length + section.body.length,
    0
  );
}

/** 生成章节 id 前缀（新章节由前端生成 uuid，服务端兜底） */
export function createLegalSectionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `section-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

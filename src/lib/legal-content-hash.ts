import { createHash } from "crypto";
import type { LegalDocumentContent } from "@/types/legal";

/**
 * 内容哈希（SHA-256）
 *
 * 用于版本记录与审计摘要。`lastUpdated` 在发布时会被自动改成当天，
 * 判断“内容是否有变化”时必须忽略它，否则每次发布都会被视为变更。
 */
export function hashLegalContent(content: LegalDocumentContent): string {
  return createHash("sha256").update(JSON.stringify(content)).digest("hex");
}

export function hashLegalContentForComparison(content: LegalDocumentContent): string {
  return createHash("sha256")
    .update(JSON.stringify({ ...content, lastUpdated: "" }))
    .digest("hex");
}

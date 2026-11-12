/**
 * 法务文档本地草稿（localStorage）
 *
 * 仅用于浏览器本地兜底，防止误关标签页丢失未保存修改；
 * 真正持久化仍以「保存草稿 / 发布」为准。
 */
import { legalDraftContentSchema } from "@/schemas/legal";
import type { LegalDocumentContent, LegalDocumentSlug } from "@/types/legal";

const KEY_PREFIX = "nihplod:legal-local-draft:";
const STORAGE_VERSION = 1;

export interface LegalLocalDraft {
  content: LegalDocumentContent;
  savedAt: number;
}

export function legalLocalDraftKey(slug: LegalDocumentSlug): string {
  return `${KEY_PREFIX}${slug}`;
}

export function readLegalLocalDraft(slug: LegalDocumentSlug): LegalLocalDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(legalLocalDraftKey(slug));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      version?: number;
      savedAt?: number;
      content?: unknown;
    };
    if (parsed.version !== STORAGE_VERSION) return null;
    const content = legalDraftContentSchema.safeParse(parsed.content);
    if (!content.success) return null;
    return {
      content: content.data,
      savedAt: Number(parsed.savedAt) || 0,
    };
  } catch {
    return null;
  }
}

export function writeLegalLocalDraft(slug: LegalDocumentSlug, content: LegalDocumentContent): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      legalLocalDraftKey(slug),
      JSON.stringify({ version: STORAGE_VERSION, savedAt: Date.now(), content })
    );
  } catch {
    // localStorage 可能被禁用或超出配额；本地兜底失败不应影响编辑。
  }
}

export function clearLegalLocalDraft(slug: LegalDocumentSlug): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(legalLocalDraftKey(slug));
  } catch {
    // ignore
  }
}

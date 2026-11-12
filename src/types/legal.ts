/**
 * 法务文档（服务条款 / 隐私政策）内容类型
 *
 * 存储结构刻意保持「章节标题 + 纯文本正文」：
 * - 与 PolicyContentRenderer 的纯文本/轻量 Markdown 渲染完全兼容
 * - 不存储任意 HTML，避免 XSS 与样式漂移
 * - 版本 diff 以章节为单位，稳定可读
 */

export const LEGAL_DOCUMENT_SLUGS = ["terms", "privacy"] as const;

export type LegalDocumentSlug = (typeof LEGAL_DOCUMENT_SLUGS)[number];

export interface LegalSection {
  /** 稳定 id，仅用于 React key 与页内锚点（terms-1 / ch1 / <uuid>） */
  id: string;
  title: string;
  /** 纯文本正文，段落之间用空行分隔 */
  body: string;
}

export interface LegalDocumentContent {
  /** 固定标题（"服务条款" / "隐私政策"），服务端强制，避免导航与文章标题漂移 */
  title: string;
  description: string;
  /** 展示用日期："2026年11月11日"；发布新版本时由服务端自动更新 */
  lastUpdated: string;
  sections: LegalSection[];
}

export interface LegalAdminDocumentSummary {
  slug: LegalDocumentSlug;
  title: string;
  publishedVersion: number;
  publishedAt: string | null;
  publishedBy: string | null;
  hasDraft: boolean;
  draftRevision: number;
  draftUpdatedAt: string | null;
  draftUpdatedBy: string | null;
  contentSource: "draft" | "published" | "default";
}

export interface LegalAdminDocumentDetail extends LegalAdminDocumentSummary {
  content: LegalDocumentContent;
  publishedContent: LegalDocumentContent | null;
  draftContent: LegalDocumentContent | null;
}

export interface LegalVersionSummary {
  id: string;
  version: number;
  note: string | null;
  contentHash: string;
  sectionCount: number;
  createdAt: string;
  createdBy: string | null;
  isCurrentPublished: boolean;
}

export interface LegalVersionDetail extends LegalVersionSummary {
  content: LegalDocumentContent;
}

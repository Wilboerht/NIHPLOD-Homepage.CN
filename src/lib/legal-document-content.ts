/**
 * 法务文档公开读取层
 *
 * - 优先读取数据库中已发布内容；
 * - 数据库为空、不可用或内容校验失败时回退代码内置默认值，保证页面永不空白；
 * - 数据缓存 300 秒 + LEGAL_DOCS_TAG，发布后由写接口主动失效。
 */
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { apiConsole } from "@/lib/logger";
import { LEGAL_DOCS_TAG } from "@/lib/cache-tags";
import { defaultLegalDocuments } from "@/lib/legal-default-content";
import { legalDocumentContentSchema } from "@/schemas/legal";
import type { LegalDocumentContent, LegalDocumentSlug } from "@/types/legal";

export async function resolvePublishedLegalDocument(
  slug: LegalDocumentSlug
): Promise<LegalDocumentContent> {
  try {
    const row = await prisma.legalDocument.findUnique({
      where: { slug },
      select: { publishedContent: true },
    });
    if (row?.publishedContent) {
      const parsed = legalDocumentContentSchema.safeParse(row.publishedContent);
      if (parsed.success) {
        return parsed.data;
      }
      apiConsole.error(
        `[LegalDocument] ${slug} 已发布内容校验失败，回退默认内容:`,
        parsed.error.issues[0]?.message
      );
    }
  } catch (error) {
    apiConsole.error(`[LegalDocument] 读取 ${slug} 已发布内容失败，回退默认内容:`, error);
  }
  return defaultLegalDocuments[slug];
}

const getCachedPublishedLegalDocument = unstable_cache(
  resolvePublishedLegalDocument,
  ["legal-document"],
  { tags: [LEGAL_DOCS_TAG], revalidate: 300 }
);

export function getPublishedLegalDocument(slug: LegalDocumentSlug): Promise<LegalDocumentContent> {
  return getCachedPublishedLegalDocument(slug);
}

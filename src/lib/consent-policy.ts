import { prisma } from "@/lib/prisma";
import type { PrivacyConsentDocument } from "@/generated/prisma/client";

export type ConsentPolicySlug = "privacy" | "terms";

export interface ConsentDocumentPolicy {
  document: PrivacyConsentDocument;
  slug: ConsentPolicySlug;
  publishedVersion: number | null;
  publishedContentHash: string | null;
  requiredVersion: number | null;
  requiredContentHash: string | null;
}

const SLUG_BY_DOCUMENT: Record<ConsentPolicySlug, PrivacyConsentDocument> = {
  privacy: "PRIVACY",
  terms: "TERMS",
};

export type ConsentPolicySnapshot = Record<ConsentPolicySlug, ConsentDocumentPolicy>;

/**
 * 读取当前已发布政策，以及最近一次要求重新同意的版本。
 * 状态判断不能依赖代码里的日期常量，否则发布新正文但忘记改常量时会永远显示已同意。
 */
export async function getConsentPolicySnapshot(): Promise<ConsentPolicySnapshot> {
  const [documents, versions] = await Promise.all([
    prisma.legalDocument.findMany({
      where: { slug: { in: ["privacy", "terms"] } },
      select: { id: true, slug: true, publishedVersion: true },
    }),
    prisma.legalDocumentVersion.findMany({
      where: { document: { slug: { in: ["privacy", "terms"] } } },
      select: {
        documentId: true,
        version: true,
        contentHash: true,
        requiresReconsent: true,
      },
      orderBy: { version: "desc" },
    }),
  ]);

  const documentBySlug = new Map(documents.map((document) => [document.slug, document]));
  const versionsByDocumentId = new Map<
    string,
    Array<{ version: number; contentHash: string; requiresReconsent: boolean }>
  >();
  for (const version of versions) {
    const list = versionsByDocumentId.get(version.documentId) ?? [];
    list.push(version);
    versionsByDocumentId.set(version.documentId, list);
  }

  const build = (slug: ConsentPolicySlug): ConsentDocumentPolicy => {
    const document = documentBySlug.get(slug);
    const versionRows = document ? versionsByDocumentId.get(document.id) ?? [] : [];
    const publishedVersion = document?.publishedVersion ?? null;
    const publishedRow =
      publishedVersion != null
        ? versionRows.find((version) => version.version === publishedVersion) ?? null
        : null;
    const requiredRow =
      versionRows
        .filter((version) => version.requiresReconsent)
        .sort((a, b) => b.version - a.version)[0] ?? null;

    return {
      document: SLUG_BY_DOCUMENT[slug],
      slug,
      publishedVersion,
      publishedContentHash: publishedRow?.contentHash ?? null,
      requiredVersion: requiredRow?.version ?? null,
      requiredContentHash: requiredRow?.contentHash ?? null,
    };
  };

  return {
    privacy: build("privacy"),
    terms: build("terms"),
  };
}

export function getConsentPolicyForDocument(
  snapshot: ConsentPolicySnapshot,
  document: PrivacyConsentDocument
): ConsentDocumentPolicy {
  return document === "PRIVACY" ? snapshot.privacy : snapshot.terms;
}

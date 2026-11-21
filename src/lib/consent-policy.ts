import { prisma } from "@/lib/prisma";
import type { PrivacyConsentDocument } from "@/generated/prisma/client";

export type ConsentPolicySlug = "privacy" | "terms";

export interface ConsentDocumentPolicy {
  document: PrivacyConsentDocument;
  slug: ConsentPolicySlug;
  publishedVersion: number | null;
  publishedVersionId: string | null;
  publishedContentHash: string | null;
  requiredVersion: number | null;
  requiredVersionId: string | null;
  requiredContentHash: string | null;
}

const SLUG_BY_DOCUMENT: Record<ConsentPolicySlug, PrivacyConsentDocument> = {
  privacy: "PRIVACY",
  terms: "TERMS",
};

export type ConsentPolicySnapshot = Record<ConsentPolicySlug, ConsentDocumentPolicy>;

type ConsentPolicyDb = Pick<typeof prisma, "legalDocument" | "legalDocumentVersion">;

/**
 * 读取当前已发布政策，以及最近一次要求重新同意的版本。
 * 状态判断不能依赖代码里的日期常量，否则发布新正文但忘记改常量时会永远显示已同意。
 */
const POLICY_CACHE_TTL_MS = 5_000;
let policyCache: { value: ConsentPolicySnapshot; expiresAt: number } | null = null;

export function invalidateConsentPolicyCache(): void {
  policyCache = null;
}

export async function getConsentPolicySnapshot(): Promise<ConsentPolicySnapshot> {
  if (process.env.NODE_ENV === "production" && policyCache && policyCache.expiresAt > Date.now()) {
    return policyCache.value;
  }

  const value = await loadConsentPolicySnapshot();
  if (process.env.NODE_ENV === "production") {
    policyCache = { value, expiresAt: Date.now() + POLICY_CACHE_TTL_MS };
  }
  return value;
}

export async function getConsentPolicySnapshotFresh(
  db: ConsentPolicyDb = prisma
): Promise<ConsentPolicySnapshot> {
  return loadConsentPolicySnapshot(db);
}

async function loadConsentPolicySnapshot(
  db: ConsentPolicyDb = prisma
): Promise<ConsentPolicySnapshot> {
  const documents = await db.legalDocument.findMany({
    where: { slug: { in: ["privacy", "terms"] } },
    select: {
      id: true,
      slug: true,
      publishedVersion: true,
      requiredConsentVersionId: true,
    },
  });

  const versions = await db.legalDocumentVersion.findMany({
    where: { document: { slug: { in: ["privacy", "terms"] } } },
    select: {
      id: true,
      documentId: true,
      version: true,
      contentHash: true,
      requiresReconsent: true,
      materiality: true,
    },
    orderBy: { version: "desc" },
  });

  const documentBySlug = new Map(documents.map((document) => [document.slug, document]));
  const versionsByDocumentId = new Map<
    string,
    Array<{
      id: string;
      version: number;
      contentHash: string;
      requiresReconsent: boolean;
      materiality: "MATERIAL" | "NON_MATERIAL" | "CORRECTION";
    }>
  >();
  for (const version of versions) {
    const list = versionsByDocumentId.get(version.documentId) ?? [];
    list.push(version);
    versionsByDocumentId.set(version.documentId, list);
  }

  const build = (slug: ConsentPolicySlug): ConsentDocumentPolicy => {
    const document = documentBySlug.get(slug);
    const versionRows = document ? (versionsByDocumentId.get(document.id) ?? []) : [];
    const publishedVersion = document?.publishedVersion ?? null;
    const publishedRow =
      publishedVersion != null
        ? (versionRows.find((version) => version.version === publishedVersion) ?? null)
        : null;
    const requiredRow =
      (document?.requiredConsentVersionId
        ? versionRows.find((version) => version.id === document.requiredConsentVersionId)
        : null) ??
      versionRows
        .filter((version) => version.materiality === "MATERIAL" || version.requiresReconsent)
        .sort((a, b) => b.version - a.version)[0] ??
      null;

    return {
      document: SLUG_BY_DOCUMENT[slug],
      slug,
      publishedVersion,
      publishedVersionId: publishedRow?.id ?? null,
      publishedContentHash: publishedRow?.contentHash ?? null,
      requiredVersion: requiredRow?.version ?? null,
      requiredVersionId: requiredRow?.id ?? null,
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

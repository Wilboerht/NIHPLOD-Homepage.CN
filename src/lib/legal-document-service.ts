/**
 * 法务文档服务层
 *
 * 所有写操作均使用 draftRevision 乐观锁；发布在单个事务内完成
 * 「写版本 + 更新已发布快照 + 写审计」，避免半发布状态。
 */
import { Prisma } from "@/generated/prisma/client";
import { apiConsole } from "@/lib/logger";
import { toInputJson } from "@/lib/prisma-json";
import { prisma } from "@/lib/prisma";
import { createAuditLogTx } from "@/lib/audit";
import {
  LEGAL_DOCUMENT_TITLES,
  countLegalContentChars,
  createLegalSectionId,
  isValidLegalLastUpdated,
  todayLegalLastUpdated,
} from "@/lib/legal-content";
import { getDefaultLegalDocument } from "@/lib/legal-default-content";
import { hashLegalContent, hashLegalContentForComparison } from "@/lib/legal-content-hash";
import {
  LEGAL_CONTENT_MAX_CHARS,
  legalDocumentContentSchema,
  legalDraftContentSchema,
} from "@/schemas/legal";
import { LegalDocumentError } from "@/lib/legal-document-errors";
import type {
  LegalAdminDocumentDetail,
  LegalAdminDocumentSummary,
  LegalDocumentContent,
  LegalDocumentSlug,
  LegalSection,
  LegalVersionDetail,
  LegalVersionSummary,
} from "@/types/legal";
import { LEGAL_DOCUMENT_SLUGS } from "@/types/legal";

export interface LegalAdminActor {
  id: string;
  email?: string | null;
  name?: string | null;
}

interface NormalizedSectionInput {
  id?: string;
  title: string;
  body: string;
}

function parsePublishedContent(value: unknown): LegalDocumentContent | null {
  if (!value) return null;
  const parsed = legalDocumentContentSchema.safeParse(value);
  if (!parsed.success) {
    apiConsole.error("[LegalDocument] 已发布内容校验失败:", parsed.error.issues[0]?.message);
    return null;
  }
  return parsed.data;
}

function parseDraftContent(value: unknown): LegalDocumentContent | null {
  if (!value) return null;
  const parsed = legalDraftContentSchema.safeParse(value);
  if (!parsed.success) {
    apiConsole.error("[LegalDocument] 草稿内容校验失败:", parsed.error.issues[0]?.message);
    return null;
  }
  return parsed.data;
}

function actorDisplayName(admin: LegalAdminActor): string | null {
  return admin.name?.trim() || admin.email?.trim() || null;
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

function normalizeSections(
  sections: NormalizedSectionInput[],
  options: { requireBody: boolean }
): LegalSection[] {
  const seen = new Set<string>();
  return sections.map((section) => {
    const id = section.id?.trim() || createLegalSectionId();
    if (seen.has(id)) {
      throw new LegalDocumentError("INVALID_CONTENT", "章节 id 重复，请刷新页面后重试", 400);
    }
    seen.add(id);
    return {
      id,
      title: section.title.trim(),
      body: options.requireBody ? section.body.trim() : section.body.trimEnd(),
    };
  });
}

function normalizeContent(
  slug: LegalDocumentSlug,
  input: {
    description: string;
    lastUpdated?: string;
    sections: NormalizedSectionInput[];
  },
  options: { lastUpdatedFallback: string; requireBody: boolean }
): LegalDocumentContent {
  const lastUpdated =
    !options.requireBody && input.lastUpdated && isValidLegalLastUpdated(input.lastUpdated)
      ? input.lastUpdated.trim()
      : options.lastUpdatedFallback;

  const content: LegalDocumentContent = {
    title: LEGAL_DOCUMENT_TITLES[slug],
    description: input.description.trim(),
    lastUpdated,
    sections: normalizeSections(input.sections, { requireBody: options.requireBody }),
  };

  const totalChars = countLegalContentChars(content);
  if (totalChars > LEGAL_CONTENT_MAX_CHARS) {
    throw new LegalDocumentError(
      "INVALID_CONTENT",
      `内容总长度超过上限（${LEGAL_CONTENT_MAX_CHARS} 字符）`,
      400
    );
  }

  return content;
}

function buildSummary(
  slug: LegalDocumentSlug,
  row: {
    draftContent: unknown;
    draftRevision: number;
    draftUpdatedAt: Date | null;
    draftUpdatedByEmail: string | null;
    draftUpdatedByName: string | null;
    publishedContent: unknown;
    publishedVersion: number;
    publishedAt: Date | null;
    publishedByEmail: string | null;
    publishedByName: string | null;
  } | null
): LegalAdminDocumentSummary {
  const published = row ? parsePublishedContent(row.publishedContent) : null;
  const draft = row ? parseDraftContent(row.draftContent) : null;
  const fallback = getDefaultLegalDocument(slug);

  return {
    slug,
    title: draft?.title ?? published?.title ?? fallback.title,
    publishedVersion: row?.publishedVersion ?? 0,
    publishedAt: row?.publishedAt?.toISOString() ?? null,
    publishedBy: row?.publishedByName ?? row?.publishedByEmail ?? null,
    hasDraft: Boolean(draft),
    draftRevision: row?.draftRevision ?? 0,
    draftUpdatedAt: row?.draftUpdatedAt?.toISOString() ?? null,
    draftUpdatedBy: row?.draftUpdatedByName ?? row?.draftUpdatedByEmail ?? null,
    contentSource: draft ? "draft" : published ? "published" : "default",
  };
}

export async function listAdminLegalDocuments(): Promise<LegalAdminDocumentSummary[]> {
  const rows = await prisma.legalDocument.findMany();
  const bySlug = new Map(rows.map((row) => [row.slug, row]));
  return LEGAL_DOCUMENT_SLUGS.map((slug) => buildSummary(slug, bySlug.get(slug) ?? null));
}

export async function getAdminLegalDocument(
  slug: LegalDocumentSlug
): Promise<LegalAdminDocumentDetail> {
  const row = await prisma.legalDocument.findUnique({ where: { slug } });
  const summary = buildSummary(slug, row);
  const published = row ? parsePublishedContent(row.publishedContent) : null;
  const draft = row ? parseDraftContent(row.draftContent) : null;

  return {
    ...summary,
    content: draft ?? published ?? getDefaultLegalDocument(slug),
    publishedContent: published,
    draftContent: draft,
  };
}

export async function saveLegalDraft(input: {
  slug: LegalDocumentSlug;
  content: { description: string; lastUpdated?: string; sections: NormalizedSectionInput[] };
  expectedRevision: number;
  admin: LegalAdminActor;
}): Promise<LegalAdminDocumentDetail> {
  const row = await prisma.legalDocument.findUnique({ where: { slug: input.slug } });
  const published = row ? parsePublishedContent(row.publishedContent) : null;
  const content = normalizeContent(input.slug, input.content, {
    lastUpdatedFallback: published?.lastUpdated ?? getDefaultLegalDocument(input.slug).lastUpdated,
    requireBody: false,
  });

  const now = new Date();
  const actorName = actorDisplayName(input.admin);
  const data = {
    draftContent: toInputJson(content),
    draftRevision: { increment: 1 },
    draftUpdatedAt: now,
    draftUpdatedById: input.admin.id,
    draftUpdatedByEmail: input.admin.email ?? null,
    draftUpdatedByName: actorName,
  };

  if (row) {
    const updated = await prisma.legalDocument.updateMany({
      where: { slug: input.slug, draftRevision: input.expectedRevision },
      data,
    });
    if (updated.count === 0) {
      throw new LegalDocumentError("STALE_UPDATE", "草稿已被其他管理员修改，请刷新后重试", 409);
    }
  } else {
    if (input.expectedRevision !== 0) {
      throw new LegalDocumentError("STALE_UPDATE", "草稿已被其他管理员修改，请刷新后重试", 409);
    }
    try {
      await prisma.legalDocument.create({
        data: {
          slug: input.slug,
          draftContent: toInputJson(content),
          draftRevision: 1,
          draftUpdatedAt: now,
          draftUpdatedById: input.admin.id,
          draftUpdatedByEmail: input.admin.email ?? null,
          draftUpdatedByName: actorName,
        },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new LegalDocumentError("STALE_UPDATE", "草稿已被其他管理员创建，请刷新后重试", 409);
      }
      throw error;
    }
  }

  return getAdminLegalDocument(input.slug);
}

export async function publishLegalDocument(input: {
  slug: LegalDocumentSlug;
  content: { description: string; sections: NormalizedSectionInput[] };
  expectedRevision: number;
  note?: string;
  admin: LegalAdminActor;
  request?: Request;
}): Promise<LegalAdminDocumentDetail> {
  await prisma.$transaction(
    async (tx) => {
      const row = await tx.legalDocument.findUnique({ where: { slug: input.slug } });
      if (row && row.draftRevision !== input.expectedRevision) {
        throw new LegalDocumentError("STALE_UPDATE", "草稿已被其他管理员修改，请刷新后重试", 409);
      }
      if (!row && input.expectedRevision !== 0) {
        throw new LegalDocumentError("STALE_UPDATE", "文档状态已变化，请刷新后重试", 409);
      }

      const published = row ? parsePublishedContent(row.publishedContent) : null;
      const content = normalizeContent(input.slug, input.content, {
        lastUpdatedFallback: todayLegalLastUpdated(),
        requireBody: true,
      });
      content.lastUpdated = todayLegalLastUpdated();

      if (
        published &&
        hashLegalContentForComparison(published) === hashLegalContentForComparison(content)
      ) {
        throw new LegalDocumentError("NO_CHANGES", "内容与当前已发布版本一致，无需发布", 400);
      }

      const version = (row?.publishedVersion ?? 0) + 1;
      const contentHash = hashLegalContent(content);
      const now = new Date();
      const actorName = actorDisplayName(input.admin);
      const publishedData = {
        draftContent: Prisma.DbNull,
        draftRevision: { increment: 1 as const },
        draftUpdatedAt: null,
        draftUpdatedById: null,
        draftUpdatedByEmail: null,
        draftUpdatedByName: null,
        publishedContent: toInputJson(content),
        publishedVersion: version,
        publishedAt: now,
        publishedById: input.admin.id,
        publishedByEmail: input.admin.email ?? null,
        publishedByName: actorName,
      };

      let documentId: string;
      if (row) {
        const updated = await tx.legalDocument.updateMany({
          where: {
            slug: input.slug,
            draftRevision: input.expectedRevision,
            publishedVersion: row.publishedVersion,
          },
          data: publishedData,
        });
        if (updated.count === 0) {
          throw new LegalDocumentError("STALE_UPDATE", "草稿已被其他管理员修改，请刷新后重试", 409);
        }
        documentId = row.id;
      } else {
        try {
          const created = await tx.legalDocument.create({
            data: {
              slug: input.slug,
              draftRevision: 1,
              publishedContent: toInputJson(content),
              publishedVersion: version,
              publishedAt: now,
              publishedById: input.admin.id,
              publishedByEmail: input.admin.email ?? null,
              publishedByName: actorName,
            },
          });
          documentId = created.id;
        } catch (error) {
          if (isUniqueConstraintError(error)) {
            throw new LegalDocumentError("STALE_UPDATE", "文档状态已变化，请刷新后重试", 409);
          }
          throw error;
        }
      }

      try {
        await tx.legalDocumentVersion.create({
          data: {
            documentId,
            version,
            content: toInputJson(content)!,
            contentHash,
            sectionCount: content.sections.length,
            note: input.note?.trim() || null,
            schemaVersion: 1,
            createdById: input.admin.id,
            createdByEmail: input.admin.email ?? null,
            createdByName: actorName,
          },
        });
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          throw new LegalDocumentError("STALE_UPDATE", "版本号冲突，请刷新后重试", 409);
        }
        throw error;
      }

      await createAuditLogTx(tx, {
        action: "legal_document_published",
        targetType: "legal_document",
        targetId: documentId,
        targetLabel: `${LEGAL_DOCUMENT_TITLES[input.slug]} v${version}`,
        detail: {
          slug: input.slug,
          version,
          previousVersion: row?.publishedVersion ?? 0,
          note: input.note?.trim() || null,
          sectionCount: content.sections.length,
          contentHash,
        },
        reason: input.note?.trim() || undefined,
        adminId: input.admin.id,
        actorEmail: input.admin.email ?? undefined,
        actorName: actorName ?? undefined,
        request: input.request,
      });
    },
    { timeout: 30_000, maxWait: 10_000 }
  );

  return getAdminLegalDocument(input.slug);
}

export async function discardLegalDraft(input: {
  slug: LegalDocumentSlug;
  expectedRevision: number;
  admin: LegalAdminActor;
  request?: Request;
}): Promise<LegalAdminDocumentDetail> {
  await prisma.$transaction(
    async (tx) => {
      const row = await tx.legalDocument.findUnique({ where: { slug: input.slug } });
      if (!row) {
        throw new LegalDocumentError("NOT_FOUND", "法务文档不存在", 404);
      }
      if (row.draftRevision !== input.expectedRevision) {
        throw new LegalDocumentError("STALE_UPDATE", "草稿已被其他管理员修改，请刷新后重试", 409);
      }
      if (!row.draftContent) {
        throw new LegalDocumentError("NO_DRAFT", "当前没有可丢弃的草稿", 400);
      }

      const updated = await tx.legalDocument.updateMany({
        where: { slug: input.slug, draftRevision: input.expectedRevision },
        data: {
          draftContent: Prisma.DbNull,
          draftRevision: { increment: 1 },
          draftUpdatedAt: null,
          draftUpdatedById: null,
          draftUpdatedByEmail: null,
          draftUpdatedByName: null,
        },
      });
      if (updated.count === 0) {
        throw new LegalDocumentError("STALE_UPDATE", "草稿已被其他管理员修改，请刷新后重试", 409);
      }

      await createAuditLogTx(tx, {
        action: "legal_document_draft_discarded",
        targetType: "legal_document",
        targetId: row.id,
        targetLabel: LEGAL_DOCUMENT_TITLES[input.slug],
        detail: { slug: input.slug },
        adminId: input.admin.id,
        actorEmail: input.admin.email ?? undefined,
        actorName: actorDisplayName(input.admin) ?? undefined,
        request: input.request,
      });
    },
    { timeout: 30_000, maxWait: 10_000 }
  );

  return getAdminLegalDocument(input.slug);
}

export async function restoreLegalVersionToDraft(input: {
  slug: LegalDocumentSlug;
  versionId: string;
  expectedRevision: number;
  admin: LegalAdminActor;
  request?: Request;
}): Promise<LegalAdminDocumentDetail> {
  await prisma.$transaction(
    async (tx) => {
      const row = await tx.legalDocument.findUnique({ where: { slug: input.slug } });
      if (!row) {
        throw new LegalDocumentError("NOT_FOUND", "法务文档不存在", 404);
      }
      if (row.draftRevision !== input.expectedRevision) {
        throw new LegalDocumentError("STALE_UPDATE", "草稿已被其他管理员修改，请刷新后重试", 409);
      }

      const versionRow = await tx.legalDocumentVersion.findFirst({
        where: { id: input.versionId, documentId: row.id },
      });
      if (!versionRow) {
        throw new LegalDocumentError("NOT_FOUND", "历史版本不存在", 404);
      }

      const parsed = legalDocumentContentSchema.safeParse(versionRow.content);
      if (!parsed.success) {
        throw new LegalDocumentError("INVALID_CONTENT", "历史版本内容校验失败，无法恢复", 400);
      }
      const content: LegalDocumentContent = {
        ...parsed.data,
        title: LEGAL_DOCUMENT_TITLES[input.slug],
      };

      const now = new Date();
      const updated = await tx.legalDocument.updateMany({
        where: { slug: input.slug, draftRevision: input.expectedRevision },
        data: {
          draftContent: toInputJson(content),
          draftRevision: { increment: 1 },
          draftUpdatedAt: now,
          draftUpdatedById: input.admin.id,
          draftUpdatedByEmail: input.admin.email ?? null,
          draftUpdatedByName: actorDisplayName(input.admin),
        },
      });
      if (updated.count === 0) {
        throw new LegalDocumentError("STALE_UPDATE", "草稿已被其他管理员修改，请刷新后重试", 409);
      }

      await createAuditLogTx(tx, {
        action: "legal_document_version_restored",
        targetType: "legal_document",
        targetId: row.id,
        targetLabel: `${LEGAL_DOCUMENT_TITLES[input.slug]} v${versionRow.version}`,
        detail: { slug: input.slug, version: versionRow.version },
        adminId: input.admin.id,
        actorEmail: input.admin.email ?? undefined,
        actorName: actorDisplayName(input.admin) ?? undefined,
        request: input.request,
      });
    },
    { timeout: 30_000, maxWait: 10_000 }
  );

  return getAdminLegalDocument(input.slug);
}

function mapVersionSummary(
  row: {
    id: string;
    version: number;
    note: string | null;
    contentHash: string;
    sectionCount: number;
    createdAt: Date;
    createdByEmail: string | null;
    createdByName: string | null;
  },
  currentPublishedVersion: number
): LegalVersionSummary {
  return {
    id: row.id,
    version: row.version,
    note: row.note,
    contentHash: row.contentHash,
    sectionCount: row.sectionCount,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdByName ?? row.createdByEmail ?? null,
    isCurrentPublished: row.version === currentPublishedVersion,
  };
}

export async function listLegalVersions(input: {
  slug: LegalDocumentSlug;
  cursor?: number;
  limit: number;
}): Promise<{ versions: LegalVersionSummary[]; nextCursor: number | null }> {
  const doc = await prisma.legalDocument.findUnique({
    where: { slug: input.slug },
    select: { id: true, publishedVersion: true },
  });
  if (!doc) {
    return { versions: [], nextCursor: null };
  }

  const rows = await prisma.legalDocumentVersion.findMany({
    where: {
      documentId: doc.id,
      ...(input.cursor ? { version: { lt: input.cursor } } : {}),
    },
    orderBy: { version: "desc" },
    take: input.limit + 1,
  });
  const hasMore = rows.length > input.limit;
  const page = hasMore ? rows.slice(0, input.limit) : rows;

  return {
    versions: page.map((row) => mapVersionSummary(row, doc.publishedVersion)),
    nextCursor: hasMore && page.length > 0 ? page[page.length - 1].version : null,
  };
}

export async function getLegalVersion(input: {
  slug: LegalDocumentSlug;
  versionId: string;
}): Promise<LegalVersionDetail> {
  const doc = await prisma.legalDocument.findUnique({
    where: { slug: input.slug },
    select: { id: true, publishedVersion: true },
  });
  if (!doc) {
    throw new LegalDocumentError("NOT_FOUND", "法务文档不存在", 404);
  }

  const row = await prisma.legalDocumentVersion.findFirst({
    where: { id: input.versionId, documentId: doc.id },
  });
  if (!row) {
    throw new LegalDocumentError("NOT_FOUND", "历史版本不存在", 404);
  }

  const parsed = legalDocumentContentSchema.safeParse(row.content);
  if (!parsed.success) {
    throw new LegalDocumentError("INVALID_CONTENT", "历史版本内容校验失败", 500);
  }

  return {
    ...mapVersionSummary(row, doc.publishedVersion),
    content: parsed.data,
  };
}

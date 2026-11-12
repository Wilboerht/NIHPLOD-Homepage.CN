import type { LegalDocumentSlug } from "@/types/legal";

export interface ExistingLegalDocumentState {
  publishedVersion: number;
  hasPublishedContent: boolean;
  hasDraftContent: boolean;
}

export type LegalSeedAction = "create" | "fill-unpublished" | "force-new-version" | "skip";

export interface LegalSeedPlanItem {
  slug: LegalDocumentSlug;
  action: LegalSeedAction;
  nextVersion: number;
  reason: string;
}

/**
 * 计算初始化填充计划（纯函数，便于单测）
 *
 * 默认只填充“从未发布过”的文档；已有线上内容一律跳过。
 * --force 时保留历史版本并生成新版本。
 */
export function planLegalSeed(input: {
  slug: LegalDocumentSlug;
  existing: ExistingLegalDocumentState | null;
  force: boolean;
}): LegalSeedPlanItem {
  const { slug, existing, force } = input;

  if (!existing) {
    return {
      slug,
      action: "create",
      nextVersion: 1,
      reason: "数据库中没有该文档，创建 v1 并写入现有文案",
    };
  }

  if (!existing.hasPublishedContent) {
    if (existing.hasDraftContent && !force) {
      return {
        slug,
        action: "skip",
        nextVersion: 0,
        reason: "存在未发布草稿，默认不覆盖；如确认要导入请加 --force",
      };
    }
    return {
      slug,
      action: "fill-unpublished",
      nextVersion: 1,
      reason: existing.hasDraftContent
        ? "已有未发布草稿，--force 仅填充线上内容（草稿保持不变）"
        : "文档尚未发布，导入为 v1",
    };
  }

  if (!force) {
    return {
      slug,
      action: "skip",
      nextVersion: existing.publishedVersion,
      reason: `已发布 v${existing.publishedVersion}，跳过（如需重新导入请加 --force）`,
    };
  }

  return {
    slug,
    action: "force-new-version",
    nextVersion: existing.publishedVersion + 1,
    reason: `已发布 v${existing.publishedVersion}，强制导入为 v${existing.publishedVersion + 1}（历史保留）`,
  };
}

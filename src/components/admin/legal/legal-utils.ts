import type { LegalDocumentContent } from "@/types/legal";

export function cloneLegalContent(content: LegalDocumentContent): LegalDocumentContent {
  return JSON.parse(JSON.stringify(content)) as LegalDocumentContent;
}

export function legalContentSignature(content: LegalDocumentContent): string {
  return JSON.stringify(content);
}

/**
 * 比较是否“实质变更”时忽略 lastUpdated：
 * 服务端发布时会自动把该字段改成当天，不能因此把相同内容当成新版本。
 */
export function legalContentComparableSignature(content: LegalDocumentContent): string {
  return JSON.stringify({ ...content, lastUpdated: "" });
}

export function validatePublishableContent(content: LegalDocumentContent): {
  ok: boolean;
  emptySectionIds: string[];
  message: string | null;
} {
  if (content.sections.length === 0) {
    return { ok: false, emptySectionIds: [], message: "至少保留一个章节" };
  }
  if (!content.description.trim()) {
    return { ok: false, emptySectionIds: [], message: "请填写页面描述" };
  }
  const emptySectionIds: string[] = [];
  for (const section of content.sections) {
    if (!section.title.trim() || !section.body.trim()) {
      emptySectionIds.push(section.id);
    }
  }
  if (emptySectionIds.length > 0) {
    return {
      ok: false,
      emptySectionIds,
      message: `还有 ${emptySectionIds.length} 个章节未填写标题或正文`,
    };
  }
  return { ok: true, emptySectionIds: [], message: null };
}

import type { LegalDocumentContent } from "@/types/legal";

export function cloneLegalContent(content: LegalDocumentContent): LegalDocumentContent {
  return JSON.parse(JSON.stringify(content)) as LegalDocumentContent;
}

export function legalContentSignature(content: LegalDocumentContent): string {
  return JSON.stringify(content);
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

/**
 * 法务文档代码内置默认内容（单一事实源）
 *
 * 线上优先使用数据库中已发布的 LegalDocument.publishedContent；
 * 数据库为空、不可用或内容校验失败时回退到这里，保证法律页面永不空白。
 */
import { defaultTermsContent } from "./terms-default-content";
import {
  PRIVACY_DESCRIPTION,
  PRIVACY_LAST_UPDATED,
  privacyData,
  privacySectionOrder,
} from "./privacy-default-content";
import {
  LEGAL_DOCUMENT_DESCRIPTIONS,
  LEGAL_DOCUMENT_TITLES,
  buildLegalSectionsFromFlatTexts,
  buildLegalSectionsFromSectionsRecord,
} from "./legal-content";
import type { LegalDocumentContent, LegalDocumentSlug } from "@/types/legal";

export const defaultLegalDocuments: Record<LegalDocumentSlug, LegalDocumentContent> = {
  terms: {
    title: LEGAL_DOCUMENT_TITLES.terms,
    description: defaultTermsContent.description || LEGAL_DOCUMENT_DESCRIPTIONS.terms,
    lastUpdated: defaultTermsContent.lastUpdated,
    sections: buildLegalSectionsFromFlatTexts(
      defaultTermsContent.tabs?.general?.content ?? [],
      "terms"
    ),
  },
  privacy: {
    title: LEGAL_DOCUMENT_TITLES.privacy,
    description: PRIVACY_DESCRIPTION || LEGAL_DOCUMENT_DESCRIPTIONS.privacy,
    lastUpdated: PRIVACY_LAST_UPDATED,
    sections: buildLegalSectionsFromSectionsRecord(privacyData, privacySectionOrder),
  },
};

export function getDefaultLegalDocument(slug: LegalDocumentSlug): LegalDocumentContent {
  return defaultLegalDocuments[slug];
}

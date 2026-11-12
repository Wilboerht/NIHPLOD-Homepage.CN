/**
 * 法务文档请求/存储校验
 *
 * 输入允许章节 id 缺省（服务端补 UUID）；存储与发布要求完整字段。
 * 草稿允许空正文（新增章节尚未写完），发布必须每章都有正文。
 */
import { z } from "zod";
import { LEGAL_DOCUMENT_SLUGS } from "@/types/legal";
import { isValidLegalLastUpdated } from "@/lib/legal-content";

export const LEGAL_SECTIONS_MAX = 80;
export const LEGAL_SECTION_TITLE_MAX = 200;
export const LEGAL_SECTION_BODY_MAX = 100_000;
export const LEGAL_DESCRIPTION_MAX = 500;
export const LEGAL_CONTENT_MAX_CHARS = 300_000;

export const legalSlugSchema = z.enum([...LEGAL_DOCUMENT_SLUGS]);

const lastUpdatedSchema = z
  .string()
  .trim()
  .regex(/^\d{4}年\d{1,2}月\d{1,2}日$/, "最近更新日期格式应为 YYYY年M月D日")
  .refine(isValidLegalLastUpdated, "最近更新日期不存在");

const sectionBaseSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[A-Za-z0-9_-]+$/, "章节 id 只能包含字母、数字、下划线和短横线")
    .optional(),
  title: z.string().trim().min(1, "章节标题不能为空").max(LEGAL_SECTION_TITLE_MAX, "章节标题过长"),
  body: z.string().max(LEGAL_SECTION_BODY_MAX, "章节正文过长"),
});

export const legalDraftContentInputSchema = z.object({
  title: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(LEGAL_DESCRIPTION_MAX, "页面描述最多 500 字").default(""),
  lastUpdated: lastUpdatedSchema.optional(),
  sections: z
    .array(sectionBaseSchema)
    .min(1, "至少保留一个章节")
    .max(LEGAL_SECTIONS_MAX, "章节数量过多"),
});

export const legalPublishContentInputSchema = z.object({
  title: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(LEGAL_DESCRIPTION_MAX, "页面描述最多 500 字").default(""),
  lastUpdated: lastUpdatedSchema.optional(),
  sections: z
    .array(
      sectionBaseSchema.extend({
        body: z
          .string()
          .trim()
          .min(1, "发布前请填写所有章节正文")
          .max(LEGAL_SECTION_BODY_MAX, "章节正文过长"),
      })
    )
    .min(1, "至少保留一个章节")
    .max(LEGAL_SECTIONS_MAX, "章节数量过多"),
});

/** 存储后的完整内容（草稿正文允许为空） */
export const legalDraftContentSchema = z.object({
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().max(LEGAL_DESCRIPTION_MAX),
  lastUpdated: lastUpdatedSchema,
  sections: z
    .array(
      sectionBaseSchema.extend({
        id: z
          .string()
          .trim()
          .min(1)
          .max(80)
          .regex(/^[A-Za-z0-9_-]+$/, "章节 id 只能包含字母、数字、下划线和短横线"),
      })
    )
    .min(1)
    .max(LEGAL_SECTIONS_MAX),
});

/** 存储/公开读取的正式内容 */
export const legalDocumentContentSchema = legalDraftContentSchema.extend({
  sections: z
    .array(
      sectionBaseSchema.extend({
        id: z
          .string()
          .trim()
          .min(1)
          .max(80)
          .regex(/^[A-Za-z0-9_-]+$/, "章节 id 只能包含字母、数字、下划线和短横线"),
        body: z.string().trim().min(1).max(LEGAL_SECTION_BODY_MAX),
      })
    )
    .min(1)
    .max(LEGAL_SECTIONS_MAX),
});

export const legalDraftSaveRequestSchema = z.object({
  content: legalDraftContentInputSchema,
  expectedRevision: z.number().int().min(0),
});

export const legalPublishRequestSchema = z.object({
  content: legalPublishContentInputSchema,
  expectedRevision: z.number().int().min(0),
  note: z.string().trim().max(200, "发布说明最多 200 字").optional(),
});

export const legalDiscardDraftRequestSchema = z.object({
  expectedRevision: z.number().int().min(0),
});

export const legalRestoreRequestSchema = z.object({
  versionId: z.string().min(1).max(64),
  expectedRevision: z.number().int().min(0),
});

export const legalVersionListQuerySchema = z.object({
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

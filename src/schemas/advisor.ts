/**
 * AI 护肤顾问相关验证 Schema
 */
import { z } from "zod";

// 肤质类型枚举
export const SkinTypeEnum = z.enum([
  "dry", // 干性肌肤
  "oily", // 油性肌肤
  "combination", // 混合性肌肤
  "sensitive", // 敏感性肌肤
  "normal", // 中性肌肤
]);

// 肌肤问题枚举
export const SkinConcernEnum = z.enum([
  "aging", // 抗衰老
  "wrinkles", // 细纹皱纹
  "dullness", // 肤色暗沉
  "dryness", // 干燥缺水
  "acne", // 痘痘粉刺
  "pores", // 毛孔粗大
  "spots", // 色斑
  "sensitivity", // 敏感泛红
]);

// 年龄段枚举
export const AgeRangeEnum = z.enum([
  "under25", // 25岁以下
  "25-30", // 25-30岁
  "30-40", // 30-40岁
  "40-50", // 40-50岁
  "above50", // 50岁以上
]);

// AI 顾问消息 Schema
export const AdvisorMessageSchema = z.object({
  message: z.string().min(1, "消息不能为空").max(1000, "消息不能超过1000个字符"),
  conversationId: z.string().optional(),
});

// 护肤偏好问卷 Schema（根据用户需求定制）
export const AdvisorAnswersSchema = z.object({
  skinType: SkinTypeEnum.optional(),
  skinConcerns: z.array(SkinConcernEnum).max(5).optional(),
  ageRange: AgeRangeEnum.optional(),
  allergies: z.array(z.string()).max(10).optional(),
  currentRoutine: z.string().max(500).optional(),
  specialRequirements: z.string().max(500).optional(),
});

// 问卷式问答 Schema（匹配 advisor-questions.ts 配置）
export const QuestionnaireAnswersSchema = z.object({
  skinType: z.enum(["dry", "oily", "combination", "sensitive", "normal", "unknown"]).optional(),
  primaryConcern: z.enum(["aging", "dull", "hydration", "pores", "sensitive", "acne"]).optional(),
  ageRange: z.enum(["18-24", "25-30", "31-40", "41-50", "50+"]).optional(),
  currentRoutine: z.enum(["minimal", "basic", "complete", "advanced", "none"]).optional(),
  allergies: z.enum(["none", "fragrance", "alcohol", "acid", "multiple", "unknown"]).optional(),
  budget: z.enum(["budget", "mid", "premium", "luxury"]).optional(),
});

// 面部分析结果 Schema
export const FaceAnalysisResultSchema = z.object({
  skinType: z.object({
    type: z.string(),
    confidence: z.number(),
    description: z.string().optional(),
  }),
  skinConditions: z.array(z.object({
    condition: z.string(),
    severity: z.enum(["mild", "moderate", "severe"]),
    area: z.string().optional(),
    description: z.string().optional(),
  })),
  hydration: z.object({
    level: z.enum(["low", "medium", "high"]),
    percent: z.number().min(0).max(100).optional(), // AI 返回的水分百分比
    description: z.string().optional(),
  }),
  skinAge: z.object({
    estimated: z.number(),
    factors: z.array(z.string()).optional(),
  }).optional(),
  recommendations: z.array(z.string()).optional(),
});

// 分析请求 Schema
export const AnalyzeRequestSchema = z.object({
  answers: QuestionnaireAnswersSchema,
  // 使用 .nullish() 允许 null、undefined 或有效值
  faceAnalysis: FaceAnalysisResultSchema.nullish(),
});

// 护肤顾问上下文 Schema
export const AdvisorContextSchema = z.object({
  answers: AdvisorAnswersSchema.optional(),
  previousMessages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })
    )
    .max(50)
    .optional(),
});

// 顾问请求 Schema
export const AdvisorRequestSchema = z.object({
  message: z.string().min(1, "消息不能为空").max(1000, "消息不能超过1000个字符"),
  conversationId: z.string().optional(),
  context: AdvisorContextSchema.optional(),
});

// 类型导出
export type SkinType = z.infer<typeof SkinTypeEnum>;
export type SkinConcern = z.infer<typeof SkinConcernEnum>;
export type AgeRange = z.infer<typeof AgeRangeEnum>;
export type AdvisorMessageData = z.infer<typeof AdvisorMessageSchema>;
export type AdvisorAnswers = z.infer<typeof AdvisorAnswersSchema>;
export type AdvisorContext = z.infer<typeof AdvisorContextSchema>;
export type AdvisorRequest = z.infer<typeof AdvisorRequestSchema>;
export type QuestionnaireAnswers = z.infer<typeof QuestionnaireAnswersSchema>;
export type FaceAnalysisResult = z.infer<typeof FaceAnalysisResultSchema>;
export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>;

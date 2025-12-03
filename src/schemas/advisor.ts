/**
 * AI 顾问相关验证 Schema
 */
import { z } from "zod";

// 婚礼风格枚举
export const WeddingStyleEnum = z.enum([
  "romantic", // 浪漫风
  "modern", // 现代简约
  "classic", // 经典传统
  "garden", // 花园风
  "bohemian", // 波西米亚
  "luxury", // 奢华风
  "rustic", // 乡村风
  "minimalist", // 极简风
]);

// 预算范围枚举
export const BudgetRangeEnum = z.enum([
  "under50k", // 5万以下
  "50k-100k", // 5-10万
  "100k-200k", // 10-20万
  "200k-500k", // 20-50万
  "above500k", // 50万以上
]);

// 场地类型枚举
export const VenueTypeEnum = z.enum([
  "hotel", // 酒店
  "church", // 教堂
  "outdoor", // 户外
  "garden", // 花园
  "beach", // 海滩
  "villa", // 别墅
  "restaurant", // 餐厅
  "other", // 其他
]);

// AI 顾问消息 Schema
export const AdvisorMessageSchema = z.object({
  message: z.string().min(1, "消息不能为空").max(1000, "消息不能超过1000个字符"),
  conversationId: z.string().optional(),
});

// 婚礼偏好问卷 Schema（根据用户需求定制）
export const AdvisorAnswersSchema = z.object({
  weddingStyle: WeddingStyleEnum.optional(),
  budget: BudgetRangeEnum.optional(),
  venueType: VenueTypeEnum.optional(),
  guestCount: z.coerce.number().int().min(1).max(1000).optional(),
  weddingDate: z.string().optional(),
  colorPreference: z.array(z.string()).max(5).optional(),
  flowerPreference: z.array(z.string()).max(10).optional(),
  specialRequirements: z.string().max(500).optional(),
});

// 婚礼顾问上下文 Schema
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
export type WeddingStyle = z.infer<typeof WeddingStyleEnum>;
export type BudgetRange = z.infer<typeof BudgetRangeEnum>;
export type VenueType = z.infer<typeof VenueTypeEnum>;
export type AdvisorMessageData = z.infer<typeof AdvisorMessageSchema>;
export type AdvisorAnswers = z.infer<typeof AdvisorAnswersSchema>;
export type AdvisorContext = z.infer<typeof AdvisorContextSchema>;
export type AdvisorRequest = z.infer<typeof AdvisorRequestSchema>;

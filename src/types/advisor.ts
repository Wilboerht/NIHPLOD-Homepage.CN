/**
 * AI 护肤顾问相关类型定义
 */

export interface AdvisorMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export interface AdvisorConversation {
  id: string;
  userId?: string;
  messages: AdvisorMessage[];
  summary?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AdvisorRequest {
  message: string;
  conversationId?: string;
  context?: AdvisorContext;
}

export interface AdvisorContext {
  skinType?: string; // 肤质类型
  skinConcerns?: string[]; // 肌肤问题
  ageRange?: string; // 年龄段
  allergies?: string[]; // 过敏成分
  currentRoutine?: string; // 当前护肤流程
  preferences?: string[];
}

export interface AdvisorResponse {
  message: string;
  suggestions?: ProductSuggestion[];
  conversationId: string;
}

export interface ProductSuggestion {
  productId: string;
  product: {
    id: string;
    title: string;
    image?: string;
  };
  reason: string;
}

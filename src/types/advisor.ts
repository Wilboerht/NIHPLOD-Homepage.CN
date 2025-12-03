/**
 * AI 婚礼顾问相关类型定义
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
  budget?: string;
  style?: string;
  venue?: string;
  guestCount?: number;
  date?: string;
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

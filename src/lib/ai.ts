/**
 * AI 接口
 * TODO: 实现完整功能
 */

export interface AIMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface AIResponse {
  message: string;
  suggestions?: string[];
}

export async function chat(_messages: AIMessage[]): Promise<AIResponse> {
  // TODO: 实现 AI 对话
  return {
    message: "AI 功能待实现",
    suggestions: [],
  };
}

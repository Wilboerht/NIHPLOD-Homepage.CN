/**
 * AI 追问对话 API
 * POST /api/advisor/chat - 发送追问消息
 *
 * 使用管理端配置的 AI 服务
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyUserAuth } from "@/lib/auth";
import { consumePoints, hasEnoughPoints, POINT_RULES } from "@/lib/points";
import { getAISettings, getApiKeyForProvider } from "@/lib/ai";
import { dualRateLimit, getClientIP } from "@/lib/ratelimit";
import OpenAI from "openai";

// 请求参数验证
const chatSchema = z.object({
  conversationId: z.string().nullish(), // 可选，首次对话时自动创建
  message: z.string().min(1, "请输入问题").max(500, "问题过长"),
  context: z.object({
    analysisId: z.string().nullish(), // 关联的分析结果ID
    skinType: z.string().nullish(),
    concerns: z.array(z.string()).nullish(),
  }).nullish(),
});

// 此文件保留作为非流式 API 的备用
// 默认系统提示词已移至 src/lib/ai.ts 的 DEFAULT_CHAT_SYSTEM_PROMPT

/**
 * 获取 OpenAI 兼容 API 的 Base URL
 * 优先使用管理端配置，降级到环境变量
 */
function getBaseUrl(provider: string): string {
  switch (provider) {
    case "deepseek":
      return process.env.DEEPSEEK_API_URL || "https://api.deepseek.com/v1";
    case "qwen":
      return process.env.QWEN_API_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1";
    case "openai":
    default:
      return process.env.OPENAI_API_URL || "https://api.openai.com/v1";
  }
}

/**
 * 获取 Anthropic API URL
 */
function getAnthropicApiUrl(): string {
  return process.env.ANTHROPIC_API_URL || "https://api.anthropic.com/v1/messages";
}

/**
 * 获取 Gemini API URL
 */
function getGeminiApiUrl(model: string): string {
  const baseUrl = process.env.GEMINI_API_URL || "https://generativelanguage.googleapis.com/v1beta";
  return `${baseUrl}/models/${model}:generateContent`;
}

export async function POST(request: NextRequest) {
  try {
    // 速率限制检查（IP + 用户双重限流）
    const ip = getClientIP(request);

    // 先进行基础 IP 限流（未登录也能生效）
    const payload = await verifyUserAuth(request);

    // 双重限流：IP 10次/分钟 + 用户 15次/分钟
    const rateLimitResult = await dualRateLimit(ip, payload?.id, "chat", "chat-user");
    if (!rateLimitResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "RATE_LIMIT_EXCEEDED",
            message: rateLimitResult.limitedBy === "user"
              ? "您的提问过于频繁，请稍后再试"
              : "请求过于频繁，请稍后再试",
          },
        },
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": String(rateLimitResult.limit),
            "X-RateLimit-Remaining": String(rateLimitResult.remaining),
            "X-RateLimit-Reset": String(rateLimitResult.reset),
            "Retry-After": String(Math.ceil((rateLimitResult.reset - Date.now()) / 1000)),
          },
        }
      );
    }

    if (!payload) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "请先登录后提问" } },
        { status: 401 }
      );
    }

    const body = await request.json();

    // 参数验证
    const result = chatSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: result.error.issues[0]?.message || "参数错误" } },
        { status: 400 }
      );
    }

    const { conversationId, message, context } = result.data;

    // 检查积分（追问需要消耗积分）
    let conversation;
    let isFirstMessage = false;

    if (conversationId) {
      // 获取现有对话
      conversation = await prisma.advisorConversation.findFirst({
        where: { id: conversationId, userId: payload.id },
        include: { messages: { orderBy: { createdAt: "asc" }, take: 10 } },
      });

      if (!conversation) {
        return NextResponse.json(
          { success: false, error: { code: "NOT_FOUND", message: "对话不存在" } },
          { status: 404 }
        );
      }

      // 检查点数（非首次消息需要消耗点数）
      const hasPoints = await hasEnoughPoints(payload.id, POINT_RULES.AI_QUESTION_COST);
      if (!hasPoints) {
        return NextResponse.json(
          { success: false, error: { code: "INSUFFICIENT_POINTS", message: "护肤点数不足，无法追问" } },
          { status: 400 }
        );
      }
    } else {
      // 创建新对话（首次免费）
      isFirstMessage = true;
      conversation = await prisma.advisorConversation.create({
        data: {
          userId: payload.id,
          ...(context && { analysisResult: context }),
        },
        include: { messages: true },
      });
    }

    // 获取管理端 AI 配置
    const aiSettings = await getAISettings();
    const provider = aiSettings.provider || "deepseek";
    const model = aiSettings.model || "deepseek-chat";
    const apiKey = getApiKeyForProvider(provider);

    if (!apiKey) {
      console.error("[AdvisorChat] API key not configured for provider:", provider);
      return NextResponse.json(
        { success: false, error: { code: "AI_CONFIG_ERROR", message: "AI 服务配置错误" } },
        { status: 500 }
      );
    }

    // 使用追问专用系统提示词
    const systemPrompt = aiSettings.chatSystemPrompt;

    // 构建消息历史
    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: systemPrompt },
    ];

    // 添加上下文
    if (context?.skinType || context?.concerns?.length) {
      messages.push({
        role: "system",
        content: `用户信息：肤质-${context.skinType || "未知"}，关注问题-${context.concerns?.join("、") || "未指定"}`,
      });
    }

    // 添加历史消息
    for (const msg of conversation.messages) {
      messages.push({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      });
    }

    // 添加当前消息
    messages.push({ role: "user", content: message });

    // 根据管理端配置的 provider 调用对应的 AI 服务
    let aiResponse: string;

    if (provider === "openai" || provider === "deepseek" || provider === "qwen") {
      // OpenAI 兼容 API（OpenAI、DeepSeek、通义千问）
      const openai = new OpenAI({
        apiKey,
        baseURL: getBaseUrl(provider),
      });

      const completion = await openai.chat.completions.create({
        model,
        messages,
        max_tokens: aiSettings.maxTokens || 500,
        temperature: aiSettings.temperature ?? 0.7,
      });

      aiResponse = completion.choices[0]?.message?.content || "抱歉，我暂时无法回答这个问题。";
    } else if (provider === "anthropic") {
      // Anthropic Claude
      const response = await fetch(getAnthropicApiUrl(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: model || "claude-sonnet-4-20250514",
          max_tokens: aiSettings.maxTokens || 500,
          temperature: aiSettings.temperature ?? 0.7,
          system: systemPrompt,
          messages: messages.filter(m => m.role !== "system").map(m => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[AdvisorChat] Anthropic API error:", errorText);
        throw new Error(`Anthropic API error: ${response.status}`);
      }

      const data = await response.json();
      aiResponse = data.content[0]?.text || "抱歉，我暂时无法回答这个问题。";
    } else if (provider === "gemini") {
      // Google Gemini
      const geminiModel = model || "gemini-2.0-flash";
      const url = `${getGeminiApiUrl(geminiModel)}?key=${apiKey}`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: `${systemPrompt}\n\n${messages.filter(m => m.role !== "system").map(m => `${m.role}: ${m.content}`).join("\n\n")}` }
              ],
            },
          ],
          generationConfig: {
            maxOutputTokens: aiSettings.maxTokens || 500,
            temperature: aiSettings.temperature ?? 0.7,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[AdvisorChat] Gemini API error:", errorText);
        throw new Error(`Gemini API error: ${response.status}`);
      }

      const data = await response.json();
      aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || "抱歉，我暂时无法回答这个问题。";
    } else {
      // 默认使用 OpenAI 兼容 API
      const openai = new OpenAI({
        apiKey,
        baseURL: getBaseUrl(provider),
      });

      const completion = await openai.chat.completions.create({
        model,
        messages,
        max_tokens: aiSettings.maxTokens || 500,
        temperature: aiSettings.temperature ?? 0.7,
      });

      aiResponse = completion.choices[0]?.message?.content || "抱歉，我暂时无法回答这个问题。";
    }

    // 保存用户消息和 AI 回复，并更新对话统计
    await prisma.$transaction(async (tx) => {
      await tx.conversationMessage.createMany({
        data: [
          { conversationId: conversation.id, role: "user", content: message, pointsCost: 0 },
          { conversationId: conversation.id, role: "assistant", content: aiResponse, pointsCost: isFirstMessage ? 0 : POINT_RULES.AI_QUESTION_COST },
        ],
      });

      // 更新对话统计
      await tx.advisorConversation.update({
        where: { id: conversation.id },
        data: {
          messageCount: { increment: 2 },
          pointsConsumed: { increment: isFirstMessage ? 0 : POINT_RULES.AI_QUESTION_COST },
        },
      });

      // 非首次消息扣减点数
      if (!isFirstMessage) {
        await consumePoints(
          payload.id,
          "AI_CHAT_CONSUME",
          POINT_RULES.AI_QUESTION_COST,
          "AI护肤顾问对话",
          conversation.id
        );
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        conversationId: conversation.id,
        message: aiResponse,
        pointsConsumed: isFirstMessage ? 0 : POINT_RULES.AI_QUESTION_COST,
        isFirstMessage,
      },
    });
  } catch (error) {
    console.error("[AdvisorChat] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}


/**
 * AI 追问对话流式 API
 * POST /api/advisor/chat/stream - 发送追问消息（SSE 流式响应）
 *
 * 使用 Server-Sent Events 实现打字机效果
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyUserAuth } from "@/lib/auth";
import { consumePoints, hasEnoughPoints, POINT_RULES } from "@/lib/points";
import { getAISettings, getApiKeyForProvider } from "@/lib/ai";
import { dualRateLimit, getClientIP } from "@/lib/ratelimit";
import OpenAI from "openai";

// 请求参数验证
const chatSchema = z.object({
  conversationId: z.string().nullish(),
  message: z.string().min(1, "请输入问题").max(500, "问题过长"),
  context: z.object({
    analysisId: z.string().nullish(),
    skinType: z.string().nullish(),
    concerns: z.array(z.string()).nullish(),
  }).nullish(),
});

// 对话摘要阈值（超过此数量的消息对将生成摘要）
const SUMMARY_THRESHOLD = 8;

/**
 * 获取 OpenAI 兼容 API 的 Base URL
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
 * 生成对话摘要（当消息过多时）
 */
async function generateConversationSummary(
  messages: Array<{ role: string; content: string }>,
  provider: string,
  apiKey: string,
  model: string
): Promise<string> {
  const openai = new OpenAI({ apiKey, baseURL: getBaseUrl(provider) });
  
  const summaryPrompt = `请将以下对话总结为一段简洁的摘要（100字以内），保留关键信息：\n\n${
    messages.map(m => `${m.role}: ${m.content}`).join("\n")
  }`;

  const completion = await openai.chat.completions.create({
    model,
    messages: [{ role: "user", content: summaryPrompt }],
    max_tokens: 200,
    temperature: 0.3,
  });

  return completion.choices[0]?.message?.content || "";
}

export async function POST(request: NextRequest) {
  // 速率限制检查（IP + 用户双重限流）
  const ip = getClientIP(request);
  const payload = await verifyUserAuth(request);

  // 双重限流：IP 10次/分钟 + 用户 15次/分钟
  const rateLimitResult = await dualRateLimit(ip, payload?.id, "chat", "chat-user");
  if (!rateLimitResult.success) {
    return new Response(
      JSON.stringify({
        success: false,
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message: rateLimitResult.limitedBy === "user"
            ? "您的提问过于频繁，请稍后再试"
            : "请求过于频繁，请稍后再试",
        },
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "X-RateLimit-Limit": String(rateLimitResult.limit),
          "X-RateLimit-Remaining": String(rateLimitResult.remaining),
          "X-RateLimit-Reset": String(rateLimitResult.reset),
          "Retry-After": String(Math.ceil((rateLimitResult.reset - Date.now()) / 1000)),
        },
      }
    );
  }

  if (!payload) {
    return new Response(
      JSON.stringify({ success: false, error: { code: "UNAUTHORIZED", message: "请先登录后提问" } }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: { code: "INVALID_JSON", message: "无效的请求体" } }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // 参数验证
  const result = chatSchema.safeParse(body);
  if (!result.success) {
    return new Response(
      JSON.stringify({ success: false, error: { code: "INVALID_PARAMS", message: result.error.issues[0]?.message || "参数错误" } }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const { conversationId, message, context } = result.data;

  // 检查积分和获取/创建对话
  let conversation;
  let isFirstMessage = false;

  try {
    if (conversationId) {
      conversation = await prisma.advisorConversation.findFirst({
        where: { id: conversationId, userId: payload.id },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      });

      if (!conversation) {
        return new Response(
          JSON.stringify({ success: false, error: { code: "NOT_FOUND", message: "对话不存在" } }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }

      const hasPoints = await hasEnoughPoints(payload.id, POINT_RULES.AI_QUESTION_COST);
      if (!hasPoints) {
        return new Response(
          JSON.stringify({ success: false, error: { code: "INSUFFICIENT_POINTS", message: "护肤点数不足，无法追问" } }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
    } else {
      isFirstMessage = true;
      conversation = await prisma.advisorConversation.create({
        data: {
          userId: payload.id,
          ...(context && { analysisResult: context }),
        },
        include: { messages: true },
      });
    }
  } catch (error) {
    console.error("[AdvisorChatStream] 数据库操作失败:", error);
    return new Response(
      JSON.stringify({ success: false, error: { code: "DB_ERROR", message: "数据库操作失败" } }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // 获取 AI 配置
  const aiSettings = await getAISettings();
  const provider = aiSettings.provider || "deepseek";
  const model = aiSettings.model || "deepseek-chat";
  const apiKey = getApiKeyForProvider(provider);

  if (!apiKey) {
    return new Response(
      JSON.stringify({ success: false, error: { code: "AI_CONFIG_ERROR", message: "AI 服务配置错误" } }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // 使用追问专用系统提示词
  const systemPrompt = aiSettings.chatSystemPrompt;

  // 返回流
  const convId = conversation.id;
  const convMessages = conversation.messages;
  const userId = payload.id;

  // 创建 SSE 流式响应
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        // 发送对话ID
        sendEvent("init", { conversationId: convId, isFirstMessage });

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

        // 处理历史消息（如果过多则生成摘要）
        const historyMessages = convMessages.map(m => ({ role: m.role, content: m.content }));

        if (historyMessages.length > SUMMARY_THRESHOLD * 2) {
          // 生成摘要
          const oldMessages = historyMessages.slice(0, -4);
          const recentMessages = historyMessages.slice(-4);

          const summary = await generateConversationSummary(oldMessages, provider, apiKey, model);
          if (summary) {
            messages.push({
              role: "system",
              content: `之前对话摘要：${summary}`,
            });
          }

          // 添加最近的消息
          for (const msg of recentMessages) {
            messages.push({ role: msg.role as "user" | "assistant", content: msg.content });
          }
        } else {
          // 添加所有历史消息
          for (const msg of historyMessages) {
            messages.push({ role: msg.role as "user" | "assistant", content: msg.content });
          }
        }

        // 添加当前消息
        messages.push({ role: "user", content: message });

        // 调用 AI（流式）
        const openai = new OpenAI({ apiKey, baseURL: getBaseUrl(provider) });

        const completion = await openai.chat.completions.create({
          model,
          messages,
          max_tokens: aiSettings.maxTokens || 500,
          temperature: aiSettings.temperature ?? 0.7,
          stream: true,
        });

        let fullResponse = "";

        for await (const chunk of completion) {
          const content = chunk.choices[0]?.delta?.content || "";
          if (content) {
            fullResponse += content;
            sendEvent("content", { text: content });
          }
        }

        // 保存消息到数据库
        await prisma.$transaction(async (tx) => {
          // 保存用户消息和 AI 回复
          await tx.conversationMessage.createMany({
            data: [
              { conversationId: convId, role: "user", content: message, pointsCost: 0 },
              { conversationId: convId, role: "assistant", content: fullResponse, pointsCost: isFirstMessage ? 0 : POINT_RULES.AI_QUESTION_COST },
            ],
          });

          // 更新对话统计
          await tx.advisorConversation.update({
            where: { id: convId },
            data: {
              messageCount: { increment: 2 },
              pointsConsumed: { increment: isFirstMessage ? 0 : POINT_RULES.AI_QUESTION_COST },
            },
          });

          // 非首次消息扣减点数
          if (!isFirstMessage) {
            await consumePoints(
              userId,
              "AI_CHAT_CONSUME",
              POINT_RULES.AI_QUESTION_COST,
              "AI护肤顾问对话",
              convId
            );
          }
        });

        // 发送完成事件
        sendEvent("done", {
          conversationId: convId,
          pointsConsumed: isFirstMessage ? 0 : POINT_RULES.AI_QUESTION_COST,
        });

      } catch (error) {
        console.error("[AdvisorChatStream] 流式响应错误:", error);
        sendEvent("error", { message: "AI 响应失败，请重试" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}


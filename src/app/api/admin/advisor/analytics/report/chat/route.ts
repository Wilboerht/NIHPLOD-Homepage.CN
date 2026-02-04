/**
 * AI 分析报告追问功能 API
 * POST /api/admin/advisor/analytics/report/chat
 *
 * 支持在报告生成后继续向 AI 提问细节
 */

import { NextRequest } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { getAISettings, getApiKeyForProvider } from "@/lib/ai";

// 服务商 API 配置
function getOpenAICompatibleBaseUrl(provider: string): string {
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

// 追问系统提示词
const CHAT_SYSTEM_PROMPT = `你是 NIHPLOD 旎柏护肤品牌的数据分析助手。用户已经阅读了一份关于护肤顾问的数据分析报告，现在希望对报告中的某些内容进行追问或深入了解。

## 你的职责
1. 基于已有的报告内容和原始数据回答用户的问题
2. 提供更深入的分析和见解
3. 解释报告中的专业术语
4. 给出更具体的优化建议

## 回答原则
1. 保持客观，所有数据引用必须来自用户提供的上下文
2. 如果问题超出了数据范围，诚实说明"当前数据无法回答这个问题"
3. 回答简洁有条理，使用 Markdown 格式
4. 避免重复报告中已有的内容，除非用户明确要求解释`;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  // 验证管理员身份
  const admin = await verifyAuth(request);
  if (!admin) {
    return new Response(JSON.stringify({ error: "未授权访问" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = await request.json();
    const { question, reportContent, chatHistory = [], analyticsData } = body;

    if (!question || !reportContent) {
      return new Response(JSON.stringify({ error: "缺少必要参数" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 获取 AI 设置
    const settings = await getAISettings();
    const provider = settings.provider || "deepseek";
    const model = settings.model || "deepseek-chat";
    const apiKey = getApiKeyForProvider(provider);

    if (!apiKey) {
      return new Response(JSON.stringify({ error: `未配置 ${provider} API Key` }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 构建上下文消息
    const contextMessage = `以下是之前生成的数据分析报告：

${reportContent}

---

${analyticsData ? `原始数据摘要：
- 总会话数：${analyticsData.overview?.totalSessions || 0}
- 完成会话：${analyticsData.overview?.completedSessions || 0}
- 转化率：${((analyticsData.overview?.conversionRate || 0) * 100).toFixed(1)}%
- 面部扫描率：${((analyticsData.overview?.faceScanRate || 0) * 100).toFixed(1)}%
- AI分析率：${((analyticsData.overview?.aiUsageRate || 0) * 100).toFixed(1)}%` : ""}

请根据以上内容回答用户的问题。`;

    // 构建消息列表
    const messages = [
      { role: "system", content: CHAT_SYSTEM_PROMPT },
      { role: "user", content: contextMessage },
      { role: "assistant", content: "好的，我已经了解了报告内容和数据。请问您想了解什么？" },
      ...chatHistory.map((msg: ChatMessage) => ({
        role: msg.role,
        content: msg.content,
      })),
      { role: "user", content: question },
    ];

    // 创建流式响应
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          if (provider === "openai" || provider === "deepseek" || provider === "qwen") {
            const baseUrl = getOpenAICompatibleBaseUrl(provider);
            
            const response = await fetch(`${baseUrl}/chat/completions`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
              },
              body: JSON.stringify({
                model,
                messages,
                max_tokens: 1000,
                temperature: 0.5,
                stream: true,
              }),
            });

            if (!response.ok) {
              const errorText = await response.text();
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: errorText })}\n\n`));
              controller.close();
              return;
            }

            const reader = response.body?.getReader();
            if (!reader) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "无法获取响应流" })}\n\n`));
              controller.close();
              return;
            }

            const decoder = new TextDecoder();
            let buffer = "";

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() || "";

              for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith("data: ")) {
                  const data = trimmed.slice(6);
                  if (data === "[DONE]") {
                    controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                    continue;
                  }
                  try {
                    const parsed = JSON.parse(data);
                    const content = parsed.choices?.[0]?.delta?.content;
                    if (content) {
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
                    }
                  } catch {
                    // 忽略解析错误
                  }
                }
              }
            }
          } else {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: `${provider} 暂不支持追问` })}\n\n`));
          }
        } catch (error) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: error instanceof Error ? error.message : "未知错误" })}\n\n`));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "请求失败" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}


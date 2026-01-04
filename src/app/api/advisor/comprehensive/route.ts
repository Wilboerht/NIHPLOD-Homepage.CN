import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import { UNIFIED_ANALYSIS_SYSTEM_PROMPT } from "@/config/ai-prompts";
import { getAISettings, getApiKeyForProvider } from "@/lib/ai";
import { aiLogger } from "@/lib/logger";

// 定义请求 Schema
const ComprehensiveRequestSchema = z.object({
  answers: z.any(), // 问卷答案 (loose schema to be flexible)
  images: z.object({
    front: z.string().optional(),
    left: z.string().optional(),
    right: z.string().optional(),
  }),
});

/**
 * 统一分析结果类型
 */
interface UnifiedAnalysisResult {
  faceAnalysis: any;
  comprehensiveResult: any;
}

/**
 * POST /api/advisor/comprehensive
 * 统一分析 API - 整合视觉分析和综合建议
 * 相比分步调用，速度提升 40-50%
 */
export async function POST(request: NextRequest) {
  try {
    // 1. 速率限制
    const ip = getClientIP(request);
    const rateLimitResult = await rateLimit(ip, "comprehensive-analyze");

    if (!rateLimitResult.success) {
      return NextResponse.json(
        { success: false, error: { code: "RATE_LIMIT_EXCEEDED", message: "分析过于频繁，请稍后再试" } },
        { status: 429 }
      );
    }

    // 2. 验证和解析请求
    const body = await request.json();
    const result = ComprehensiveRequestSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "请求参数不完整" } },
        { status: 400 }
      );
    }

    const { answers, images } = result.data;

    // 收集有效图片
    const validImages: { angle: string; data: string }[] = [];
    if (images.front?.startsWith("data:image/")) validImages.push({ angle: "正脸", data: images.front });
    if (images.left?.startsWith("data:image/")) validImages.push({ angle: "左侧", data: images.left });
    if (images.right?.startsWith("data:image/")) validImages.push({ angle: "右侧", data: images.right });

    if (validImages.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: "NO_IMAGES", message: "请提供至少一张有效的面部照片" } },
        { status: 400 }
      );
    }

    // 3. 构建 Prompt
    const userPrompt = buildUserPrompt(answers, validImages);

    // 4. 调用 AI
    const aiResult = await callUnifiedAI(validImages, userPrompt);

    return NextResponse.json({
      success: true,
      data: aiResult,
    });

  } catch (error) {
    aiLogger.error("Unified analysis error", { error: String(error) });
    return NextResponse.json(
      { success: false, error: { code: "ANALYSIS_FAILED", message: "分析服务暂时繁忙，请重试" } },
      { status: 500 }
    );
  }
}

/**
 * 构建用户 Prompt (包含问卷信息)
 */
function buildUserPrompt(answers: any, images: { angle: string }[]) {
  // 简单的问卷摘要
  const profile = [
    `用户自述肤质: ${answers.skinType || "未填写"}`,
    `年龄段: ${answers.ageRange || "未填写"}`,
    `核心诉求: ${Array.isArray(answers.primaryConcern) ? answers.primaryConcern.join(",") : answers.primaryConcern || "未填写"}`,
    `护肤习惯: ${answers.currentRoutine || "未填写"}`,
    `预算偏好: ${answers.budget || "未填写"}`,
    `过敏史: ${answers.allergies || "无"}`
  ].join("\n");

  return `
# 用户个人档案
${profile}

# 提供的照片
共 ${images.length} 张 (${images.map(i => i.angle).join(", ")})。

请根据系统指令，结合这份档案和照片，生成完整的 JSON 分析报告。
`;
}

/**
 * 调用 AI
 */
async function callUnifiedAI(
  images: { angle: string; data: string }[],
  userPrompt: string
): Promise<UnifiedAnalysisResult> {
  // 1. 获取动态配置
  const settings = await getAISettings();
  // 优先使用 visionProvider，因为这是一个多模态任务
  const provider = settings.visionProvider || "openai";
  const model = settings.visionModel || "gpt-4o";
  const apiKey = getApiKeyForProvider(provider);

  if (!apiKey) {
    aiLogger.error("Unified Analysis: API Key missing", { provider });
    throw new Error(`AI API Key not configured for provider: ${provider}`);
  }

  aiLogger.info("Starting Unified Analysis", { provider, model, imageCount: images.length });

  // 2. 确定 Base URL
  let baseUrl = "https://api.openai.com/v1";
  if (provider === "qwen") {
    // 通义千问兼容接口
    baseUrl = process.env.QWEN_API_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1";
  } else if (provider === "deepseek") {
    baseUrl = process.env.DEEPSEEK_API_URL || "https://api.deepseek.com/v1";
  } else if (process.env.OPENAI_API_URL) {
    baseUrl = process.env.OPENAI_API_URL;
  }

  // 3. 构建请求体 (OpenAI Chat Completion 兼容格式)
  const requestBody = {
    model: model,
    messages: [
      { role: "system", content: UNIFIED_ANALYSIS_SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: userPrompt },
          ...images.map(img => ({
            type: "image_url",
            image_url: { url: img.data } // 大部分兼容接口自动推断 detail
          }))
        ]
      }
    ],
    temperature: 0.2,
    max_tokens: 3000,
    response_format: { type: "json_object" }
  };

  // 4. 执行 API 调用 (带重试机制)
  const MAX_RETRIES = 3;
  let lastError: any = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 1) {
        aiLogger.info(`Retrying Unified Analysis (Attempt ${attempt}/${MAX_RETRIES})...`);
        // 简单的指数退避
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
      }

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify(requestBody),
        // 增加 Signal 以支持自定义超时 (如 30s)
        signal: AbortSignal.timeout(60000) // 1分钟总超时，防止连接无限挂起
      });

      if (!response.ok) {
        const err = await response.text();

        // 如果是 5xx 错误或 429，应该重试
        if (response.status >= 500 || response.status === 429) {
          throw new Error(`${provider} API Server Error (${response.status}): ${err}`);
        }

        // 4xx 错误通常不重试 (除 429)
        aiLogger.error("Unified Analysis API Client Error", { provider, status: response.status, error: err });
        throw new Error(`${provider} API Client Error: ${err}`);
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content;

      if (!content) {
        throw new Error("Empty response from AI");
      }

      // 解析结果
      const cleanContent = content.replace(/```json\s*|\s*```/g, "").trim();
      return JSON.parse(cleanContent) as UnifiedAnalysisResult;

    } catch (e: any) {
      lastError = e;
      const isNetworkError = e.name === 'AbortError' || e.message.includes('fetch');
      const isServerError = e.message.includes('Server Error');

      console.warn(`[Unified Analysis] Attempt ${attempt} failed: ${e.message}`);

      // 只有网络错误或服务端错误才重试
      if (attempt < MAX_RETRIES && (isNetworkError || isServerError)) {
        continue;
      }

      // 如果不是可重试的错误，或已达最大重试次数，则抛出
      break;
    }
  }

  aiLogger.error("Unified Analysis Failed after retries", { error: lastError });
  throw new Error(`Failed to process unified analysis: ${lastError?.message || "Unknown error"}`);
}

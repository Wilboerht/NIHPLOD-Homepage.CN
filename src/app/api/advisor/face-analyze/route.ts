import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import {
  VISION_ANALYSIS_SYSTEM_PROMPT,
  VISION_ANALYSIS_USER_PROMPT,
} from "@/config/ai-prompts";
import { aiLogger } from "@/lib/logger";
import { getAISettings, getApiKeyForProvider } from "@/lib/ai";
import {
  type FaceAnalysisResult,
  getDefaultFaceAnalysisResult,
} from "@/lib/advisor-utils";

// 重新导出类型供其他模块使用
export type { FaceAnalysisResult };

/**
 * 面部分析请求 Schema
 */
const FaceAnalyzeSchema = z.object({
  image: z.string().min(1, "请提供图片"),
});

// ============================================================================
// 公共工具函数
// ============================================================================

/**
 * Vision API 配置
 */
interface VisionAPIConfig {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl: string;
  headers: Record<string, string>;
  buildRequestBody: (imageBase64: string, model: string) => object;
  extractContent: (data: unknown) => string | null;
}

/**
 * 重试配置
 */
const RETRY_CONFIG = {
  maxRetries: 2,
  retryDelayMs: 1000,
  retryableStatusCodes: [429, 500, 502, 503, 504],
};

/**
 * 延迟函数
 */
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 判断是否应该重试
 */
function shouldRetry(status: number, retryCount: number): boolean {
  return (
    retryCount < RETRY_CONFIG.maxRetries &&
    RETRY_CONFIG.retryableStatusCodes.includes(status)
  );
}

/**
 * 从 AI 响应中提取 JSON
 * 支持多种格式：纯 JSON、markdown 代码块、混合文本
 */
function extractJsonFromResponse(content: string): FaceAnalysisResult {
  // 1. 尝试直接解析（纯 JSON 响应）
  try {
    const trimmed = content.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      return JSON.parse(trimmed) as FaceAnalysisResult;
    }
  } catch {
    // 继续尝试其他方式
  }

  // 2. 尝试提取 markdown 代码块中的 JSON
  const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim()) as FaceAnalysisResult;
    } catch {
      // 继续尝试其他方式
    }
  }

  // 3. 尝试提取最外层的 JSON 对象
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]) as FaceAnalysisResult;
    } catch {
      // JSON 格式无效
    }
  }

  // 4. 无法解析
  throw new Error("AI: Failed to parse AI response as JSON");
}

/**
 * 通用 Vision API 调用函数
 */
async function callVisionAPI(
  config: VisionAPIConfig,
  imageBase64: string
): Promise<FaceAnalysisResult> {
  const startTime = Date.now();
  let lastError: Error | null = null;

  for (let retryCount = 0; retryCount <= RETRY_CONFIG.maxRetries; retryCount++) {
    try {
      if (retryCount > 0) {
        aiLogger.info(`Retrying ${config.provider} API call`, {
          attempt: retryCount + 1,
          maxRetries: RETRY_CONFIG.maxRetries + 1,
        });
        await delay(RETRY_CONFIG.retryDelayMs * retryCount);
      }

      const response = await fetch(config.baseUrl, {
        method: "POST",
        headers: config.headers,
        body: JSON.stringify(config.buildRequestBody(imageBase64, config.model)),
      });

      if (!response.ok) {
        const errorText = await response.text();

        if (shouldRetry(response.status, retryCount)) {
          aiLogger.warn(`${config.provider} API error, will retry`, {
            status: response.status,
            error: errorText.substring(0, 200),
            attempt: retryCount + 1,
          });
          lastError = new Error(`AI: ${config.provider} API error: ${errorText}`);
          continue;
        }

        aiLogger.error(`${config.provider} Vision API error`, {
          status: response.status,
          error: errorText,
          duration: Date.now() - startTime,
        });
        throw new Error(`AI: ${config.provider} API error: ${errorText}`);
      }

      const data = await response.json();
      const content = config.extractContent(data);

      aiLogger.info(`${config.provider} Vision API success`, {
        duration: Date.now() - startTime,
        tokenUsage: (data as { usage?: unknown }).usage,
        retries: retryCount,
      });

      if (!content) {
        throw new Error(`AI: Empty response from ${config.provider}`);
      }

      return extractJsonFromResponse(content);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("AI:")) {
        throw error;
      }
      lastError = error instanceof Error ? error : new Error(String(error));

      if (retryCount < RETRY_CONFIG.maxRetries) {
        aiLogger.warn(`${config.provider} API call failed, will retry`, {
          error: lastError.message,
          attempt: retryCount + 1,
        });
        continue;
      }
    }
  }

  throw lastError || new Error(`AI: ${config.provider} API call failed after retries`);
}

/**
 * POST /api/advisor/face-analyze
 * AI 面部肌肤分析 API
 */
export async function POST(request: NextRequest) {
  try {
    // 速率限制（面部分析更严格：每小时 5 次）
    const ip = getClientIP(request);
    const rateLimitResult = await rateLimit(ip, "face-analyze");

    if (!rateLimitResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "RATE_LIMIT_EXCEEDED",
            message: "分析次数已达上限，请稍后再试",
            retryAfter: Math.ceil((rateLimitResult.reset - Date.now()) / 1000),
          },
        },
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": String(rateLimitResult.limit),
            "X-RateLimit-Remaining": String(rateLimitResult.remaining),
            "X-RateLimit-Reset": String(rateLimitResult.reset),
          },
        }
      );
    }

    // 验证请求
    const body = await request.json();
    const result = FaceAnalyzeSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "请求参数错误",
            details: result.error.flatten().fieldErrors,
          },
        },
        { status: 400 }
      );
    }

    const { image } = result.data;

    // 验证图片格式
    if (!image.startsWith("data:image/")) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_IMAGE",
            message: "请提供有效的图片数据",
          },
        },
        { status: 400 }
      );
    }

    // 调用 AI 视觉模型分析
    const analysis = await analyzeFaceWithAI(image);

    return NextResponse.json({
      success: true,
      data: analysis,
    });
  } catch (error) {
    aiLogger.error("Face analysis error", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack?.split("\n").slice(0, 3).join("\n") : undefined,
    });

    // 判断是否为 AI 服务不可用
    if (error instanceof Error && error.message.includes("AI")) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "AI_SERVICE_UNAVAILABLE",
            message: "AI 服务暂时不可用，请稍后再试",
          },
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: {
          code: "ANALYSIS_FAILED",
          message: "分析失败，请重试",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * 使用 AI 视觉模型分析面部
 */
async function analyzeFaceWithAI(imageBase64: string): Promise<FaceAnalysisResult> {
  // 从数据库获取设置（优先）+ 环境变量（降级）
  const settings = await getAISettings();
  const provider = settings.visionProvider;
  const model = settings.visionModel;
  // 获取自定义视觉系统提示词（如果有）
  const customPrompt = settings.visionSystemPrompt || "";

  // 检查是否启用 AI
  if (process.env.AI_ENABLED !== "true") {
    aiLogger.info("AI disabled, using fallback analysis");
    return getFallbackAnalysis();
  }

  aiLogger.info("Starting face analysis", { provider, model, hasCustomPrompt: !!customPrompt });

  try {
    if (provider === "openai") {
      return await analyzeWithGPT4V(imageBase64, model, customPrompt);
    } else if (provider === "anthropic") {
      return await analyzeWithClaudeVision(imageBase64, model, customPrompt);
    } else if (provider === "qwen") {
      return await analyzeWithQwenVL(imageBase64, model, customPrompt);
    }
  } catch (error) {
    aiLogger.error("AI vision analysis failed, using fallback", {
      provider,
      model,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    // 降级到基础分析
    return getFallbackAnalysis();
  }

  // 默认使用 OpenAI（也传递自定义提示词）
  return analyzeWithGPT4V(imageBase64, model, customPrompt);
}

// ============================================================================
// 各服务商 Vision API 配置工厂
// ============================================================================

/**
 * 创建 OpenAI Vision API 配置
 * @param customSystemPrompt 自定义系统提示词，如果未提供则使用默认值
 */
function createOpenAIConfig(apiKey: string, model: string, customSystemPrompt?: string): VisionAPIConfig {
  const systemPrompt = customSystemPrompt || VISION_ANALYSIS_SYSTEM_PROMPT;

  // 支持通过环境变量配置自定义端点（如代理服务器）
  const baseUrl = process.env.OPENAI_API_URL
    ? `${process.env.OPENAI_API_URL}/chat/completions`
    : "https://api.openai.com/v1/chat/completions";

  return {
    provider: "OpenAI",
    model,
    apiKey,
    baseUrl,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    buildRequestBody: (imageBase64: string, useModel: string) => ({
      model: useModel,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: VISION_ANALYSIS_USER_PROMPT },
            { type: "image_url", image_url: { url: imageBase64, detail: "high" } },
          ],
        },
      ],
      max_tokens: 1500,
      temperature: 0.3,
    }),
    extractContent: (data: unknown) => {
      const d = data as { choices?: { message?: { content?: string } }[] };
      return d.choices?.[0]?.message?.content || null;
    },
  };
}

/**
 * 创建 Anthropic Vision API 配置
 * @param customSystemPrompt 自定义系统提示词，如果未提供则使用默认值
 */
function createAnthropicConfig(apiKey: string, model: string, imageBase64: string, customSystemPrompt?: string): VisionAPIConfig {
  const systemPrompt = customSystemPrompt || VISION_ANALYSIS_SYSTEM_PROMPT;

  // 提取 base64 数据和媒体类型
  const matches = imageBase64.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) {
    throw new Error("AI: Invalid image format");
  }
  const [, mediaType, base64Data] = matches;

  // 支持通过环境变量配置自定义端点（如代理服务器）
  const baseUrl = process.env.ANTHROPIC_API_URL || "https://api.anthropic.com/v1/messages";

  return {
    provider: "Anthropic",
    model,
    apiKey,
    baseUrl,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    buildRequestBody: (_: string, useModel: string) => ({
      model: useModel,
      max_tokens: 1500,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: base64Data },
            },
            { type: "text", text: systemPrompt + "\n\n" + VISION_ANALYSIS_USER_PROMPT },
          ],
        },
      ],
    }),
    extractContent: (data: unknown) => {
      const d = data as { content?: { text?: string }[] };
      return d.content?.[0]?.text || null;
    },
  };
}

/**
 * 创建通义千问 VL API 配置
 * @param customSystemPrompt 自定义系统提示词，如果未提供则使用默认值
 */
function createQwenConfig(apiKey: string, model: string, customSystemPrompt?: string): VisionAPIConfig {
  const baseUrl = process.env.QWEN_API_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1";
  const systemPrompt = customSystemPrompt || VISION_ANALYSIS_SYSTEM_PROMPT;

  return {
    provider: "Qwen",
    model,
    apiKey,
    baseUrl: `${baseUrl}/chat/completions`,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    buildRequestBody: (imageBase64: string, useModel: string) => ({
      model: useModel,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: VISION_ANALYSIS_USER_PROMPT },
            { type: "image_url", image_url: { url: imageBase64 } },
          ],
        },
      ],
      max_tokens: 1500,
      temperature: 0.3,
    }),
    extractContent: (data: unknown) => {
      const d = data as { choices?: { message?: { content?: string } }[] };
      return d.choices?.[0]?.message?.content || null;
    },
  };
}

// ============================================================================
// 各服务商分析函数（使用统一的 callVisionAPI）
// ============================================================================

/**
 * 使用 GPT-4 Vision 分析
 * @param customSystemPrompt 自定义系统提示词
 */
async function analyzeWithGPT4V(imageBase64: string, model?: string, customSystemPrompt?: string): Promise<FaceAnalysisResult> {
  const apiKey = getApiKeyForProvider("openai");
  if (!apiKey) {
    throw new Error("AI: OpenAI API key not configured");
  }

  const config = createOpenAIConfig(apiKey, model || "gpt-4o", customSystemPrompt);
  return callVisionAPI(config, imageBase64);
}

/**
 * 使用 Claude Vision 分析
 * @param customSystemPrompt 自定义系统提示词
 */
async function analyzeWithClaudeVision(imageBase64: string, model?: string, customSystemPrompt?: string): Promise<FaceAnalysisResult> {
  const apiKey = getApiKeyForProvider("anthropic");
  if (!apiKey) {
    throw new Error("AI: Anthropic API key not configured");
  }

  const config = createAnthropicConfig(apiKey, model || "claude-sonnet-4-20250514", imageBase64, customSystemPrompt);
  return callVisionAPI(config, imageBase64);
}

/**
 * 使用通义千问 VL 分析
 * @param customSystemPrompt 自定义系统提示词
 */
async function analyzeWithQwenVL(imageBase64: string, modelOverride?: string, customSystemPrompt?: string): Promise<FaceAnalysisResult> {
  const apiKey = getApiKeyForProvider("qwen");
  if (!apiKey) {
    throw new Error("AI: 通义千问 API key not configured");
  }

  const model = modelOverride || process.env.QWEN_VL_MODEL || "qwen-vl-max";
  aiLogger.info("Calling Qwen VL API", { model });

  const config = createQwenConfig(apiKey, model, customSystemPrompt);
  return callVisionAPI(config, imageBase64);
}

/**
 * 降级方案：基础分析
 * 当 AI 服务不可用时返回通用建议
 */
function getFallbackAnalysis(): FaceAnalysisResult {
  return getDefaultFaceAnalysisResult();
}


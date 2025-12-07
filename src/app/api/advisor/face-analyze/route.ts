import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import {
  VISION_ANALYSIS_SYSTEM_PROMPT,
  VISION_ANALYSIS_USER_PROMPT,
  CLAUDE_VISION_PROMPT,
} from "@/config/ai-prompts";
import { aiLogger } from "@/lib/logger";
import { getAISettings, getApiKeyForProvider } from "@/lib/ai";

/**
 * 面部分析请求 Schema
 */
const FaceAnalyzeSchema = z.object({
  image: z.string().min(1, "请提供图片"),
});

/**
 * 肤质类型
 */
type SkinType = "dry" | "oily" | "combination" | "normal" | "sensitive";

/**
 * 严重程度
 */
type Severity = "mild" | "moderate" | "severe";

/**
 * 水分等级
 */
type HydrationLevel = "low" | "medium" | "high";

/**
 * 面部分析结果类型
 */
export interface FaceAnalysisResult {
  skinType: {
    type: SkinType;
    confidence: number;
    description: string;
  };
  skinConditions: {
    condition: string;
    severity: Severity;
    area: string;
    description: string;
  }[];
  skinAge: {
    estimated: number;
    factors: string[];
  };
  hydration: {
    level: HydrationLevel;
    description: string;
  };
  recommendations: string[];
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

  // 检查是否启用 AI
  if (process.env.AI_ENABLED !== "true") {
    aiLogger.info("AI disabled, using fallback analysis");
    return getFallbackAnalysis();
  }

  aiLogger.info("Starting face analysis", { provider, model });

  try {
    if (provider === "openai") {
      return await analyzeWithGPT4V(imageBase64, model);
    } else if (provider === "anthropic") {
      return await analyzeWithClaudeVision(imageBase64, model);
    } else if (provider === "qwen") {
      return await analyzeWithQwenVL(imageBase64, model);
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

  // 默认使用 OpenAI
  return analyzeWithGPT4V(imageBase64);
}

/**
 * 使用 GPT-4 Vision 分析
 */
async function analyzeWithGPT4V(imageBase64: string, model?: string): Promise<FaceAnalysisResult> {
  const apiKey = getApiKeyForProvider("openai");
  const useModel = model || "gpt-4o";
  const startTime = Date.now();

  if (!apiKey) {
    throw new Error("AI: OpenAI API key not configured");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: useModel,
      messages: [
        {
          role: "system",
          content: VISION_ANALYSIS_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: VISION_ANALYSIS_USER_PROMPT,
            },
            {
              type: "image_url",
              image_url: {
                url: imageBase64,
                detail: "high",
              },
            },
          ],
        },
      ],
      max_tokens: 1500,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    aiLogger.error("OpenAI Vision API error", {
      status: response.status,
      error,
      duration: Date.now() - startTime,
    });
    throw new Error(`AI: OpenAI API error: ${error}`);
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content;

  aiLogger.info("OpenAI Vision API success", {
    duration: Date.now() - startTime,
    tokenUsage: data.usage,
  });

  if (!content) {
    throw new Error("AI: Empty response from OpenAI");
  }

  // 解析 JSON 响应
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    aiLogger.error("Failed to parse AI response", { content: content.substring(0, 200) });
    throw new Error("AI: Failed to parse AI response as JSON");
  }

  try {
    return JSON.parse(jsonMatch[0]) as FaceAnalysisResult;
  } catch {
    throw new Error("AI: Invalid JSON in AI response");
  }
}

/**
 * 使用 Claude Vision 分析
 */
async function analyzeWithClaudeVision(imageBase64: string, model?: string): Promise<FaceAnalysisResult> {
  const apiKey = getApiKeyForProvider("anthropic");
  const useModel = model || "claude-sonnet-4-20250514";
  const startTime = Date.now();

  if (!apiKey) {
    throw new Error("AI: Anthropic API key not configured");
  }

  // 提取 base64 数据和媒体类型
  const matches = imageBase64.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) {
    throw new Error("AI: Invalid image format");
  }

  const [, mediaType, base64Data] = matches;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: useModel,
      max_tokens: 1500,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType,
                data: base64Data,
              },
            },
            {
              type: "text",
              text: CLAUDE_VISION_PROMPT,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    aiLogger.error("Anthropic Vision API error", {
      status: response.status,
      error,
      duration: Date.now() - startTime,
    });
    throw new Error(`AI: Anthropic API error: ${error}`);
  }

  const data = await response.json();
  const content = data.content[0]?.text;

  aiLogger.info("Anthropic Vision API success", {
    duration: Date.now() - startTime,
    tokenUsage: data.usage,
  });

  if (!content) {
    throw new Error("AI: Empty response from Anthropic");
  }

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    aiLogger.error("Failed to parse Claude response", { content: content.substring(0, 200) });
    throw new Error("AI: Failed to parse AI response as JSON");
  }

  return JSON.parse(jsonMatch[0]) as FaceAnalysisResult;
}

/**
 * 使用通义千问 VL（视觉语言模型）分析
 * 文档: https://help.aliyun.com/zh/model-studio/developer-reference/qwen-vl-api
 */
async function analyzeWithQwenVL(imageBase64: string, modelOverride?: string): Promise<FaceAnalysisResult> {
  const apiKey = getApiKeyForProvider("qwen");
  const startTime = Date.now();
  const model = modelOverride || process.env.QWEN_VL_MODEL || "qwen-vl-max";
  const baseUrl = process.env.QWEN_API_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1";

  if (!apiKey) {
    throw new Error("AI: 通义千问 API key not configured");
  }

  aiLogger.info("Calling Qwen VL API", { model, baseUrl });

  // 通义千问 VL 使用 OpenAI 兼容模式
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model,
      messages: [
        {
          role: "system",
          content: VISION_ANALYSIS_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: VISION_ANALYSIS_USER_PROMPT,
            },
            {
              type: "image_url",
              image_url: {
                url: imageBase64,
              },
            },
          ],
        },
      ],
      max_tokens: 1500,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    aiLogger.error("Qwen VL API error", {
      status: response.status,
      error,
      duration: Date.now() - startTime,
    });
    throw new Error(`AI: 通义千问 API error: ${error}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  aiLogger.info("Qwen VL API success", {
    duration: Date.now() - startTime,
    tokenUsage: data.usage,
  });

  if (!content) {
    throw new Error("AI: Empty response from 通义千问");
  }

  // 解析 JSON 响应
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    aiLogger.error("Failed to parse Qwen VL response", { content: content.substring(0, 200) });
    throw new Error("AI: Failed to parse AI response as JSON");
  }

  try {
    return JSON.parse(jsonMatch[0]) as FaceAnalysisResult;
  } catch {
    throw new Error("AI: Invalid JSON in 通义千问 response");
  }
}

/**
 * 降级方案：基础分析
 * 当 AI 服务不可用时返回通用建议
 */
function getFallbackAnalysis(): FaceAnalysisResult {
  return {
    skinType: {
      type: "combination",
      confidence: 0.5,
      description: "由于技术原因，无法精确判断您的肤质类型。建议结合您的日常感受来判断。",
    },
    skinConditions: [],
    skinAge: {
      estimated: 0,
      factors: ["无法通过照片准确评估"],
    },
    hydration: {
      level: "medium",
      description: "建议日常保持良好的补水习惯",
    },
    recommendations: [
      "建议早晚使用温和的洁面产品清洁肌肤",
      "保持每日饮水量在 2000ml 以上",
      "根据季节调整护肤品的滋润度",
      "建议到专业机构进行详细的肌肤检测",
    ],
  };
}


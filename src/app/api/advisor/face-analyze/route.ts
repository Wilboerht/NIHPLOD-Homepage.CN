import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import {
  VISION_ANALYSIS_SYSTEM_PROMPT,
  VISION_ANALYSIS_USER_PROMPT,
  CLAUDE_VISION_PROMPT,
  QWEN_VISION_PROMPT,
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
 * 面部分析请求 Schema - 支持多张照片
 */
const FaceAnalyzeSchema = z.object({
  // 新格式：多张照片
  images: z.object({
    front: z.string().optional(),
    left: z.string().optional(),
    right: z.string().optional(),
    chin: z.string().optional(),
  }).optional(),
  // 兼容旧格式：单张照片
  image: z.string().optional(),
}).refine(
  (data) => data.images?.front || data.image,
  { message: "请提供至少一张照片" }
);

// ============================================================================
// 公共工具函数
// ============================================================================

/**
 * 图片信息类型（用于 API 配置）
 */
interface ImageInfoForConfig {
  angle: string;
  data: string;
}

/**
 * Vision API 配置
 */
interface VisionAPIConfig {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl: string;
  headers: Record<string, string>;
  buildRequestBody: (images: ImageInfoForConfig[], model: string) => object;
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
 * 修复常见的 JSON 格式问题
 */
function fixJsonString(jsonStr: string): string {
  let fixed = jsonStr;

  // 1. 移除 trailing commas（对象和数组末尾的逗号）
  fixed = fixed.replace(/,(\s*[}\]])/g, '$1');

  // 2. 修复未转义的换行符（在字符串值中）
  // 这个比较复杂，暂时跳过

  // 3. 移除可能的 BOM 或其他不可见字符
  fixed = fixed.replace(/^\uFEFF/, '');

  return fixed;
}

/**
 * 从 AI 响应中提取 JSON
 * 支持多种格式：纯 JSON、markdown 代码块、混合文本
 * 增强了错误恢复能力
 */
function extractJsonFromResponse(content: string): FaceAnalysisResult {
  // 调试：打印原始内容长度和前100字符
  console.log("[Face Analyze] Extracting JSON from response, length:", content.length);

  // 1. 尝试直接解析（纯 JSON 响应）
  try {
    const trimmed = content.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      return JSON.parse(trimmed) as FaceAnalysisResult;
    }
  } catch (e) {
    console.log("[Face Analyze] Direct parse failed:", (e as Error).message);
  }

  // 2. 尝试提取 markdown 代码块中的 JSON
  const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      const jsonContent = codeBlockMatch[1].trim();
      return JSON.parse(jsonContent) as FaceAnalysisResult;
    } catch (e) {
      // 尝试修复后再解析
      try {
        const fixed = fixJsonString(codeBlockMatch[1].trim());
        return JSON.parse(fixed) as FaceAnalysisResult;
      } catch {
        console.log("[Face Analyze] Code block parse failed:", (e as Error).message);
      }
    }
  }

  // 3. 尝试提取最外层的 JSON 对象（使用贪婪匹配）
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]) as FaceAnalysisResult;
    } catch (e) {
      // 尝试修复后再解析
      try {
        const fixed = fixJsonString(jsonMatch[0]);
        return JSON.parse(fixed) as FaceAnalysisResult;
      } catch {
        console.log("[Face Analyze] JSON object parse failed:", (e as Error).message);
        console.log("[Face Analyze] Problematic JSON (first 500 chars):", jsonMatch[0].substring(0, 500));
      }
    }
  }

  // 4. 尝试查找嵌套的 JSON（有时 AI 会返回多个 JSON 对象）
  // 寻找包含 "validation" 或 "skinType" 的 JSON 对象
  const nestedJsonMatch = content.match(/\{[^{}]*(?:"validation"|"skinType")[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/);
  if (nestedJsonMatch) {
    try {
      return JSON.parse(nestedJsonMatch[0]) as FaceAnalysisResult;
    } catch {
      // 继续
    }
  }

  // 5. 无法解析 - 打印更多调试信息
  console.log("[Face Analyze] Failed to parse JSON. Raw content preview:");
  console.log(content.substring(0, 800));
  throw new Error("AI: Failed to parse AI response as JSON");
}

/**
 * 通用 Vision API 调用函数 - 支持多张照片
 */
async function callVisionAPI(
  config: VisionAPIConfig,
  images: ImageInfoForConfig[]
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
        body: JSON.stringify(config.buildRequestBody(images, config.model)),
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

      // 调试：打印 AI 返回的原始内容
      console.log("[Face Analyze] AI Raw Response (first 1000 chars):", content.substring(0, 1000));

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

    const { images, image } = result.data;

    // 收集所有有效的照片
    const validImages: { angle: string; data: string }[] = [];

    if (images) {
      // 新格式：多张照片
      if (images.front && images.front.startsWith("data:image/")) {
        validImages.push({ angle: "正脸", data: images.front });
      }
      if (images.left && images.left.startsWith("data:image/")) {
        validImages.push({ angle: "左侧", data: images.left });
      }
      if (images.right && images.right.startsWith("data:image/")) {
        validImages.push({ angle: "右侧", data: images.right });
      }
      if (images.chin && images.chin.startsWith("data:image/")) {
        validImages.push({ angle: "下颚", data: images.chin });
      }
    } else if (image && image.startsWith("data:image/")) {
      // 兼容旧格式：单张照片
      validImages.push({ angle: "正脸", data: image });
    }

    if (validImages.length === 0) {
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

    console.log(`[Face Analyze] Processing ${validImages.length} images: ${validImages.map(i => i.angle).join(", ")}`);

    // 调用 AI 视觉模型分析（传入所有照片）
    const analysis = await analyzeFaceWithAI(validImages);

    // 调试日志：打印 AI 返回的原始数据
    console.log("[Face Analyze] AI Analysis Result:", JSON.stringify({
      validation: analysis.validation,
      skinType: analysis.skinType,
      skinAge: analysis.skinAge,
      hydration: analysis.hydration,
      skinConditionsCount: analysis.skinConditions?.length || 0,
      imagesAnalyzed: validImages.length,
    }, null, 2));

    // 检查 AI 是否验证通过
    // 如果 validation.isValid 为 false，说明图片不是有效的人脸（可能是动物、翻拍、视频帧等）
    if (analysis.validation && analysis.validation.isValid === false) {
      aiLogger.warn("Face validation failed", {
        status: analysis.validation.status,
        message: analysis.validation.message,
      });

      return NextResponse.json({
        success: false,
        error: {
          code: "VALIDATION_FAILED",
          status: analysis.validation.status,
          message: analysis.validation.message || "图片验证失败，请上传真人面部照片",
        },
      }, { status: 400 });
    }

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
 * 图片信息类型
 */
interface ImageInfo {
  angle: string;
  data: string;
}

/**
 * 使用 AI 视觉模型分析面部 - 支持多张照片
 */
async function analyzeFaceWithAI(images: ImageInfo[]): Promise<FaceAnalysisResult> {
  // 从数据库获取设置（优先）+ 环境变量（降级）
  const settings = await getAISettings();
  const provider = settings.visionProvider;
  const model = settings.visionModel;
  // 获取自定义视觉系统提示词（如果有非空值）
  // 注意：只有当数据库中有实际内容时才使用，空字符串会使用代码中的默认提示词
  const customPrompt = settings.visionSystemPrompt?.trim() || "";

  // 调试：打印提示词来源
  console.log("[Face Analyze] Prompt source:", customPrompt ? "DATABASE (custom)" : "CODE (default VISION_ANALYSIS_SYSTEM_PROMPT)");
  console.log("[Face Analyze] Images count:", images.length);
  if (customPrompt) {
    console.log("[Face Analyze] Custom prompt length:", customPrompt.length);
  }

  // 检查是否启用 AI
  if (process.env.AI_ENABLED !== "true") {
    aiLogger.info("AI disabled, using fallback analysis");
    return getFallbackAnalysis();
  }

  aiLogger.info("Starting face analysis", {
    provider,
    model,
    hasCustomPrompt: !!customPrompt,
    imageCount: images.length,
  });

  try {
    if (provider === "openai") {
      return await analyzeWithGPT4V(images, model, customPrompt);
    } else if (provider === "anthropic") {
      return await analyzeWithClaudeVision(images, model, customPrompt);
    } else if (provider === "qwen") {
      return await analyzeWithQwenVL(images, model, customPrompt);
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
  return analyzeWithGPT4V(images, model, customPrompt);
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
    buildRequestBody: (images: ImageInfoForConfig[], useModel: string) => {
      // 构建包含所有图片的内容数组
      const imageContents = images.map((img) => ({
        type: "image_url" as const,
        image_url: { url: img.data, detail: "high" as const },
      }));

      // 构建用户提示词，说明每张图片的角度
      const imageDescription = images.length > 1
        ? `\n\n我提供了${images.length}张照片，分别是：${images.map(img => img.angle).join("、")}。请综合分析所有照片。`
        : "";

      return {
        model: useModel,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: VISION_ANALYSIS_USER_PROMPT + imageDescription },
              ...imageContents,
            ],
          },
        ],
        max_tokens: 1500,
        temperature: 0.3,
      };
    },
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
function createAnthropicConfig(apiKey: string, model: string, customSystemPrompt?: string): VisionAPIConfig {
  // Claude 使用专门优化的简洁提示词（因为要放在 user message 中）
  const systemPrompt = customSystemPrompt || CLAUDE_VISION_PROMPT;

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
    buildRequestBody: (images: ImageInfoForConfig[], useModel: string) => {
      // 构建所有图片的内容
      const imageContents = images.map((img) => {
        const matches = img.data.match(/^data:([^;]+);base64,(.+)$/);
        if (!matches) {
          throw new Error("AI: Invalid image format");
        }
        const [, mediaType, base64Data] = matches;
        return {
          type: "image" as const,
          source: { type: "base64" as const, media_type: mediaType, data: base64Data },
        };
      });

      // 构建用户提示词
      const imageDescription = images.length > 1
        ? `\n\n我提供了${images.length}张照片，分别是：${images.map(img => img.angle).join("、")}。请综合分析所有照片。`
        : "";

      return {
        model: useModel,
        max_tokens: 1500,
        messages: [
          {
            role: "user",
            content: [
              ...imageContents,
              { type: "text", text: systemPrompt + "\n\n" + VISION_ANALYSIS_USER_PROMPT + imageDescription },
            ],
          },
        ],
      };
    },
    extractContent: (data: unknown) => {
      const d = data as { content?: { text?: string }[] };
      return d.content?.[0]?.text || null;
    },
  };
}

/**
 * 创建通义千问 VL API 配置
 * @param customSystemPrompt 自定义系统提示词，如果未提供则使用通义专用提示词
 */
function createQwenConfig(apiKey: string, model: string, customSystemPrompt?: string): VisionAPIConfig {
  const baseUrl = process.env.QWEN_API_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1";
  // 通义千问使用专门优化的中文提示词
  const systemPrompt = customSystemPrompt || QWEN_VISION_PROMPT;

  return {
    provider: "Qwen",
    model,
    apiKey,
    baseUrl: `${baseUrl}/chat/completions`,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    buildRequestBody: (images: ImageInfoForConfig[], useModel: string) => {
      // 构建所有图片的内容
      const imageContents = images.map((img) => ({
        type: "image_url" as const,
        image_url: { url: img.data },
      }));

      // 构建用户提示词
      const imageDescription = images.length > 1
        ? `\n\n我提供了${images.length}张照片，分别是：${images.map(img => img.angle).join("、")}。请综合分析所有照片。`
        : "";

      return {
        model: useModel,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: VISION_ANALYSIS_USER_PROMPT + imageDescription },
              ...imageContents,
            ],
          },
        ],
        max_tokens: 2500, // 增加 token 限制以支持完整的 8 维度分析
        temperature: 0.2, // 降低温度以提高输出稳定性
      };
    },
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
 * @param images 多张照片信息
 * @param customSystemPrompt 自定义系统提示词
 */
async function analyzeWithGPT4V(images: ImageInfo[], model?: string, customSystemPrompt?: string): Promise<FaceAnalysisResult> {
  const apiKey = getApiKeyForProvider("openai");
  if (!apiKey) {
    throw new Error("AI: OpenAI API key not configured");
  }

  const config = createOpenAIConfig(apiKey, model || "gpt-4o", customSystemPrompt);
  return callVisionAPI(config, images);
}

/**
 * 使用 Claude Vision 分析
 * @param images 多张照片信息
 * @param customSystemPrompt 自定义系统提示词
 */
async function analyzeWithClaudeVision(images: ImageInfo[], model?: string, customSystemPrompt?: string): Promise<FaceAnalysisResult> {
  const apiKey = getApiKeyForProvider("anthropic");
  if (!apiKey) {
    throw new Error("AI: Anthropic API key not configured");
  }

  const config = createAnthropicConfig(apiKey, model || "claude-sonnet-4-20250514", customSystemPrompt);
  return callVisionAPI(config, images);
}

/**
 * 使用通义千问 VL 分析
 * @param images 多张照片信息
 * @param customSystemPrompt 自定义系统提示词
 */
async function analyzeWithQwenVL(images: ImageInfo[], modelOverride?: string, customSystemPrompt?: string): Promise<FaceAnalysisResult> {
  const apiKey = getApiKeyForProvider("qwen");
  if (!apiKey) {
    throw new Error("AI: 通义千问 API key not configured");
  }

  const model = modelOverride || process.env.QWEN_VL_MODEL || "qwen-vl-max";
  aiLogger.info("Calling Qwen VL API", { model, imageCount: images.length });

  const config = createQwenConfig(apiKey, model, customSystemPrompt);
  return callVisionAPI(config, images);
}

/**
 * 降级方案：基础分析
 * 当 AI 服务不可用时返回通用建议
 */
function getFallbackAnalysis(): FaceAnalysisResult {
  return getDefaultFaceAnalysisResult();
}


import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit, getClientIP } from "@/lib/ratelimit";

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
    console.error("Face analysis error:", error);

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
  const provider = process.env.AI_VISION_PROVIDER || "openai";

  // 检查是否启用 AI
  if (process.env.AI_ENABLED !== "true") {
    console.log("AI disabled, using fallback analysis");
    return getFallbackAnalysis();
  }

  try {
    if (provider === "openai") {
      return await analyzeWithGPT4V(imageBase64);
    } else if (provider === "anthropic") {
      return await analyzeWithClaudeVision(imageBase64);
    }
  } catch (error) {
    console.error(`AI analysis failed with ${provider}:`, error);
    // 降级到基础分析
    return getFallbackAnalysis();
  }

  // 默认使用 OpenAI
  return analyzeWithGPT4V(imageBase64);
}

/**
 * 使用 GPT-4 Vision 分析
 */
async function analyzeWithGPT4V(imageBase64: string): Promise<FaceAnalysisResult> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("AI: OpenAI API key not configured");
  }

  const systemPrompt = `你是一位专业的皮肤科医生和护肤专家。请分析用户提供的面部照片，识别肌肤类型、问题和状态。

请严格按以下 JSON 格式返回分析结果：
{
  "skinType": {
    "type": "dry|oily|combination|normal|sensitive",
    "confidence": 0.0-1.0,
    "description": "肤质描述"
  },
  "skinConditions": [
    {
      "condition": "问题名称",
      "severity": "mild|moderate|severe",
      "area": "问题区域",
      "description": "详细描述"
    }
  ],
  "skinAge": {
    "estimated": 年龄数字,
    "factors": ["影响因素1", "影响因素2"]
  },
  "hydration": {
    "level": "low|medium|high",
    "description": "水分状态描述"
  },
  "recommendations": ["建议1", "建议2", "建议3"]
}

注意：
1. 分析要专业、客观、温和
2. 不要诊断严重皮肤疾病，如有疑虑建议就医
3. 推荐要具体可执行
4. 只返回 JSON，不要其他文字`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "请分析这张面部照片的肌肤状态",
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
      temperature: 0.3, // 降低随机性，提高一致性
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`AI: OpenAI API error: ${error}`);
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content;

  if (!content) {
    throw new Error("AI: Empty response from OpenAI");
  }

  // 解析 JSON 响应
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
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
async function analyzeWithClaudeVision(imageBase64: string): Promise<FaceAnalysisResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

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
      model: "claude-sonnet-4-20250514",
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
              text: `你是一位专业的皮肤科医生和护肤专家。请分析这张面部照片的肌肤状态。

请严格按以下 JSON 格式返回（只返回 JSON）：
{
  "skinType": { "type": "dry|oily|combination|normal|sensitive", "confidence": 0.0-1.0, "description": "描述" },
  "skinConditions": [{ "condition": "问题", "severity": "mild|moderate|severe", "area": "区域", "description": "描述" }],
  "skinAge": { "estimated": 数字, "factors": ["因素"] },
  "hydration": { "level": "low|medium|high", "description": "描述" },
  "recommendations": ["建议1", "建议2"]
}`,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`AI: Anthropic API error: ${error}`);
  }

  const data = await response.json();
  const content = data.content[0]?.text;

  if (!content) {
    throw new Error("AI: Empty response from Anthropic");
  }

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("AI: Failed to parse AI response as JSON");
  }

  return JSON.parse(jsonMatch[0]) as FaceAnalysisResult;
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


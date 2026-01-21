import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import { UNIFIED_ANALYSIS_SYSTEM_PROMPT } from "@/config/ai-prompts";
import { getAISettings, getApiKeysForProvider } from "@/lib/ai";
import { aiLogger } from "@/lib/logger";
import { aiQueue } from "@/lib/ai-queue";

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  faceAnalysis: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  comprehensiveResult: any;
}

/**
 * POST /api/advisor/comprehensive
 * 统一分析 API - 整合视觉分析和综合建议
 * 
 * 功能：
 * - 整合视觉分析和综合建议，速度提升 40-50%
 * - 支持 AI 请求队列，高峰期有序处理
 * - 响应头包含排队信息：X-Queue-Position, X-Queue-Wait-Seconds
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { answers, images } = result.data as { answers: any; images: any };

    // 收集有效图片（支持 Base64 和 URL）
    const validImages: { angle: string; data: string }[] = [];
    const ossUrlsToDelete: string[] = [];

    const addImage = (angle: string, data?: string) => {
      if (!data) return;
      if (data.startsWith("data:image/") || data.startsWith("http")) {
        validImages.push({ angle, data });
        if (data.startsWith("http") && data.includes("aliyuncs.com")) {
          ossUrlsToDelete.push(data);
        }
      }
    };

    addImage("正脸", images.front);
    addImage("左侧", images.left);
    addImage("右侧", images.right);

    if (validImages.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: "NO_IMAGES", message: "请提供至少一张有效的面部照片" } },
        { status: 400 }
      );
    }

    // 3. 构建 Prompt
    const userPrompt = buildUserPrompt(answers, validImages);

    // 4. 将请求加入队列
    const queueResult = aiQueue.enqueue("comprehensive-analyze", async () => {
      try {
        const result = await callUnifiedAI(validImages, userPrompt);
        return result;
      } finally {
        // 分析完成后（无论成功失败），立即触发删除 OSS 隐私文件
        if (ossUrlsToDelete.length > 0) {
          // 异步删除，不阻塞返回
          import("@/lib/ali-oss").then(({ deleteOSSFiles }) => {
            deleteOSSFiles(ossUrlsToDelete).catch(e => console.error("OSS cleanup failed:", e));
          });
        }
      }
    });

    // 记录初始排队位置
    const initialPosition = queueResult.position;
    const initialWaitSeconds = queueResult.estimatedWaitSeconds;

    aiLogger.info("Comprehensive analysis queued", {
      requestId: queueResult.requestId,
      position: initialPosition,
      estimatedWaitSeconds: initialWaitSeconds,
    });

    // 5. 等待结果
    const aiResult = await queueResult.promise;

    // 6. 返回结果，附带队列信息
    return NextResponse.json(
      {
        success: true,
        data: aiResult,
        queue: {
          requestId: queueResult.requestId,
          initialPosition,
          initialWaitSeconds,
        },
      },
      {
        headers: {
          "X-Queue-Position": String(initialPosition),
          "X-Queue-Wait-Seconds": String(initialWaitSeconds),
        },
      }
    );

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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
 * 调用 AI（支持多 Key 轮询）
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
  const apiKeys = getApiKeysForProvider(provider);

  if (apiKeys.length === 0) {
    aiLogger.error("Unified Analysis: API Key missing", { provider });
    throw new Error(`AI API Key not configured for provider: ${provider}`);
  }

  aiLogger.info("Starting Unified Analysis", { provider, model, imageCount: images.length, keyCount: apiKeys.length });

  // 2. 确定 Base URL
  let baseUrl = "https://api.openai.com/v1";
  if (provider === "qwen") {
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
            image_url: { url: img.data }
          }))
        ]
      }
    ],
    temperature: 0.2,
    max_tokens: 3000,
    response_format: { type: "json_object" }
  };

  // 4. 执行 API 调用 - 支持多 Key 轮询
  let lastError: unknown = null;

  // 遍历所有可用的 Keys
  for (let keyIndex = 0; keyIndex < apiKeys.length; keyIndex++) {
    const apiKey = apiKeys[keyIndex];
    const MAX_RETRIES = 2; // 每个 Key 最多重试 2 次

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (keyIndex > 0 || attempt > 1) {
          aiLogger.info(`Unified Analysis: Key ${keyIndex + 1}/${apiKeys.length}, Attempt ${attempt}/${MAX_RETRIES}`);
          await new Promise(r => setTimeout(r, 1000 * attempt));
        }

        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
          },
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(60000)
        });

        if (!response.ok) {
          const err = await response.text();
          const errorLower = err.toLowerCase();

          // 检查是否可以切换 Key 的错误
          const isKeyError = response.status === 401 ||
            response.status === 429 ||
            errorLower.includes("quota") ||
            errorLower.includes("rate limit") ||
            errorLower.includes("unauthorized");

          if (isKeyError && keyIndex < apiKeys.length - 1) {
            aiLogger.warn(`Key ${keyIndex + 1} failed, switching to next key`, { status: response.status });
            break; // 跳出 attempt 循环，进入下一个 key
          }

          // 服务端错误可以重试
          if (response.status >= 500 || response.status === 429) {
            throw new Error(`${provider} API Server Error (${response.status}): ${err}`);
          }

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

      } catch (e) {
        lastError = e;
        const errorMessage = e instanceof Error ? e.message : String(e);
        const isNetworkError = e instanceof Error && (e.name === 'AbortError' || errorMessage.includes('fetch'));
        const isServerError = errorMessage.includes('Server Error');

        console.warn(`[Unified Analysis] Key ${keyIndex + 1}, Attempt ${attempt} failed: ${errorMessage}`);

        // 网络错误或服务端错误可以重试
        if (attempt < MAX_RETRIES && (isNetworkError || isServerError)) {
          continue;
        }

        // 如果是 Key 相关的错误，尝试下一个 Key
        const isKeyRelated = errorMessage.includes("429") ||
          errorMessage.includes("401") ||
          errorMessage.includes("quota") ||
          errorMessage.includes("rate");
        if (isKeyRelated && keyIndex < apiKeys.length - 1) {
          break; // 进入下一个 key
        }

        // 其他错误直接抛出
        if (!isNetworkError && !isServerError) {
          throw e;
        }
      }
    }
  }

  aiLogger.error("Unified Analysis Failed after all keys and retries", { error: lastError });
  const finalErrorMessage = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Failed to process unified analysis: ${finalErrorMessage || "Unknown error"}`);
}


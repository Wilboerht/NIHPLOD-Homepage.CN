import { NextRequest, NextResponse } from "next/server";
import { AnalyzeRequestSchema } from "@/schemas/advisor";
import { analyzeWithAI, fallbackAnalysis } from "@/lib/ai";
import { rateLimit, getClientIP } from "@/lib/ratelimit";

/**
 * POST /api/advisor/analyze
 * AI 护肤分析 API
 * 
 * 整合问卷数据和面部分析数据，生成综合护肤建议
 */
export async function POST(request: NextRequest) {
  try {
    // 速率限制
    const ip = getClientIP(request);
    const rateLimitResult = await rateLimit(ip, "advisor");

    if (!rateLimitResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "RATE_LIMIT_EXCEEDED",
            message: "请求过于频繁，请稍后再试",
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

    // 解析请求体
    const body = await request.json();

    // 验证请求数据
    const result = AnalyzeRequestSchema.safeParse(body);
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

    const { answers, faceAnalysis } = result.data;

    // 尝试 AI 分析
    if (process.env.AI_ENABLED === "true") {
      try {
        const aiResult = await analyzeWithAI(answers, faceAnalysis);
        return NextResponse.json({
          success: true,
          source: "ai",
          data: aiResult,
        });
      } catch (error) {
        console.error("AI 分析失败，使用降级方案:", error);
        // 继续使用降级方案
      }
    }

    // 降级：规则匹配分析
    const fallbackResult = await fallbackAnalysis(answers, faceAnalysis);

    return NextResponse.json({
      success: true,
      source: "fallback",
      notice: "当前为智能推荐模式",
      data: fallbackResult,
    });
  } catch (error) {
    console.error("分析 API 错误:", error);

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


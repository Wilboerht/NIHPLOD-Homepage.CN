import { NextRequest, NextResponse } from "next/server";
import { AnalyzeRequestSchema } from "@/schemas/advisor";
import { analyzeWithAI, fallbackAnalysis } from "@/lib/ai";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import { resolveIPLocation } from "@/lib/geoip";

/**
 * POST /api/advisor/analyze
 * AI 护肤分析 API
 * 
 * 整合问卷数据和面部分析数据，生成综合护肤建议
 */
// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

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
      console.error("[Analyze API] Validation error:", {
        body: JSON.stringify(body),
        errors: result.error.flatten(),
      });
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
    // 将 null 转换为 undefined（函数签名使用 optional）
    const faceAnalysisData = faceAnalysis ?? undefined;

    // 通过 IP 解析用户地理位置
    const geoLocation = resolveIPLocation(ip);

    // 尝试 AI 分析
    if (process.env.AI_ENABLED === "true") {
      try {
        const aiResult = await analyzeWithAI(answers, faceAnalysisData);
        return NextResponse.json({
          success: true,
          source: "ai",
          data: aiResult,
          // 附加用户位置信息用于护肤用量推荐
          userLocation: {
            province: geoLocation.province,
            city: geoLocation.city,
          },
        });
      } catch (error) {
        console.error("AI 分析失败，使用降级方案:", error);
        // 继续使用降级方案
      }
    }

    // 降级：规则匹配分析
    const fallbackResult = await fallbackAnalysis(answers, faceAnalysisData);

    return NextResponse.json({
      success: true,
      source: "fallback",
      notice: "当前为智能推荐模式",
      data: fallbackResult,
      // 附加用户位置信息用于护肤用量推荐
      userLocation: {
        province: geoLocation.province,
        city: geoLocation.city,
      },
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


import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import { getSkinTypeLabel, getConcernLabel } from "@/lib/advisor-utils";

/**
 * 问答数据 Schema
 */
const AnswersSchema = z.object({
  skinType: z.string().optional(),
  primaryConcern: z.string().optional(),
  ageRange: z.string().optional(),
  currentRoutine: z.string().optional(),
  allergies: z.string().optional(),
  budget: z.string().optional(),
});

/**
 * 面部分析结果 Schema（可选）
 */
const FaceAnalysisSchema = z
  .object({
    skinType: z.object({
      type: z.string(),
      confidence: z.number(),
      description: z.string().optional(),
    }),
    skinConditions: z.array(
      z.object({
        condition: z.string(),
        severity: z.string(),
        area: z.string().optional(),
        description: z.string().optional(),
      })
    ),
    hydration: z.object({
      level: z.string(),
      percent: z.number().min(0).max(100).optional(), // AI 返回的水分百分比
      description: z.string().optional(),
    }),
    skinAge: z
      .object({
        estimated: z.number(),
        factors: z.array(z.string()).optional(),
      })
      .optional(),
    recommendations: z.array(z.string()).optional(),
  })
  .optional();

/**
 * 综合分析请求 Schema
 */
const ComprehensiveAnalysisSchema = z.object({
  answers: AnswersSchema,
  faceAnalysis: FaceAnalysisSchema,
});

/** 肤质类型 */
type SkinType = "dry" | "oily" | "combination" | "normal" | "sensitive" | "unknown";

/** 护肤步骤 */
interface SkincareStep {
  order: number;
  step: string;
  product?: string;
  description: string;
}

/** 护肤方案 */
interface SkincareRoutine {
  morning: SkincareStep[];
  evening: SkincareStep[];
}

/** 推荐产品 */
interface RecommendedProduct {
  id: string;
  name: string;
  category: string;
  reason: string;
  priority: number;
}

/** 综合分析结果 */
interface ComprehensiveResult {
  skinProfile: {
    type: SkinType;
    typeLabel: string;
    concerns: string[];
    skinAge?: number;
  };
  analysis: {
    summary: string;
    details: string[];
  };
  products: RecommendedProduct[];
  routine: SkincareRoutine;
  dataSource: "comprehensive" | "questionnaire";
}

/**
 * POST /api/advisor/comprehensive
 * 综合分析 API - 整合问答数据和面部分析
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
        { status: 429 }
      );
    }

    // 验证请求
    const body = await request.json();
    const result = ComprehensiveAnalysisSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "参数错误",
            details: result.error.flatten().fieldErrors,
          },
        },
        { status: 400 }
      );
    }

    const { answers, faceAnalysis } = result.data;

    // 1. 综合分析肤质
    const comprehensiveSkinType = determineSkinType(answers, faceAnalysis);

    // 2. 识别主要问题
    const primaryConcerns = identifyConcerns(answers, faceAnalysis);

    // 3. 生成综合分析摘要
    const analysis = generateAnalysisSummary(
      comprehensiveSkinType,
      primaryConcerns,
      answers,
      faceAnalysis
    );

    // 4. 匹配推荐产品
    const products = await matchProducts(comprehensiveSkinType, primaryConcerns, answers);

    // 5. 生成护肤方案
    const routine = generateSkincareRoutine(comprehensiveSkinType, answers.currentRoutine);

    const response: ComprehensiveResult = {
      skinProfile: {
        type: comprehensiveSkinType,
        typeLabel: getSkinTypeLabel(comprehensiveSkinType),
        concerns: primaryConcerns,
        skinAge: faceAnalysis?.skinAge?.estimated,
      },
      analysis,
      products,
      routine,
      dataSource: faceAnalysis ? "comprehensive" : "questionnaire",
    };

    return NextResponse.json({
      success: true,
      data: response,
    });
  } catch (error) {
    console.error("Comprehensive analysis error:", error);
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
 * 综合判断肤质（问答 + AI 视觉）
 */
function determineSkinType(
  answers: z.infer<typeof AnswersSchema>,
  faceAnalysis?: z.infer<typeof FaceAnalysisSchema>
): SkinType {
  // 如果有高置信度的面部分析结果，优先使用
  if (faceAnalysis && faceAnalysis.skinType.confidence > 0.8) {
    return faceAnalysis.skinType.type as SkinType;
  }

  // 如果置信度中等，综合考虑
  if (faceAnalysis && faceAnalysis.skinType.confidence > 0.5) {
    // 问答结果与 AI 分析一致，确认使用
    if (answers.skinType === faceAnalysis.skinType.type) {
      return answers.skinType as SkinType;
    }
    // 不一致时，偏向 AI 分析（更客观）
    return faceAnalysis.skinType.type as SkinType;
  }

  // 没有面部分析或置信度低，使用问答结果
  return (answers.skinType as SkinType) || "unknown";
}

/**
 * 识别主要肌肤问题
 */
function identifyConcerns(
  answers: z.infer<typeof AnswersSchema>,
  faceAnalysis?: z.infer<typeof FaceAnalysisSchema>
): string[] {
  const concerns: string[] = [];

  // 从问答中获取关注点
  if (answers.primaryConcern) {
    concerns.push(answers.primaryConcern);
  }

  // 从面部分析中提取问题
  if (faceAnalysis?.skinConditions) {
    faceAnalysis.skinConditions.forEach((condition) => {
      // 只添加中度以上的问题
      if (condition.severity !== "mild" && !concerns.includes(condition.condition)) {
        concerns.push(condition.condition);
      }
    });
  }

  // 从水分状态推断
  if (faceAnalysis?.hydration?.level === "low" && !concerns.includes("hydration")) {
    concerns.push("hydration");
  }

  return concerns.slice(0, 4); // 最多返回 4 个关注点
}

/**
 * 生成分析摘要
 */
function generateAnalysisSummary(
  skinType: SkinType,
  concerns: string[],
  answers: z.infer<typeof AnswersSchema>,
  faceAnalysis?: z.infer<typeof FaceAnalysisSchema>
): { summary: string; details: string[] } {
  const typeLabel = getSkinTypeLabel(skinType);
  const details: string[] = [];

  // 基础摘要
  let summary = `根据分析，您是${typeLabel}`;

  if (faceAnalysis) {
    summary += "，AI 面部检测与问卷结果基本一致";
  }

  // 详细分析
  details.push(`肤质类型：${typeLabel}`);

  if (concerns.length > 0) {
    details.push(`主要关注：${concerns.map(getConcernLabel).join("、")}`);
  }

  if (answers.ageRange) {
    details.push(`年龄段：${answers.ageRange} 岁`);
  }

  if (faceAnalysis?.skinAge?.estimated) {
    const skinAge = faceAnalysis.skinAge.estimated;
    details.push(`肌肤年龄：约 ${skinAge} 岁`);
  }

  if (faceAnalysis?.hydration) {
    const hydrationLabel =
      faceAnalysis.hydration.level === "low"
        ? "偏低"
        : faceAnalysis.hydration.level === "high"
          ? "良好"
          : "中等";
    details.push(`水分状态：${hydrationLabel}`);
  }

  // 合并 AI 建议
  if (faceAnalysis?.recommendations) {
    faceAnalysis.recommendations.slice(0, 2).forEach((rec) => {
      details.push(rec);
    });
  }

  return { summary, details };
}

/**
 * 匹配推荐产品
 */
async function matchProducts(
  skinType: SkinType,
  concerns: string[],
  _answers: z.infer<typeof AnswersSchema>
): Promise<RecommendedProduct[]> {
  try {
    // 从数据库查询产品
    const products = await prisma.product.findMany({
      where: {
        published: true,
      },
      take: 6,
      orderBy: {
        order: "asc",
      },
      select: {
        id: true,
        name: true,
        category: { select: { name: true } },
        description: true,
      },
    });

    // 简单匹配逻辑（可扩展为更复杂的推荐算法）
    return products.map((product, index) => ({
      id: product.id,
      name: product.name,
      category: product.category?.name || "护肤品",
      reason: generateProductReason(skinType, concerns, index),
      priority: index + 1,
    }));
  } catch {
    // 数据库查询失败，返回空数组
    return [];
  }
}

/**
 * 生成产品推荐理由
 */
function generateProductReason(skinType: SkinType, concerns: string[], index: number): string {
  const reasons: Record<string, string[]> = {
    dry: ["深层滋润，改善干燥", "持久保湿，修护肌肤"],
    oily: ["控油清爽，平衡水油", "清透不油腻"],
    combination: ["平衡T区与两颊", "分区护理效果好"],
    sensitive: ["温和无刺激，适合敏感肌", "舒缓镇静肌肤"],
    normal: ["维持肌肤稳定状态", "日常保养必备"],
    unknown: ["适合多种肤质", "基础护理佳选"],
  };

  const skinReasons = reasons[skinType] || reasons.unknown;
  return skinReasons[index % skinReasons.length];
}

/**
 * 生成护肤方案 (基于 NIHPLOD 产品线)
 *
 * NIHPLOD 产品：
 * - 云朵洁面慕斯 (Foam Cleanser)
 * - 匀衡磨砂膏 (Face Scrub) - 每周1-2次
 * - 臻萃修护面膜 (Face Mask) - 每周2-3次
 * - 修护紧致精华 (Serum)
 * - 逆龄面霜 (Face Cream)
 * - 轻透防晒霜 (Sunscreen)
 * - 臻萃护理油 (Treatment Oil) - 可选加强护理
 */
function generateSkincareRoutine(
  _skinType: SkinType,
  currentRoutine?: string
): SkincareRoutine {
  const isMinimal = currentRoutine === "minimal" || currentRoutine === "none";

  // 极简护肤方案
  if (isMinimal) {
    return {
      morning: [
        { order: 1, step: "洁面", description: "云朵洁面慕斯温和清洁" },
        { order: 2, step: "面霜", description: "逆龄面霜基础保湿" },
        { order: 3, step: "防晒", description: "轻透防晒霜日间防护" },
      ],
      evening: [
        { order: 1, step: "洁面", description: "云朵洁面慕斯清洁肌肤" },
        { order: 2, step: "面霜", description: "逆龄面霜夜间滋养" },
      ],
    };
  }

  // 完整护肤方案
  return {
    morning: [
      { order: 1, step: "洁面", description: "云朵洁面慕斯温和清洁" },
      { order: 2, step: "精华", description: "修护紧致精华轻拍吸收" },
      { order: 3, step: "面霜", description: "逆龄面霜锁水保湿" },
      { order: 4, step: "防晒", description: "轻透防晒霜出门必备" },
    ],
    evening: [
      { order: 1, step: "洁面", description: "云朵洁面慕斯深层清洁" },
      { order: 2, step: "精华", description: "修护紧致精华夜间修护" },
      { order: 3, step: "护理油", description: "臻萃护理油加强滋养（可选）" },
      { order: 4, step: "面霜", description: "逆龄面霜夜间滋养锁水" },
    ],
  };
}

// getSkinTypeLabel 和 getConcernLabel 已移至 lib/advisor-utils.ts


/**
 * AI 接口 - 护肤顾问分析
 */

import prisma from "./prisma";
import type { QuestionnaireAnswers, FaceAnalysisResult } from "@/schemas/advisor";

export interface AIMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface AIResponse {
  message: string;
  suggestions?: string[];
}

/** 肌肤分析结果 */
export interface SkinAnalysis {
  skinType: string;
  skinTypeLabel: string;
  concerns: string[];
  concernLabels: string[];
  summary: string;
  details: string[];
}

/** 推荐产品 */
export interface RecommendedProduct {
  id: string;
  name: string;
  nameEn?: string | null;
  description?: string | null;
  category?: string;
  image?: string;
  reason: string;
}

/** 分析结果 */
export interface AnalysisResult {
  skinAnalysis: SkinAnalysis;
  recommendations: string;
  products: RecommendedProduct[];
}

/**
 * AI 对话（基础功能）
 */
export async function chat(_messages: AIMessage[]): Promise<AIResponse> {
  // TODO: 实现 AI 对话
  return {
    message: "AI 功能待实现",
    suggestions: [],
  };
}

/**
 * 使用 AI 分析肌肤
 */
export async function analyzeWithAI(
  answers: QuestionnaireAnswers,
  faceAnalysis?: FaceAnalysisResult
): Promise<AnalysisResult> {
  const provider = process.env.AI_PROVIDER || "openai";
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.AI_MODEL || "gpt-4o";

  if (!apiKey) {
    throw new Error("AI API key not configured");
  }

  // 构建提示词
  const prompt = buildAnalysisPrompt(answers, faceAnalysis);

  // 调用 AI API
  const response = await callAIProvider(provider, apiKey, model, prompt);

  // 解析 AI 响应
  const analysis = parseAIResponse(response, answers);

  // 匹配推荐产品
  const products = await matchProducts(analysis.concerns, answers);

  return {
    skinAnalysis: analysis,
    recommendations: generateRecommendationText(analysis),
    products,
  };
}

/**
 * 降级分析（基于规则）
 */
export async function fallbackAnalysis(
  answers: QuestionnaireAnswers,
  faceAnalysis?: FaceAnalysisResult
): Promise<AnalysisResult> {
  // 综合判断肤质
  const skinType = determineSkinType(answers, faceAnalysis);
  const skinTypeLabel = getSkinTypeLabel(skinType);

  // 识别关注点
  const concerns = identifyConcerns(answers, faceAnalysis);
  const concernLabels = concerns.map(getConcernLabel);

  // 生成分析摘要
  const summary = `根据您的问卷回答，您是${skinTypeLabel}，主要关注${concernLabels.join("、")}。`;

  const details = generateAnalysisDetails(answers, skinType, concerns);

  const skinAnalysis: SkinAnalysis = {
    skinType,
    skinTypeLabel,
    concerns,
    concernLabels,
    summary,
    details,
  };

  // 匹配推荐产品
  const products = await matchProducts(concerns, answers);

  return {
    skinAnalysis,
    recommendations: generateRecommendationText(skinAnalysis),
    products,
  };
}

/**
 * 构建 AI 分析提示词
 */
function buildAnalysisPrompt(
  answers: QuestionnaireAnswers,
  faceAnalysis?: FaceAnalysisResult
): string {
  // 获取标签
  const skinTypeLabel = getSkinTypeLabel(answers.skinType || "");
  const concernLabel = getConcernLabel(answers.primaryConcern || "");

  let prompt = `你是一位专业的护肤顾问。请根据以下信息，为用户提供个性化的肌肤分析和护肤建议。

## 重要原则
1. 这是护肤品推荐场景，不是医疗诊断
2. 以用户自述为主要依据，AI 面部检测仅作参考
3. 分析要积极正面，重点在改善方案
4. 建议要具体、可执行、适合日常护肤

## 用户自述信息（主要依据）
- 自述肤质：${skinTypeLabel || "未填写"}
- 主要关注：${concernLabel || "未填写"}
- 年龄段：${answers.ageRange || "未填写"}
- 护肤习惯：${answers.currentRoutine || "未填写"}
- 过敏情况：${answers.allergies || "无"}
- 预算偏好：${answers.budget || "未填写"}
`;

  if (faceAnalysis) {
    // 根据置信度决定如何呈现 AI 面部检测结果
    const confidencePercent = Math.round(faceAnalysis.skinType.confidence * 100);
    const confidenceNote = faceAnalysis.skinType.confidence >= 0.7
      ? "（可作为参考）"
      : "（仅供参考，受照片质量影响）";

    prompt += `
## AI 面部检测参考${confidenceNote}
- 检测肤质倾向：${faceAnalysis.skinType.type}（置信度 ${confidencePercent}%）
- 水分状态观察：${faceAnalysis.hydration.level}
${faceAnalysis.skinAge && faceAnalysis.skinAge.estimated > 0 ? `- 肌肤状态估算：约 ${faceAnalysis.skinAge.estimated} 岁` : ""}
${faceAnalysis.skinConditions.length > 0 ? `- 观察到的关注点：${faceAnalysis.skinConditions.map((c) => c.condition).join("、")}` : ""}

注意：当用户自述与 AI 检测有差异时，以用户自述为主（用户更了解自己的日常感受）。
`;
  }

  prompt += `
## 输出要求
请以 JSON 格式返回（只返回 JSON，无其他文字）：
{
  "skinType": "综合判断的肤质类型（dry/oily/combination/normal/sensitive）",
  "concerns": ["主要关注点1", "关注点2"],
  "summary": "温和正面的综合分析（50-80字，避免负面表述）",
  "details": [
    "肤质特点说明",
    "当前状态分析",
    "护理重点建议"
  ],
  "productCategories": ["推荐的产品类别1", "推荐的产品类别2"]
}

## 语气示例
✅ "您的肌肤整体状态良好，T区可能需要适度控油"
❌ "您的皮肤问题严重，T区出油过多"`;

  return prompt;
}

/**
 * 调用 AI 服务
 */
async function callAIProvider(
  provider: string,
  apiKey: string,
  model: string,
  prompt: string
): Promise<string> {
  if (provider === "openai") {
    const systemMessage = `你是一位专业、温和的护肤顾问。

核心原则：
1. 你的分析仅用于护肤品推荐，不是医疗诊断
2. 以积极正面的语气沟通，避免让用户焦虑
3. 重点在于改善方案，而非问题指责
4. 所有建议应该是日常护肤范畴

请用中文回答，只返回 JSON 格式。`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemMessage },
          { role: "user", content: prompt },
        ],
        max_tokens: 1200,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || "";
  }

  throw new Error(`Unsupported AI provider: ${provider}`);
}

/**
 * 解析 AI 响应
 */
function parseAIResponse(response: string, answers: QuestionnaireAnswers): SkinAnalysis {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        skinType: parsed.skinType || answers.skinType || "combination",
        skinTypeLabel: getSkinTypeLabel(parsed.skinType || answers.skinType || "combination"),
        concerns: parsed.concerns || [],
        concernLabels: (parsed.concerns || []).map(getConcernLabel),
        summary: parsed.summary || "",
        details: parsed.details || [],
      };
    }
  } catch {
    // 解析失败，使用降级
  }

  // 降级返回
  return {
    skinType: answers.skinType || "combination",
    skinTypeLabel: getSkinTypeLabel(answers.skinType || "combination"),
    concerns: answers.primaryConcern ? [answers.primaryConcern] : [],
    concernLabels: answers.primaryConcern ? [getConcernLabel(answers.primaryConcern)] : [],
    summary: "根据您的问卷回答进行分析",
    details: [],
  };
}

/** 产品匹配评分 */
interface ProductScore {
  product: {
    id: string;
    name: string;
    nameEn: string;
    description: string;
    benefits: string[];
    category: { name: string } | null;
    images: { url: string }[];
    price: number;
  };
  score: number;
  matchedBenefits: string[];
}

/** 关注点到功效标签的映射 */
const CONCERN_TO_BENEFITS: Record<string, string[]> = {
  aging: ["抗老", "紧致", "抗皱", "淡纹", "胶原", "弹力", "年轻"],
  dull: ["提亮", "亮白", "焕亮", "光泽", "透亮", "均匀肤色"],
  hydration: ["补水", "保湿", "锁水", "滋润", "水润", "润泽"],
  pores: ["毛孔", "控油", "收缩", "细致", "平滑", "净化"],
  sensitive: ["舒缓", "修护", "镇静", "敏感", "温和", "屏障"],
  acne: ["祛痘", "净痘", "控痘", "消炎", "净化", "调理"],
};

/** 肤质到功效标签的映射 */
const SKINTYPE_TO_BENEFITS: Record<string, string[]> = {
  dry: ["滋润", "保湿", "修护", "滋养", "营养"],
  oily: ["控油", "清爽", "净化", "平衡", "调理"],
  combination: ["平衡", "调理", "均衡", "双效"],
  sensitive: ["舒缓", "温和", "修护", "镇静"],
  normal: ["维稳", "保养", "平衡", "健康"],
};

/** 预算到价格范围的映射 */
const BUDGET_TO_PRICE: Record<string, { min: number; max: number }> = {
  budget: { min: 0, max: 500 },
  mid: { min: 300, max: 1000 },
  premium: { min: 800, max: 2000 },
  luxury: { min: 1500, max: Infinity },
};

/**
 * 匹配推荐产品（增强版 - 多维度智能匹配）
 */
async function matchProducts(
  concerns: string[],
  answers: QuestionnaireAnswers
): Promise<RecommendedProduct[]> {
  try {
    // 1. 先尝试使用推荐规则
    const ruleProducts = await matchByRules(concerns, answers);
    if (ruleProducts.length >= 3) {
      return ruleProducts;
    }

    // 2. 智能匹配：获取所有已发布产品
    const allProducts = await prisma.product.findMany({
      where: { published: true },
      orderBy: [{ featured: "desc" }, { order: "asc" }],
      include: {
        category: { select: { name: true } },
        images: { take: 1, orderBy: { order: "asc" } },
      },
    });

    if (allProducts.length === 0) {
      return [];
    }

    // 3. 计算每个产品的匹配分数
    const scoredProducts: ProductScore[] = allProducts.map((product) => {
      const score = calculateProductScore(product, concerns, answers);
      return {
        product: {
          ...product,
          price: Number(product.price),
        },
        score: score.total,
        matchedBenefits: score.matchedBenefits,
      };
    });

    // 4. 按分数排序并取前 6 个
    scoredProducts.sort((a, b) => b.score - a.score);
    const topProducts = scoredProducts.slice(0, 6);

    // 5. 生成推荐结果
    return topProducts.map((item, index) => ({
      id: item.product.id,
      name: item.product.name,
      nameEn: item.product.nameEn,
      description: item.product.description,
      category: item.product.category?.name,
      image: item.product.images[0]?.url,
      reason: generateSmartReason(item.matchedBenefits, concerns, answers.skinType, index),
    }));
  } catch (error) {
    console.error("Product matching error:", error);
    return [];
  }
}

/**
 * 使用规则匹配产品
 */
async function matchByRules(
  concerns: string[],
  answers: QuestionnaireAnswers
): Promise<RecommendedProduct[]> {
  try {
    // 查询所有规则
    const rules = await prisma.recommendationRule.findMany({
      orderBy: { priority: "desc" },
    });

    // 查找匹配的规则
    const matchedRule = rules.find((rule) => {
      const conditions = rule.conditions as Record<string, string[]>;

      // 检查肤质条件
      if (conditions.skinType && answers.skinType) {
        if (!conditions.skinType.includes(answers.skinType)) {
          return false;
        }
      }

      // 检查关注点条件
      if (conditions.concern && concerns.length > 0) {
        const hasMatchingConcern = conditions.concern.some((c) => concerns.includes(c));
        if (!hasMatchingConcern) {
          return false;
        }
      }

      return true;
    });

    if (!matchedRule || matchedRule.productIds.length === 0) {
      return [];
    }

    // 获取规则指定的产品
    const products = await prisma.product.findMany({
      where: {
        id: { in: matchedRule.productIds },
        published: true,
      },
      include: {
        category: { select: { name: true } },
        images: { take: 1, orderBy: { order: "asc" } },
      },
    });

    return products.map((product, index) => ({
      id: product.id,
      name: product.name,
      nameEn: product.nameEn,
      description: product.description,
      category: product.category?.name,
      image: product.images[0]?.url,
      reason: matchedRule.message || generateProductReason(concerns, answers.skinType, index),
    }));
  } catch {
    return [];
  }
}

/**
 * 计算产品匹配分数
 */
function calculateProductScore(
  product: {
    benefits: string[];
    featured: boolean;
    price: { toNumber: () => number } | number;
  },
  concerns: string[],
  answers: QuestionnaireAnswers
): { total: number; matchedBenefits: string[] } {
  let score = 0;
  const matchedBenefits: string[] = [];
  const productBenefits = product.benefits || [];

  // 1. 关注点匹配（权重最高：每匹配 +30 分）
  concerns.forEach((concern) => {
    const relatedBenefits = CONCERN_TO_BENEFITS[concern] || [];
    relatedBenefits.forEach((benefit) => {
      if (productBenefits.some((b) => b.includes(benefit))) {
        score += 30;
        if (!matchedBenefits.includes(benefit)) {
          matchedBenefits.push(benefit);
        }
      }
    });
  });

  // 2. 肤质匹配（权重中等：每匹配 +20 分）
  if (answers.skinType) {
    const skinBenefits = SKINTYPE_TO_BENEFITS[answers.skinType] || [];
    skinBenefits.forEach((benefit) => {
      if (productBenefits.some((b) => b.includes(benefit))) {
        score += 20;
        if (!matchedBenefits.includes(benefit)) {
          matchedBenefits.push(benefit);
        }
      }
    });
  }

  // 3. 预算匹配（权重中等：匹配 +15 分）
  if (answers.budget) {
    const priceRange = BUDGET_TO_PRICE[answers.budget];
    const productPrice = typeof product.price === "number"
      ? product.price
      : product.price.toNumber();
    if (priceRange && productPrice >= priceRange.min && productPrice <= priceRange.max) {
      score += 15;
    }
  }

  // 4. 推荐产品加分（+10 分）
  if (product.featured) {
    score += 10;
  }

  // 5. 如果没有任何匹配，给基础分
  if (score === 0) {
    score = 5;
  }

  return { total: score, matchedBenefits };
}

/**
 * 生成智能推荐理由
 */
function generateSmartReason(
  matchedBenefits: string[],
  concerns: string[],
  skinType?: string,
  index: number = 0
): string {
  // 如果有匹配的功效
  if (matchedBenefits.length > 0) {
    const benefitText = matchedBenefits.slice(0, 2).join("、");
    const templates = [
      `${benefitText}功效，针对您的肌肤需求`,
      `主打${benefitText}，适合您的肤质`,
      `富含${benefitText}成分，有效改善肌肤`,
    ];
    return templates[index % templates.length];
  }

  // 降级到原来的逻辑
  return generateProductReason(concerns, skinType, index);
}

/**
 * 生成产品推荐理由
 */
function generateProductReason(
  concerns: string[],
  skinType?: string,
  index: number = 0
): string {
  const concernReasons: Record<string, string[]> = {
    aging: ["淡化细纹，紧致肌肤", "抗氧化修护"],
    dull: ["提亮肤色，焕发光彩", "改善暗沉"],
    hydration: ["深层补水，持久保湿", "修护肌肤屏障"],
    pores: ["收缩毛孔，细腻肌肤", "控油清透"],
    sensitive: ["舒缓镇静，温和修护", "增强肌肤屏障"],
    acne: ["净化毛孔，预防痘痘", "控油调理"],
  };

  const skinReasons: Record<string, string> = {
    dry: "滋润保湿，改善干燥",
    oily: "清爽控油，平衡水油",
    combination: "分区护理，平衡肤质",
    sensitive: "温和配方，适合敏感肌",
    normal: "日常保养，维持状态",
  };

  // 优先使用关注点相关理由
  if (concerns.length > 0) {
    const concern = concerns[index % concerns.length];
    const reasons = concernReasons[concern];
    if (reasons) {
      return reasons[index % reasons.length];
    }
  }

  // 其次使用肤质相关理由
  if (skinType && skinReasons[skinType]) {
    return skinReasons[skinType];
  }

  return "适合日常护肤使用";
}

/**
 * 综合判断肤质
 */
function determineSkinType(
  answers: QuestionnaireAnswers,
  faceAnalysis?: FaceAnalysisResult
): string {
  if (faceAnalysis && faceAnalysis.skinType.confidence > 0.7) {
    return faceAnalysis.skinType.type;
  }
  return answers.skinType || "combination";
}

/**
 * 识别关注点
 */
function identifyConcerns(
  answers: QuestionnaireAnswers,
  faceAnalysis?: FaceAnalysisResult
): string[] {
  const concerns: string[] = [];

  if (answers.primaryConcern) {
    concerns.push(answers.primaryConcern);
  }

  if (faceAnalysis?.skinConditions) {
    faceAnalysis.skinConditions.forEach((c) => {
      if (!concerns.includes(c.condition)) {
        concerns.push(c.condition);
      }
    });
  }

  if (faceAnalysis?.hydration?.level === "low" && !concerns.includes("hydration")) {
    concerns.push("hydration");
  }

  return concerns.slice(0, 4);
}

/**
 * 生成分析详情
 */
function generateAnalysisDetails(
  answers: QuestionnaireAnswers,
  skinType: string,
  concerns: string[]
): string[] {
  const details: string[] = [];

  details.push(`肤质类型：${getSkinTypeLabel(skinType)}`);

  if (concerns.length > 0) {
    details.push(`主要关注：${concerns.map(getConcernLabel).join("、")}`);
  }

  if (answers.ageRange) {
    details.push(`年龄段：${answers.ageRange}`);
  }

  if (answers.currentRoutine) {
    const routineLabels: Record<string, string> = {
      minimal: "极简护肤",
      basic: "基础护肤",
      complete: "完整护肤",
      advanced: "进阶护理",
      none: "刚开始护肤",
    };
    details.push(`护肤习惯：${routineLabels[answers.currentRoutine] || answers.currentRoutine}`);
  }

  return details;
}

/**
 * 生成推荐文案
 */
function generateRecommendationText(analysis: SkinAnalysis): string {
  if (analysis.concerns.length > 0) {
    return `根据您的肌肤状况，建议重点关注${analysis.concernLabels.join("和")}，以下产品可能适合您：`;
  }
  return "根据您的肌肤状况，为您推荐以下产品：";
}

/**
 * 获取肤质标签
 */
function getSkinTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    dry: "干性肌肤",
    oily: "油性肌肤",
    combination: "混合性肌肤",
    normal: "中性肌肤",
    sensitive: "敏感性肌肤",
    unknown: "待确定肤质",
  };
  return labels[type] || type;
}

/**
 * 获取关注点标签
 */
function getConcernLabel(concern: string): string {
  const labels: Record<string, string> = {
    aging: "抗老紧致",
    dull: "提亮肤色",
    hydration: "补水保湿",
    pores: "毛孔护理",
    sensitive: "舒缓修护",
    acne: "祛痘净肤",
  };
  return labels[concern] || concern;
}

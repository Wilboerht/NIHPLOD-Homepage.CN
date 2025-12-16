/**
 * AI 接口 - 护肤顾问分析
 */

import prisma from "./prisma";
import type { QuestionnaireAnswers, FaceAnalysisResult } from "@/schemas/advisor";
import {
  TEXT_ANALYSIS_SYSTEM_PROMPT,
  buildTextAnalysisPrompt,
} from "@/config/ai-prompts";
import { aiLogger } from "./logger";
import { getSkinTypeLabel, getConcernLabel } from "./advisor-utils";

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

/** 护肤步骤 */
export interface SkincareStep {
  order: number;
  step: string;
  description: string;
}

/** 护肤方案 */
export interface SkincareRoutine {
  morning: SkincareStep[];
  evening: SkincareStep[];
}

/** 分析结果 */
export interface AnalysisResult {
  skinAnalysis: SkinAnalysis;
  recommendations: string;
  products: RecommendedProduct[];
  routine: SkincareRoutine;
}

/**
 * AI 对话
 *
 * ⚠️ 预留接口 - 当前产品设计不需要
 *
 * 当前产品流程：问卷 → 面部扫描(可选) → AI分析 → 结果展示
 * 不涉及对话式交互，分析功能由 analyzeWithAI() 提供
 *
 * 此函数为未来可能的对话式交互预留
 * 如无扩展计划，可删除此函数及相关类型定义
 */
export async function chat(_messages: AIMessage[]): Promise<AIResponse> {
  return {
    message: "此接口为预留接口，当前产品设计不需要对话功能",
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
  // 从数据库获取设置
  const settings = await getAISettings();
  const provider = settings.provider || process.env.AI_PROVIDER || "openai";
  const model = settings.model || process.env.AI_MODEL || "gpt-4o";

  // 根据 provider 获取对应的 API Key
  const apiKey = getApiKeyForProvider(provider);

  if (!apiKey) {
    aiLogger.error("API key not configured", { provider });
    throw new Error(`AI API key not configured for provider: ${provider}`);
  }

  aiLogger.info("Starting AI analysis", { provider, model, hasPhoto: !!faceAnalysis });

  // 构建提示词
  const prompt = buildAnalysisPrompt(answers, faceAnalysis);

  // 获取自定义系统提示词（如果有）
  const systemPrompt = settings.textSystemPrompt || TEXT_ANALYSIS_SYSTEM_PROMPT;

  // 获取 maxTokens 和 temperature（使用数据库设置或默认值）
  const maxTokens = settings.maxTokens || 1800;
  const temperature = settings.temperature ?? 0.3;

  // 调用 AI API
  const response = await callAIProvider(provider, apiKey, model, prompt, systemPrompt, maxTokens, temperature);

  // 解析 AI 响应
  const analysis = parseAIResponse(response, answers);

  // 匹配推荐产品
  const products = await matchProducts(analysis.concerns, answers);

  aiLogger.info("AI analysis completed", {
    provider,
    skinType: analysis.skinType,
    concerns: analysis.concerns,
    productCount: products.length,
  });

  // 生成护肤方案
  const routine = generateSkincareRoutine(answers.currentRoutine);

  return {
    skinAnalysis: analysis,
    recommendations: generateRecommendationText(analysis),
    products,
    routine,
  };
}

/**
 * 各服务商 API Keys 接口
 */
export interface ApiKeys {
  openai?: string;
  deepseek?: string;
  qwen?: string;
  anthropic?: string;
}

/**
 * AI 设置接口
 */
export interface AISettings {
  provider: string;
  visionProvider: string;
  model: string;
  visionModel: string;
  systemPrompt: string; // 废弃，保留兼容
  textSystemPrompt: string;
  visionSystemPrompt: string;
  maxTokens: number;
  temperature: number;
  apiKeys?: ApiKeys;
}

// 默认设置
const DEFAULT_AI_SETTINGS: AISettings = {
  provider: "deepseek",
  visionProvider: "openai",
  model: "deepseek-chat",
  visionModel: "gpt-4o",
  systemPrompt: "",
  textSystemPrompt: "",
  visionSystemPrompt: "",
  maxTokens: 1800, // 文本分析需要较长输出（5条详细分析）
  temperature: 0.3, // 保持一致性
  apiKeys: {
    openai: "",
    deepseek: "",
    qwen: "",
    anthropic: "",
  },
};

// 缓存设置，避免每次请求都查询数据库
let cachedSettings: AISettings | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60 * 1000; // 缓存 60 秒

/**
 * 从数据库获取 AI 设置（带缓存）
 */
export async function getAISettings(): Promise<AISettings> {
  const now = Date.now();

  // 如果缓存有效，直接返回
  if (cachedSettings && now - cacheTimestamp < CACHE_TTL) {
    return cachedSettings;
  }

  try {
    const setting = await prisma.setting.findUnique({
      where: { key: "advisor_ai_settings" },
    });

    if (setting?.value) {
      const dbSettings = setting.value as Partial<AISettings>;
      cachedSettings = {
        ...DEFAULT_AI_SETTINGS,
        ...dbSettings,
        // 数据库设置优先，环境变量作为降级选项（仅当数据库未配置时使用）
        provider: dbSettings.provider || process.env.AI_PROVIDER || DEFAULT_AI_SETTINGS.provider,
        visionProvider: dbSettings.visionProvider || process.env.AI_VISION_PROVIDER || DEFAULT_AI_SETTINGS.visionProvider,
        model: dbSettings.model || process.env.AI_MODEL || DEFAULT_AI_SETTINGS.model,
        visionModel: dbSettings.visionModel || process.env.AI_VISION_MODEL || DEFAULT_AI_SETTINGS.visionModel,
        // 确保提示词字段正确传递
        textSystemPrompt: dbSettings.textSystemPrompt || DEFAULT_AI_SETTINGS.textSystemPrompt,
        visionSystemPrompt: dbSettings.visionSystemPrompt || DEFAULT_AI_SETTINGS.visionSystemPrompt,
        apiKeys: dbSettings.apiKeys || DEFAULT_AI_SETTINGS.apiKeys,
      };
    } else {
      // 没有数据库设置，使用环境变量
      cachedSettings = {
        ...DEFAULT_AI_SETTINGS,
        provider: process.env.AI_PROVIDER || DEFAULT_AI_SETTINGS.provider,
        visionProvider: process.env.AI_VISION_PROVIDER || DEFAULT_AI_SETTINGS.visionProvider,
        model: process.env.AI_MODEL || DEFAULT_AI_SETTINGS.model,
        visionModel: process.env.AI_VISION_MODEL || DEFAULT_AI_SETTINGS.visionModel,
      };
    }

    cacheTimestamp = now;
    return cachedSettings;
  } catch (error) {
    aiLogger.error("Failed to fetch AI settings from database", { error });
    // 出错时使用默认设置
    return {
      ...DEFAULT_AI_SETTINGS,
      provider: process.env.AI_PROVIDER || DEFAULT_AI_SETTINGS.provider,
      visionProvider: process.env.AI_VISION_PROVIDER || DEFAULT_AI_SETTINGS.visionProvider,
    };
  }
}

/**
 * 清除设置缓存（在设置更新后调用）
 */
export function clearAISettingsCache(): void {
  cachedSettings = null;
  cacheTimestamp = 0;
}

/**
 * 根据 provider 获取对应的 API Key
 * 优先从数据库缓存读取，降级到环境变量
 */
export function getApiKeyForProvider(provider: string): string | undefined {
  // 首先尝试从缓存的数据库设置中获取
  if (cachedSettings?.apiKeys) {
    const dbKey = cachedSettings.apiKeys[provider as keyof ApiKeys];
    if (dbKey && dbKey.length > 0) {
      return dbKey;
    }
  }

  // 降级到环境变量
  switch (provider) {
    case "openai":
      return process.env.OPENAI_API_KEY;
    case "deepseek":
      return process.env.DEEPSEEK_API_KEY;
    case "anthropic":
      return process.env.ANTHROPIC_API_KEY;
    case "qwen":
      return process.env.QWEN_API_KEY;
    default:
      return process.env.OPENAI_API_KEY;
  }
}

/**
 * 获取 OpenAI 兼容 API 的 Base URL
 * 支持通过环境变量配置自定义端点（如代理服务器）
 */
function getOpenAICompatibleBaseUrl(provider: string): string {
  switch (provider) {
    case "deepseek":
      return process.env.DEEPSEEK_API_URL || "https://api.deepseek.com/v1";
    case "qwen":
      return process.env.QWEN_API_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1";
    case "openai":
    default:
      return process.env.OPENAI_API_URL || "https://api.openai.com/v1";
  }
}

/**
 * 获取 Anthropic API URL
 * 支持通过环境变量配置自定义端点（如代理服务器）
 */
function getAnthropicApiUrl(): string {
  return process.env.ANTHROPIC_API_URL || "https://api.anthropic.com/v1/messages";
}

/**
 * 获取对应 provider 的模型名称
 */
function getModelForProvider(provider: string, defaultModel: string): string {
  switch (provider) {
    case "deepseek":
      return process.env.DEEPSEEK_MODEL || "deepseek-chat";
    case "qwen":
      return process.env.QWEN_MODEL || "qwen-plus";
    case "openai":
    default:
      return defaultModel;
  }
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

  // 生成护肤方案
  const routine = generateSkincareRoutine(answers.currentRoutine);

  return {
    skinAnalysis,
    recommendations: generateRecommendationText(skinAnalysis),
    products,
    routine,
  };
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
function generateSkincareRoutine(currentRoutine?: string): SkincareRoutine {
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

/**
 * 构建 AI 分析提示词（使用配置文件）
 */
function buildAnalysisPrompt(
  answers: QuestionnaireAnswers,
  faceAnalysis?: FaceAnalysisResult
): string {
  return buildTextAnalysisPrompt({
    skinTypeLabel: getSkinTypeLabel(answers.skinType || ""),
    concernLabel: getConcernLabel(answers.primaryConcern || ""),
    ageRange: answers.ageRange,
    currentRoutine: answers.currentRoutine,
    allergies: answers.allergies,
    budget: answers.budget,
    pregnancyStatus: answers.pregnancyStatus,
    medicationHistory: answers.medicationHistory,
    faceAnalysis: faceAnalysis,
  });
}

/**
 * 调用 AI 服务（支持 OpenAI、DeepSeek、Anthropic、通义千问）
 * @param systemPrompt 自定义系统提示词，如果未提供则使用默认值
 * @param maxTokens 最大 token 数
 * @param temperature 温度参数
 */
async function callAIProvider(
  provider: string,
  apiKey: string,
  model: string,
  prompt: string,
  systemPrompt?: string,
  maxTokens?: number,
  temperature?: number
): Promise<string> {
  const startTime = Date.now();
  const effectiveSystemPrompt = systemPrompt || TEXT_ANALYSIS_SYSTEM_PROMPT;
  const effectiveMaxTokens = maxTokens || 1800;
  const effectiveTemperature = temperature ?? 0.3;

  try {
    // OpenAI、DeepSeek、通义千问 使用相同的 API 格式（OpenAI 兼容）
    if (provider === "openai" || provider === "deepseek" || provider === "qwen") {
      const baseUrl = getOpenAICompatibleBaseUrl(provider);

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: getModelForProvider(provider, model),
          messages: [
            { role: "system", content: effectiveSystemPrompt },
            { role: "user", content: prompt },
          ],
          max_tokens: effectiveMaxTokens,
          temperature: effectiveTemperature,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        aiLogger.error("AI API request failed", {
          provider,
          status: response.status,
          error: errorText,
          duration: Date.now() - startTime,
        });
        throw new Error(`AI API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content || "";

      aiLogger.info("AI API request successful", {
        provider,
        model: getModelForProvider(provider, model),
        duration: Date.now() - startTime,
        tokenUsage: data.usage,
      });

      return content;
    }

    // Anthropic Claude
    if (provider === "anthropic") {
      const response = await fetch(getAnthropicApiUrl(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: model || "claude-sonnet-4-20250514",
          max_tokens: effectiveMaxTokens,
          temperature: effectiveTemperature,
          system: effectiveSystemPrompt,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        aiLogger.error("Anthropic API request failed", {
          provider,
          status: response.status,
          error: errorText,
          duration: Date.now() - startTime,
        });
        throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      const content = data.content[0]?.text || "";

      aiLogger.info("Anthropic API request successful", {
        provider,
        model: model || "claude-sonnet-4-20250514",
        duration: Date.now() - startTime,
        tokenUsage: data.usage,
      });

      return content;
    }

    throw new Error(`Unsupported AI provider: ${provider}`);
  } catch (error) {
    aiLogger.error("AI provider call failed", {
      provider,
      model,
      error: error instanceof Error ? error.message : "Unknown error",
      duration: Date.now() - startTime,
    });
    throw error;
  }
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
  unknown: ["保湿", "温和", "平衡", "基础"], // 不确定肤质时推荐温和基础产品
};

/** 预算到价格范围的映射 */
const BUDGET_TO_PRICE: Record<string, { min: number; max: number }> = {
  budget: { min: 0, max: 500 },
  mid: { min: 300, max: 1000 },
  premium: { min: 800, max: 2000 },
  luxury: { min: 1500, max: Infinity },
};

/** 年龄段到推荐功效的映射 */
const AGE_TO_BENEFITS: Record<string, string[]> = {
  "18-24": ["控油", "清爽", "补水", "净化", "祛痘"],
  "25-30": ["补水", "保湿", "提亮", "抗氧化", "防护"],
  "31-40": ["抗老", "紧致", "淡纹", "修护", "保湿"],
  "41-50": ["抗皱", "紧致", "淡斑", "滋养", "胶原"],
  "50+": ["紧致", "滋养", "修护", "抗皱", "弹力"],
};

/** 护肤习惯到产品复杂度的映射 */
const ROUTINE_COMPLEXITY: Record<string, number> = {
  none: 1,      // 刚开始护肤 - 推荐基础单品
  minimal: 1,   // 极简护肤 - 推荐基础单品
  basic: 2,     // 基础护肤 - 推荐常规产品
  complete: 3,  // 完整护肤 - 可推荐进阶产品
  advanced: 4,  // 进阶护理 - 可推荐专业产品
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
 * 计算产品匹配分数（优化版 - 多维度评分）
 *
 * 评分维度及权重：
 * - 关注点匹配：+30分/项（最高权重）
 * - 年龄段匹配：+25分/项（新增）
 * - 肤质匹配：+20分/项
 * - 预算匹配：+15分
 * - 推荐产品：+10分
 * - 护肤习惯匹配：+5-10分（新增）
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

  // 2. 年龄段匹配（新增：每匹配 +25 分）
  if (answers.ageRange) {
    const ageBenefits = AGE_TO_BENEFITS[answers.ageRange] || [];
    ageBenefits.forEach((benefit) => {
      if (productBenefits.some((b) => b.includes(benefit))) {
        score += 25;
        if (!matchedBenefits.includes(benefit)) {
          matchedBenefits.push(benefit);
        }
      }
    });
  }

  // 3. 肤质匹配（权重中等：每匹配 +20 分）
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

  // 4. 预算匹配（权重中等：匹配 +15 分）
  if (answers.budget) {
    const priceRange = BUDGET_TO_PRICE[answers.budget];
    const productPrice = typeof product.price === "number"
      ? product.price
      : product.price.toNumber();
    if (priceRange && productPrice >= priceRange.min && productPrice <= priceRange.max) {
      score += 15;
    }
  }

  // 5. 推荐产品加分（+10 分）
  if (product.featured) {
    score += 10;
  }

  // 6. 护肤习惯匹配（新增：根据复杂度调整）
  // 新手推荐基础产品，进阶用户可推荐专业产品
  if (answers.currentRoutine) {
    const complexity = ROUTINE_COMPLEXITY[answers.currentRoutine] || 2;
    // 基础产品对新手加分，专业产品对进阶用户加分
    const hasBasicBenefits = productBenefits.some((b) =>
      ["保湿", "补水", "清洁", "防晒"].some((basic) => b.includes(basic))
    );
    const hasAdvancedBenefits = productBenefits.some((b) =>
      ["精华", "抗老", "焕肤", "修护"].some((adv) => b.includes(adv))
    );

    if (complexity <= 2 && hasBasicBenefits) {
      score += 10; // 新手 + 基础产品
    } else if (complexity >= 3 && hasAdvancedBenefits) {
      score += 10; // 进阶 + 专业产品
    } else {
      score += 5; // 一般匹配
    }
  }

  // 7. 如果没有任何匹配，给基础分
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

// getSkinTypeLabel 和 getConcernLabel 已移至 lib/advisor-utils.ts

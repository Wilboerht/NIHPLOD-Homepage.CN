import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth";
import { clearAISettingsCache } from "@/lib/ai";
import { z } from "zod";

// AI 设置 Key
const AI_SETTINGS_KEY = "advisor_ai_settings";

// 默认设置
const DEFAULT_SETTINGS = {
  provider: "deepseek",
  visionProvider: "openai",
  apiKey: "", // 保留用于兼容
  model: "deepseek-chat",
  visionModel: "gpt-4o",
  systemPrompt: `你是 NIHPLOD 品牌的专业护肤顾问。根据用户的肤质、护肤需求和生活习惯，为他们推荐最适合的产品。

请用温和、专业的语气回答，并解释为什么推荐这些产品。`,
  maxTokens: 500,
  temperature: 0.7,
  // 各服务商独立的 API Key
  apiKeys: {
    openai: "",
    deepseek: "",
    qwen: "",
    anthropic: "",
  },
};

// API Keys Schema
const ApiKeysSchema = z.object({
  openai: z.string().optional(),
  deepseek: z.string().optional(),
  qwen: z.string().optional(),
  anthropic: z.string().optional(),
});

// 设置 Schema
const SettingsSchema = z.object({
  provider: z.enum(["openai", "deepseek", "qwen", "anthropic"]).optional(),
  visionProvider: z.enum(["openai", "qwen", "anthropic"]).optional(),
  apiKey: z.string().optional(), // 保留用于兼容
  apiKeys: ApiKeysSchema.optional(), // 新增：各服务商独立的 API Key
  model: z.string().optional(),
  visionModel: z.string().optional(),
  systemPrompt: z.string().max(2000).optional(),
  maxTokens: z.number().min(100).max(2000).optional(),
  temperature: z.number().min(0).max(2).optional(),
});

// 辅助函数：遮罩 API Key
function maskApiKey(key: string): string {
  if (!key || key.length < 12) return key ? "***" : "";
  return `${key.slice(0, 8)}...${key.slice(-4)}`;
}

// GET /api/admin/advisor/settings - 获取 AI 设置
export async function GET(request: NextRequest) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
        { status: 401 }
      );
    }

    const setting = await prisma.setting.findUnique({
      where: { key: AI_SETTINGS_KEY },
    });

    const settings = (setting?.value as typeof DEFAULT_SETTINGS) || DEFAULT_SETTINGS;

    // 确保 apiKeys 对象存在
    const apiKeys = settings.apiKeys || DEFAULT_SETTINGS.apiKeys;

    // 遮罩各服务商的 API Key
    const maskedApiKeys = {
      openai: maskApiKey(apiKeys.openai || ""),
      deepseek: maskApiKey(apiKeys.deepseek || ""),
      qwen: maskApiKey(apiKeys.qwen || ""),
      anthropic: maskApiKey(apiKeys.anthropic || ""),
    };

    // 检查各服务商是否已配置 API Key
    const hasApiKeys = {
      openai: !!(apiKeys.openai),
      deepseek: !!(apiKeys.deepseek),
      qwen: !!(apiKeys.qwen),
      anthropic: !!(apiKeys.anthropic),
    };

    // 隐藏 API Key 的部分内容（保留旧字段兼容）
    const maskedSettings = {
      ...settings,
      apiKey: settings.apiKey ? maskApiKey(settings.apiKey) : "",
      hasApiKey: !!settings.apiKey,
      apiKeys: maskedApiKeys,
      hasApiKeys,
    };

    return NextResponse.json({
      success: true,
      data: maskedSettings,
    });
  } catch (error) {
    console.error("获取 AI 设置失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "获取设置失败" } },
      { status: 500 }
    );
  }
}

// PUT /api/admin/advisor/settings - 更新 AI 设置
export async function PUT(request: NextRequest) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
        { status: 401 }
      );
    }

    const body = await request.json();
    const validated = SettingsSchema.parse(body);

    // 获取现有设置
    const existing = await prisma.setting.findUnique({
      where: { key: AI_SETTINGS_KEY },
    });

    const currentSettings = (existing?.value as typeof DEFAULT_SETTINGS) || DEFAULT_SETTINGS;
    const currentApiKeys = currentSettings.apiKeys || DEFAULT_SETTINGS.apiKeys;

    // 合并设置（如果 apiKey 为空字符串，保留原有值）
    const newSettings = {
      ...currentSettings,
      ...(validated.provider !== undefined && { provider: validated.provider }),
      ...(validated.visionProvider !== undefined && { visionProvider: validated.visionProvider }),
      ...(validated.model !== undefined && { model: validated.model }),
      ...(validated.visionModel !== undefined && { visionModel: validated.visionModel }),
      ...(validated.systemPrompt !== undefined && { systemPrompt: validated.systemPrompt }),
      ...(validated.maxTokens !== undefined && { maxTokens: validated.maxTokens }),
      ...(validated.temperature !== undefined && { temperature: validated.temperature }),
    };

    // 只有当 apiKey 有值时才更新（保留旧字段兼容）
    if (validated.apiKey && validated.apiKey.length > 0) {
      newSettings.apiKey = validated.apiKey;
    }

    // 处理各服务商独立的 API Keys（只更新有值的 Key）
    if (validated.apiKeys) {
      const newApiKeys = { ...currentApiKeys };

      if (validated.apiKeys.openai && validated.apiKeys.openai.length > 0) {
        newApiKeys.openai = validated.apiKeys.openai;
      }
      if (validated.apiKeys.deepseek && validated.apiKeys.deepseek.length > 0) {
        newApiKeys.deepseek = validated.apiKeys.deepseek;
      }
      if (validated.apiKeys.qwen && validated.apiKeys.qwen.length > 0) {
        newApiKeys.qwen = validated.apiKeys.qwen;
      }
      if (validated.apiKeys.anthropic && validated.apiKeys.anthropic.length > 0) {
        newApiKeys.anthropic = validated.apiKeys.anthropic;
      }

      newSettings.apiKeys = newApiKeys;
    } else {
      // 确保 apiKeys 字段存在
      newSettings.apiKeys = currentApiKeys;
    }

    // 保存设置
    await prisma.setting.upsert({
      where: { key: AI_SETTINGS_KEY },
      create: {
        key: AI_SETTINGS_KEY,
        value: newSettings,
      },
      update: {
        value: newSettings,
      },
    });

    // 清除 AI 设置缓存，使新设置立即生效
    clearAISettingsCache();

    // 构建返回的 hasApiKeys 状态
    const hasApiKeys = {
      openai: !!(newSettings.apiKeys?.openai),
      deepseek: !!(newSettings.apiKeys?.deepseek),
      qwen: !!(newSettings.apiKeys?.qwen),
      anthropic: !!(newSettings.apiKeys?.anthropic),
    };

    return NextResponse.json({
      success: true,
      data: {
        message: "设置已保存",
        hasApiKey: !!newSettings.apiKey,
        hasApiKeys,
      },
    });
  } catch (error) {
    console.error("更新 AI 设置失败:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: error.issues[0]?.message || "参数错误" } },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "保存设置失败" } },
      { status: 500 }
    );
  }
}


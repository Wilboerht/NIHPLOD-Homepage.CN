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
  apiKey: "",
  model: "deepseek-chat",
  visionModel: "gpt-4o",
  systemPrompt: `你是 NIHPLOD 品牌的专业护肤顾问。根据用户的肤质、护肤需求和生活习惯，为他们推荐最适合的产品。

请用温和、专业的语气回答，并解释为什么推荐这些产品。`,
  maxTokens: 500,
  temperature: 0.7,
};

// 设置 Schema
const SettingsSchema = z.object({
  provider: z.enum(["openai", "deepseek", "qwen", "anthropic"]).optional(),
  visionProvider: z.enum(["openai", "qwen", "anthropic"]).optional(),
  apiKey: z.string().optional(),
  model: z.string().optional(),
  visionModel: z.string().optional(),
  systemPrompt: z.string().max(2000).optional(),
  maxTokens: z.number().min(100).max(2000).optional(),
  temperature: z.number().min(0).max(2).optional(),
});

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

    // 隐藏 API Key 的部分内容
    const maskedSettings = {
      ...settings,
      apiKey: settings.apiKey
        ? `${settings.apiKey.slice(0, 8)}...${settings.apiKey.slice(-4)}`
        : "",
      hasApiKey: !!settings.apiKey,
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

    // 只有当 apiKey 有值时才更新
    if (validated.apiKey && validated.apiKey.length > 0) {
      newSettings.apiKey = validated.apiKey;
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

    return NextResponse.json({
      success: true,
      data: {
        message: "设置已保存",
        hasApiKey: !!newSettings.apiKey,
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


import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth";
import { clearAISettingsCache } from "@/lib/ai";
import { z } from "zod";

// AI 设置 Key
const AI_SETTINGS_KEY = "advisor_ai_settings";

// 默认文本分析系统提示词
const DEFAULT_TEXT_SYSTEM_PROMPT = `你是一位专业、温和的护肤顾问。

核心原则：
1. 你的分析仅用于护肤品推荐，不是医疗诊断
2. 以积极正面的语气沟通，避免让用户焦虑
3. 重点在于改善方案，而非问题指责
4. 所有建议应该是日常护肤范畴

请用中文回答，只返回 JSON 格式。`;

// 默认视觉分析系统提示词
const DEFAULT_VISION_SYSTEM_PROMPT = `你是一位专业的护肤顾问（非医疗诊断）。请根据用户提供的面部照片，从护肤品推荐的角度分析肌肤状态。

## 重要原则
1. **保守判断**：这是护肤建议，不是医学诊断。当不确定时，选择更中性的判断
2. **照片局限性**：照片受光线、角度、相机等因素影响，分析仅供参考
3. **避免医学术语**：不要使用"诊断"、"治疗"、"疾病"等医学术语
4. **置信度诚实**：如果照片质量差或难以判断，请降低 confidence 值

## 分析维度
- **肤质**：基于 T 区和脸颊的油光/干燥程度判断
- **水分状态**：基于肌肤光泽度和纹理判断
- **常见关注点**：仅识别明显可见的护肤关注点（如毛孔、暗沉、细纹等）
- **肌肤年龄**：基于可见状态的估算，仅供参考

## 不要做的事
- ❌ 不要诊断皮肤病（如玫瑰痤疮、湿疹、皮炎等）
- ❌ 不要判断需要医疗干预的问题
- ❌ 不要给出过于肯定的结论（除非非常明显）
- ❌ 不要夸大问题的严重性

## 输出格式
请严格按以下 JSON 格式返回（只返回 JSON，无其他文字）：
{
  "skinType": { "type": "dry|oily|combination|normal|sensitive", "confidence": 0.0-1.0, "description": "肤质描述" },
  "skinConditions": [{ "condition": "问题", "severity": "mild|moderate|severe", "area": "区域", "description": "描述" }],
  "skinAge": { "estimated": 数字, "factors": ["因素"] },
  "hydration": { "level": "low|medium|high", "description": "描述" },
  "recommendations": ["建议1", "建议2", "建议3"]
}

## 语气要求
- 使用"看起来"、"可能"、"建议"等委婉用语
- 避免"你的皮肤有问题"等负面表述
- 重点放在改善建议而非问题指责`;

// 默认设置
const DEFAULT_SETTINGS = {
  provider: "deepseek",
  visionProvider: "openai",
  apiKey: "", // 保留用于兼容
  model: "deepseek-chat",
  visionModel: "gpt-4o",
  systemPrompt: "", // 废弃，保留兼容
  textSystemPrompt: DEFAULT_TEXT_SYSTEM_PROMPT,
  visionSystemPrompt: DEFAULT_VISION_SYSTEM_PROMPT,
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
  apiKeys: ApiKeysSchema.optional(),
  model: z.string().optional(),
  visionModel: z.string().optional(),
  systemPrompt: z.string().max(5000).optional(), // 废弃，保留兼容
  textSystemPrompt: z.string().max(5000).optional(),
  visionSystemPrompt: z.string().max(5000).optional(),
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
      ...(validated.textSystemPrompt !== undefined && { textSystemPrompt: validated.textSystemPrompt }),
      ...(validated.visionSystemPrompt !== undefined && { visionSystemPrompt: validated.visionSystemPrompt }),
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


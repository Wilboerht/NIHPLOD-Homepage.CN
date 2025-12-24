/**
 * AI 服务健康检测 API
 * POST /api/admin/advisor/health-check
 *
 * 测试各 AI 服务商的连通性和响应时间
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { getAISettings, type AISettings } from "@/lib/ai";

// 服务商配置
const PROVIDER_CONFIG: Record<string, {
  name: string;
  getBaseUrl: () => string;
  getHeaders: (apiKey: string) => Record<string, string>;
  getBody: (model: string) => object;
  parseResponse: (data: unknown) => boolean;
}> = {
  openai: {
    name: "OpenAI",
    getBaseUrl: () => process.env.OPENAI_API_URL || "https://api.openai.com/v1",
    getHeaders: (apiKey) => ({
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    }),
    getBody: (model) => ({
      model: model || "gpt-4o",
      messages: [{ role: "user", content: "Hi" }],
      max_tokens: 5,
    }),
    parseResponse: (data) => !!(data as { choices?: unknown[] })?.choices?.length,
  },
  deepseek: {
    name: "DeepSeek",
    getBaseUrl: () => process.env.DEEPSEEK_API_URL || "https://api.deepseek.com/v1",
    getHeaders: (apiKey) => ({
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    }),
    getBody: () => ({
      model: "deepseek-chat",
      messages: [{ role: "user", content: "Hi" }],
      max_tokens: 5,
    }),
    parseResponse: (data) => !!(data as { choices?: unknown[] })?.choices?.length,
  },
  qwen: {
    name: "通义千问",
    getBaseUrl: () => process.env.QWEN_API_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1",
    getHeaders: (apiKey) => ({
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    }),
    getBody: () => ({
      model: "qwen-turbo",
      messages: [{ role: "user", content: "Hi" }],
      max_tokens: 5,
    }),
    parseResponse: (data) => !!(data as { choices?: unknown[] })?.choices?.length,
  },
  anthropic: {
    name: "Anthropic",
    getBaseUrl: () => process.env.ANTHROPIC_API_URL || "https://api.anthropic.com/v1/messages",
    getHeaders: (apiKey) => ({
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    }),
    getBody: () => ({
      model: "claude-3-haiku-20240307",
      max_tokens: 5,
      messages: [{ role: "user", content: "Hi" }],
    }),
    parseResponse: (data) => !!(data as { content?: unknown[] })?.content?.length,
  },
  gemini: {
    name: "Gemini",
    getBaseUrl: () => process.env.GEMINI_API_URL || "https://generativelanguage.googleapis.com/v1beta",
    getHeaders: () => ({
      "Content-Type": "application/json",
    }),
    getBody: () => ({
      contents: [{ role: "user", parts: [{ text: "Hi" }] }],
      generationConfig: { maxOutputTokens: 5 },
    }),
    parseResponse: (data) => !!(data as { candidates?: unknown[] })?.candidates?.length,
  },
};

// 获取 API Key
function getApiKey(provider: string, aiSettings: AISettings): string | null {
  const envKeys: Record<string, string | undefined> = {
    openai: process.env.OPENAI_API_KEY,
    deepseek: process.env.DEEPSEEK_API_KEY,
    qwen: process.env.QWEN_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    gemini: process.env.GEMINI_API_KEY,
  };
  const apiKeys = aiSettings.apiKeys as Record<string, string | undefined> | undefined;
  return apiKeys?.[provider] || envKeys[provider] || null;
}

// 健康检测结果
interface HealthCheckResult {
  provider: string;
  name: string;
  status: "healthy" | "error" | "unconfigured";
  responseTime?: number;
  error?: string;
}

// 检测单个服务商
async function checkProvider(
  provider: string,
  apiKey: string | null,
  model?: string
): Promise<HealthCheckResult> {
  const config = PROVIDER_CONFIG[provider];
  if (!config) {
    return { provider, name: provider, status: "error", error: "未知服务商" };
  }

  if (!apiKey) {
    return { provider, name: config.name, status: "unconfigured" };
  }

  const startTime = Date.now();
  try {
    // 根据不同服务商构建 URL
    let url: string;
    if (provider === "anthropic") {
      url = config.getBaseUrl();
    } else if (provider === "gemini") {
      const geminiModel = process.env.GEMINI_MODEL || "gemini-2.0-flash";
      url = `${config.getBaseUrl()}/models/${geminiModel}:generateContent?key=${apiKey}`;
    } else {
      url = `${config.getBaseUrl()}/chat/completions`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15秒超时

    const response = await fetch(url, {
      method: "POST",
      headers: config.getHeaders(apiKey),
      body: JSON.stringify(config.getBody(model || "")),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const responseTime = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      return {
        provider,
        name: config.name,
        status: "error",
        responseTime,
        error: `HTTP ${response.status}: ${errorText.slice(0, 100)}`,
      };
    }

    const data = await response.json();
    const isValid = config.parseResponse(data);

    return {
      provider,
      name: config.name,
      status: isValid ? "healthy" : "error",
      responseTime,
      error: isValid ? undefined : "响应格式异常",
    };
  } catch (error) {
    return {
      provider,
      name: config.name,
      status: "error",
      responseTime: Date.now() - startTime,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function POST(request: NextRequest) {
  const admin = await verifyAuth(request);
  if (!admin) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
      { status: 401 }
    );
  }

  try {
    const aiSettings = await getAISettings();
    const { providers } = await request.json().catch(() => ({ providers: null }));
    
    // 如果指定了服务商，只检测指定的；否则检测所有已配置的
    const providersToCheck = providers 
      ? (Array.isArray(providers) ? providers : [providers])
      : Object.keys(PROVIDER_CONFIG);

    const results = await Promise.all(
      providersToCheck.map((provider: string) =>
        checkProvider(provider, getApiKey(provider, aiSettings), aiSettings.model)
      )
    );

    const healthyCount = results.filter((r) => r.status === "healthy").length;
    const configuredCount = results.filter((r) => r.status !== "unconfigured").length;

    return NextResponse.json({
      success: true,
      data: {
        results,
        summary: {
          total: results.length,
          healthy: healthyCount,
          configured: configuredCount,
          overallStatus: healthyCount === configuredCount && configuredCount > 0 ? "healthy" : 
                        healthyCount > 0 ? "degraded" : "unhealthy",
        },
        checkedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Health check error:", error);
    return NextResponse.json(
      { success: false, error: { message: "健康检测失败" } },
      { status: 500 }
    );
  }
}


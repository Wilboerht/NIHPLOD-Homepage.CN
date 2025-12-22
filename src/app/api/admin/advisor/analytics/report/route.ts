/**
 * AI 用户画像分析报告 API
 * POST /api/admin/advisor/analytics/report
 *
 * 调用 AI 对用户行为统计数据进行分析，生成用户画像和分布分析报告
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { getAISettings, getApiKeyForProvider } from "@/lib/ai";

// 服务商 API 配置
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

function getAnthropicApiUrl(): string {
  return process.env.ANTHROPIC_API_URL || "https://api.anthropic.com/v1/messages";
}

function getGeminiApiUrl(model: string): string {
  const baseUrl = process.env.GEMINI_API_URL || "https://generativelanguage.googleapis.com/v1beta";
  return `${baseUrl}/models/${model}:generateContent`;
}

// 系统提示词
const REPORT_SYSTEM_PROMPT = `你是一位严谨的数据分析师。你只能基于用户提供的真实数据进行分析，绝对不能编造任何数据或做出没有数据支撑的推测。

## 核心原则（必须严格遵守）

1. **只用真实数据**：报告中引用的每一个数字都必须来自用户提供的数据，不能编造
2. **不做无根据推测**：不要推测"可能"、"或许"的情况，只陈述数据显示的事实
3. **数据量少时要诚实**：如果样本量太小（如<10），要明确指出数据量不足，结论仅供参考
4. **不要夸大**：用客观、中性的语言描述数据，避免过度解读
5. **承认局限**：如果某项数据缺失或为0，直接说明"暂无数据"

## 报告格式（Markdown）

### 📊 数据摘要
用1-2句话概括：总会话数、完成率、面部扫描使用率等核心指标。

### 👤 用户特征
根据问卷数据，列出：
- 肤质分布（列出前3名及占比）
- 年龄分布（列出前3名及占比）
- 预算偏好（列出前3名及占比）
- 主要护肤诉求（列出前3名及占比）

每项都要标注具体数字和百分比，如果数据不足就写"数据不足"。

### 📱 行为数据
- 设备分布：移动端 vs 桌面端占比
- 转化漏斗：从开始到完成的各步骤流失情况
- 面部扫描：使用率和跳过率

### 💡 观察与建议
基于上述数据，给出2-3条具体、可执行的建议。每条建议必须引用具体数据作为依据。

## 禁止事项
- 不要编造用户反馈或评价
- 不要假设用户的心理或动机
- 不要预测未来趋势（除非有时间序列数据）
- 不要使用"据调查显示"、"研究表明"等外部引用
- 不要添加数据中没有的信息`;

// 调用 AI 生成报告
async function generateReport(
  provider: string,
  apiKey: string,
  model: string,
  dataPrompt: string
): Promise<string> {
  const maxTokens = 2000;
  const temperature = 0.3; // 低温度，减少幻觉，输出更确定

  console.log(`[AI Report] Using provider: ${provider}, model: ${model}`);

  // OpenAI、DeepSeek、通义千问 使用 OpenAI 兼容 API
  if (provider === "openai" || provider === "deepseek" || provider === "qwen") {
    const baseUrl = getOpenAICompatibleBaseUrl(provider);
    console.log(`[AI Report] API URL: ${baseUrl}/chat/completions`);

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: REPORT_SYSTEM_PROMPT },
            { role: "user", content: dataPrompt },
          ],
          max_tokens: maxTokens,
          temperature,
        }),
        signal: AbortSignal.timeout(60000), // 60秒超时
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`AI API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      return data.choices[0]?.message?.content || "";
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new Error(`${provider} API 请求超时，请稍后重试`);
      }
      if (error instanceof Error && error.message.includes("ECONNRESET")) {
        throw new Error(`无法连接到 ${provider} API 服务器，请检查网络连接`);
      }
      throw error;
    }
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
        max_tokens: maxTokens,
        temperature,
        system: REPORT_SYSTEM_PROMPT,
        messages: [{ role: "user", content: dataPrompt }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.content[0]?.text || "";
  }

  // Google Gemini
  if (provider === "gemini") {
    const geminiModel = model || "gemini-2.0-flash";
    const url = `${getGeminiApiUrl(geminiModel)}?key=${apiKey}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          { role: "user", parts: [{ text: `${REPORT_SYSTEM_PROMPT}\n\n${dataPrompt}` }] },
        ],
        generationConfig: { maxOutputTokens: maxTokens, temperature },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  }

  throw new Error(`Unsupported AI provider: ${provider}`);
}

// 构建数据提示词
function buildDataPrompt(analyticsData: AnalyticsData): string {
  const { overview, funnel, answerDistribution, deviceDistribution, dateRange } = analyticsData;

  // 格式化答案分布
  const formatDistribution = (dist: Record<string, number>): string => {
    const total = Object.values(dist).reduce((a, b) => a + b, 0);
    return Object.entries(dist)
      .sort((a, b) => b[1] - a[1])
      .map(([key, value]) => `${key}: ${value} (${((value / total) * 100).toFixed(1)}%)`)
      .join(", ");
  };

  return `请根据以下用户行为统计数据生成分析报告：

## 数据时间范围
${dateRange?.start ? new Date(dateRange.start).toLocaleDateString() : "未知"} ~ ${dateRange?.end ? new Date(dateRange.end).toLocaleDateString() : "未知"}

## 核心指标
- 总会话数: ${overview.totalSessions}
- 完成会话数: ${overview.completedSessions}
- 整体转化率: ${(overview.conversionRate * 100).toFixed(1)}%
- 面部扫描使用: ${overview.faceScanUsed} 次
- 面部扫描跳过: ${overview.faceScanSkipped} 次
- 面部扫描使用率: ${(overview.faceScanRate * 100).toFixed(1)}%
- AI 分析次数: ${overview.aiAnalysisCount}
- 规则降级次数: ${overview.fallbackAnalysisCount}
- AI 使用率: ${(overview.aiUsageRate * 100).toFixed(1)}%
- 总分享次数: ${overview.totalShares}

## 转化漏斗
1. 开始会话: ${funnel.started}
2. 完成问卷: ${funnel.completedQuestionnaire}
3. 开始面部扫描: ${funnel.startedFaceScan}
4. 完成面部扫描: ${funnel.completedFaceScan}
5. 跳过面部扫描: ${funnel.skippedFaceScan}
6. 完成分析: ${funnel.completedAnalysis}
7. 查看结果: ${funnel.viewedResult}
8. 分享结果: ${funnel.shared}

## 用户画像数据

### 肤质分布
${answerDistribution.skinType ? formatDistribution(answerDistribution.skinType) : "无数据"}

### 主要护肤诉求
${answerDistribution.primaryConcern ? formatDistribution(answerDistribution.primaryConcern) : "无数据"}

### 年龄段分布
${answerDistribution.ageRange ? formatDistribution(answerDistribution.ageRange) : "无数据"}

### 护肤习惯
${answerDistribution.currentRoutine ? formatDistribution(answerDistribution.currentRoutine) : "无数据"}

### 成分敏感情况
${answerDistribution.allergies ? formatDistribution(answerDistribution.allergies) : "无数据"}

### 消费预算
${answerDistribution.budget ? formatDistribution(answerDistribution.budget) : "无数据"}

### 特殊时期
${answerDistribution.pregnancyStatus ? formatDistribution(answerDistribution.pregnancyStatus) : "无数据"}

### 用药经历
${answerDistribution.medicationHistory ? formatDistribution(answerDistribution.medicationHistory) : "无数据"}

## 设备分布
- 移动端: ${deviceDistribution.mobile} 次
- 桌面端: ${deviceDistribution.desktop} 次
- 平板: ${deviceDistribution.tablet} 次

---

请严格基于以上数据生成分析报告。注意：
1. 只使用上面提供的数据，不要编造任何数字
2. 如果某项数据为0或"无数据"，直接说明暂无该数据
3. 样本量只有 ${overview.totalSessions} 个会话，如果数量少于10请特别说明结论仅供参考
4. 每个结论都要引用具体数据支撑`;
}

// 类型定义
interface AnalyticsData {
  overview: {
    totalSessions: number;
    completedSessions: number;
    conversionRate: number;
    faceScanUsed: number;
    faceScanSkipped: number;
    faceScanRate: number;
    aiAnalysisCount: number;
    fallbackAnalysisCount: number;
    aiUsageRate: number;
    totalShares: number;
  };
  funnel: {
    started: number;
    completedQuestionnaire: number;
    startedFaceScan: number;
    completedFaceScan: number;
    skippedFaceScan: number;
    completedAnalysis: number;
    viewedResult: number;
    shared: number;
  };
  answerDistribution: Record<string, Record<string, number>>;
  deviceDistribution: {
    desktop: number;
    mobile: number;
    tablet: number;
  };
  dateRange?: {
    start: string;
    end: string;
  };
}

export async function POST(request: NextRequest) {
  // 验证管理员身份
  const admin = await verifyAuth(request);
  if (!admin) {
    return NextResponse.json(
      { success: false, error: { message: "未授权访问" } },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const analyticsData = body.analyticsData as AnalyticsData;

    if (!analyticsData) {
      return NextResponse.json(
        { success: false, error: { message: "缺少分析数据" } },
        { status: 400 }
      );
    }

    // 获取 AI 设置
    const settings = await getAISettings();
    const provider = settings.provider || "deepseek";
    const model = settings.model || "deepseek-chat";
    const apiKey = getApiKeyForProvider(provider);

    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: { message: `未配置 ${provider} API Key` } },
        { status: 500 }
      );
    }

    // 构建数据提示词
    const dataPrompt = buildDataPrompt(analyticsData);

    // 调用 AI 生成报告
    const report = await generateReport(provider, apiKey, model, dataPrompt);

    return NextResponse.json({
      success: true,
      data: {
        report,
        provider,
        model,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Report generation error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          message: error instanceof Error ? error.message : "生成报告失败",
        },
      },
      { status: 500 }
    );
  }
}

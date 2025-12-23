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
const REPORT_SYSTEM_PROMPT = `你是一位资深的数据分析师，负责分析 NIHPLOD 旎柏护肤品牌的用户行为数据。

## 核心原则（必须严格遵守）

1. **只用提供的数据**：所有数字、百分比必须直接引用输入数据，禁止编造任何数值
2. **客观陈述事实**：用"数据显示..."、"从数据看..."开头，不用"表现优异"、"成绩斐然"等主观评价
3. **承认数据局限**：样本量<50时必须注明"样本量较小，结论仅供参考"
4. **不做过度推断**：如果数据不足以支撑某个结论，直接说明"现有数据无法判断"
5. **建议要具体可行**：每条建议必须可量化、可执行、有明确责任方

## 报告结构

## 数据概览
用2-3句话客观陈述：
- 本周期内的会话总量和完成量
- 整体转化率的具体数值
- 最突出的一个数据特征（正面或负面均可）

## 用户画像

### 肤质分布
- 按占比从高到低列出，格式：肤质类型 X人（XX.X%）
- 指出占比最高的群体是什么
- 如果某类占比异常高或低，客观指出

### 年龄分布
- 同上格式列出
- 说明主力年龄段

### 消费预算
- 列出各档位分布
- 说明用户消费意愿集中在哪个区间

### 核心诉求
- 列出TOP3护肤诉求及占比

## 转化漏斗分析

### 各环节数据
按顺序列出每个环节的人数和相对上一环节的流失率：
1. 开始会话 → 完成问卷：流失率XX.X%
2. 完成问卷 → 开始扫描：流失率XX.X%
3. ...依此类推

### 关键发现
- 指出流失最严重的环节及其流失率
- 如果面部扫描跳过率高，说明具体数值
- 不要猜测原因，只陈述数据事实

## 设备分布
- 移动端占比XX.X%，桌面端占比XX.X%
- 客观说明主要访问场景

## 待改进项
列出3条基于数据的改进方向，每条必须：
1. 引用具体数据作为依据
2. 说明要改进什么
3. 给出可量化的目标

格式示例：
- **问卷完成率提升**：当前从开始到完成问卷流失XX.X%，建议优化问卷长度，目标将流失率降至XX%以下

## 数据局限性说明
诚实说明当前数据的局限：
- 样本量是否足够
- 哪些维度数据缺失
- 哪些结论需要更多数据验证

---

## 禁止事项
- 禁止使用"优秀"、"出色"、"良好"、"不错"等主观评价词
- 禁止编造任何数字
- 禁止说"建议加大投入"、"建议优化体验"等空话
- 禁止过度解读数据背后的原因
- 禁止给出没有数据支撑的建议`;

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

  // 计算漏斗流失率
  const calcDropRate = (from: number, to: number): string => {
    if (from === 0) return "N/A";
    const rate = ((from - to) / from * 100).toFixed(1);
    return `${rate}%`;
  };

  // 计算设备总数和占比
  const totalDevices = deviceDistribution.mobile + deviceDistribution.desktop + deviceDistribution.tablet;
  const mobilePercent = totalDevices > 0 ? ((deviceDistribution.mobile / totalDevices) * 100).toFixed(1) : "0";
  const desktopPercent = totalDevices > 0 ? ((deviceDistribution.desktop / totalDevices) * 100).toFixed(1) : "0";

  return `# NIHPLOD 智能护肤顾问 - 用户数据分析

## 分析周期
${dateRange?.start ? new Date(dateRange.start).toLocaleDateString("zh-CN") : "未知"} 至 ${dateRange?.end ? new Date(dateRange.end).toLocaleDateString("zh-CN") : "未知"}

---

## 一、核心业务指标

| 指标 | 数值 | 说明 |
|------|------|------|
| 总会话数 | ${overview.totalSessions} | 用户访问护肤顾问的总次数 |
| 完成会话数 | ${overview.completedSessions} | 完整完成测评流程的会话 |
| **整体转化率** | **${(overview.conversionRate * 100).toFixed(1)}%** | 完成/总会话 |
| 面部扫描参与 | ${overview.faceScanUsed}次使用 / ${overview.faceScanSkipped}次跳过 | 参与率 ${(overview.faceScanRate * 100).toFixed(1)}% |
| AI分析调用 | ${overview.aiAnalysisCount}次成功 / ${overview.fallbackAnalysisCount}次降级 | AI使用率 ${(overview.aiUsageRate * 100).toFixed(1)}% |
| 结果分享 | ${overview.totalShares}次 | 用户主动分享行为 |

---

## 二、转化漏斗详情

| 步骤 | 人数 | 环节流失率 | 累计转化率 |
|------|------|------------|------------|
| 1. 开始会话 | ${funnel.started} | - | 100% |
| 2. 完成问卷 | ${funnel.completedQuestionnaire} | ${calcDropRate(funnel.started, funnel.completedQuestionnaire)} | ${funnel.started > 0 ? ((funnel.completedQuestionnaire / funnel.started) * 100).toFixed(1) : 0}% |
| 3. 开始面部扫描 | ${funnel.startedFaceScan} | ${calcDropRate(funnel.completedQuestionnaire, funnel.startedFaceScan)} | ${funnel.started > 0 ? ((funnel.startedFaceScan / funnel.started) * 100).toFixed(1) : 0}% |
| 4. 完成/跳过扫描 | ${funnel.completedFaceScan + funnel.skippedFaceScan} | (完成${funnel.completedFaceScan}/跳过${funnel.skippedFaceScan}) | - |
| 5. 完成分析 | ${funnel.completedAnalysis} | ${calcDropRate(funnel.startedFaceScan, funnel.completedAnalysis)} | ${funnel.started > 0 ? ((funnel.completedAnalysis / funnel.started) * 100).toFixed(1) : 0}% |
| 6. 查看结果 | ${funnel.viewedResult} | ${calcDropRate(funnel.completedAnalysis, funnel.viewedResult)} | ${funnel.started > 0 ? ((funnel.viewedResult / funnel.started) * 100).toFixed(1) : 0}% |
| 7. 分享结果 | ${funnel.shared} | - | ${funnel.viewedResult > 0 ? ((funnel.shared / funnel.viewedResult) * 100).toFixed(1) : 0}%（分享率） |

---

## 三、用户画像数据

> 注：问卷完成人数为${funnel.completedQuestionnaire}人，以下用户画像数据均基于此样本量。

### 肤质分布
${answerDistribution.skinType ? formatDistribution(answerDistribution.skinType) : "暂无数据"}

### 年龄结构
${answerDistribution.ageRange ? formatDistribution(answerDistribution.ageRange) : "暂无数据"}

### 核心护肤诉求
${answerDistribution.primaryConcern ? formatDistribution(answerDistribution.primaryConcern) : "暂无数据"}

### 消费预算偏好
${answerDistribution.budget ? formatDistribution(answerDistribution.budget) : "暂无数据"}

### 护肤习惯成熟度
${answerDistribution.currentRoutine ? formatDistribution(answerDistribution.currentRoutine) : "暂无数据"}

### 成分敏感情况
${answerDistribution.allergies ? formatDistribution(answerDistribution.allergies) : "暂无数据"}

### 特殊生理期
${answerDistribution.pregnancyStatus ? formatDistribution(answerDistribution.pregnancyStatus) : "暂无数据"}

### 医美/用药史
${answerDistribution.medicationHistory ? formatDistribution(answerDistribution.medicationHistory) : "暂无数据"}

---

## 四、设备与渠道

| 设备类型 | 访问量 | 占比 |
|----------|--------|------|
| 移动端 | ${deviceDistribution.mobile} | ${mobilePercent}% |
| 桌面端 | ${deviceDistribution.desktop} | ${desktopPercent}% |
| 平板 | ${deviceDistribution.tablet} | ${totalDevices > 0 ? ((deviceDistribution.tablet / totalDevices) * 100).toFixed(1) : 0}% |

---

## 重要提醒

1. **样本量**：${overview.totalSessions}个会话${overview.totalSessions < 30 ? "，样本量较小，所有结论仅供参考，请在报告中明确说明" : overview.totalSessions < 100 ? "，样本量中等，部分结论可能存在偏差" : ""}
2. **数据完整性**：如某项显示"暂无数据"，在报告中如实说明"该维度暂无数据"
3. **禁止编造**：报告中出现的所有数字必须能在上述数据中找到原始来源
4. **客观表述**：用"数据显示"、"从数据看"开头，不用"表现优秀"、"成绩良好"等评价词
5. **具体建议**：每条建议必须引用具体数据，说明要做什么、目标是什么

请严格按照系统提示词中定义的报告结构生成报告。`;
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

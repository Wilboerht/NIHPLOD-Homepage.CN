/**
 * AI 分析报告流式输出 API
 * POST /api/admin/advisor/analytics/report/stream
 *
 * 使用 SSE 实现报告边生成边显示
 */

import { NextRequest } from "next/server";
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

// 系统提示词 (与非流式版本相同)
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

// 构建数据提示词
function buildDataPrompt(analyticsData: AnalyticsData): string {
  const { overview, funnel, answerDistribution, deviceDistribution, dateRange } = analyticsData;

  const formatDistribution = (dist: Record<string, number>): string => {
    const total = Object.values(dist).reduce((a, b) => a + b, 0);
    return Object.entries(dist)
      .sort((a, b) => b[1] - a[1])
      .map(([key, value]) => `${key}: ${value} (${((value / total) * 100).toFixed(1)}%)`)
      .join(", ");
  };

  const calcDropRate = (from: number, to: number): string => {
    if (from === 0) return "N/A";
    const rate = ((from - to) / from * 100).toFixed(1);
    return `${rate}%`;
  };

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

---

## 四、设备分布

| 设备类型 | 访问量 | 占比 |
|----------|--------|------|
| 移动端 | ${deviceDistribution.mobile} | ${mobilePercent}% |
| 桌面端 | ${deviceDistribution.desktop} | ${desktopPercent}% |
| 平板 | ${deviceDistribution.tablet} | ${totalDevices > 0 ? ((deviceDistribution.tablet / totalDevices) * 100).toFixed(1) : 0}% |

---

请严格按照系统提示词中定义的报告结构生成报告。`;
}

export async function POST(request: NextRequest) {
  // 验证管理员身份
  const admin = await verifyAuth(request);
  if (!admin) {
    return new Response(JSON.stringify({ error: "未授权访问" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = await request.json();
    const analyticsData = body.analyticsData as AnalyticsData;

    if (!analyticsData) {
      return new Response(JSON.stringify({ error: "缺少分析数据" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 获取 AI 设置
    const settings = await getAISettings();
    const provider = settings.provider || "deepseek";
    const model = settings.model || "deepseek-chat";
    const apiKey = getApiKeyForProvider(provider);

    if (!apiKey) {
      return new Response(JSON.stringify({ error: `未配置 ${provider} API Key` }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 构建数据提示词
    const dataPrompt = buildDataPrompt(analyticsData);

    // 创建流式响应
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // 仅支持 OpenAI 兼容 API 的流式输出
          if (provider === "openai" || provider === "deepseek" || provider === "qwen") {
            const baseUrl = getOpenAICompatibleBaseUrl(provider);
            
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
                max_tokens: 2000,
                temperature: 0.3,
                stream: true,
              }),
            });

            if (!response.ok) {
              const errorText = await response.text();
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: errorText })}\n\n`));
              controller.close();
              return;
            }

            const reader = response.body?.getReader();
            if (!reader) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "无法获取响应流" })}\n\n`));
              controller.close();
              return;
            }

            const decoder = new TextDecoder();
            let buffer = "";

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() || "";

              for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith("data: ")) {
                  const data = trimmed.slice(6);
                  if (data === "[DONE]") {
                    controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                    continue;
                  }
                  try {
                    const parsed = JSON.parse(data);
                    const content = parsed.choices?.[0]?.delta?.content;
                    if (content) {
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
                    }
                  } catch {
                    // 忽略解析错误
                  }
                }
              }
            }
          } else {
            // 不支持流式输出的 provider，返回错误
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: `${provider} 暂不支持流式输出` })}\n\n`));
          }
        } catch (error) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: error instanceof Error ? error.message : "未知错误" })}\n\n`));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "生成报告失败" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}


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
const REPORT_SYSTEM_PROMPT = `你是 NIHPLOD 旎柏护肤品牌的增长策略顾问，擅长从数据中发现业务机会。

## 你的任务
分析护肤顾问功能的用户行为数据，输出一份**精炼、有洞察、可执行**的分析报告。

## 核心原则
1. **少即是多**：不要罗列数据，只提炼关键发现
2. **洞察优先**：告诉我"这意味着什么"，而非"数据是什么"
3. **聚焦行动**：每个发现都要指向具体可做的事

---

## 报告结构（严格按此输出）

## 📊 核心指标速览
用一个简洁的表格展示3-4个最关键的指标：
| 指标 | 数值 | 解读 |
简短说明当前业务健康度（1-2句话）。

## 🔍 关键发现
提炼**2-3个**最重要的发现，每个发现包含：
- **发现**：一句话描述现象
- **影响**：这对业务意味着什么
- **机会**：可以如何利用或改进

不要面面俱到，只说最重要的。优先关注：
- 转化漏斗中流失最严重的环节
- 用户画像中的突出特征（如某类用户占比异常高）
- 与上期对比的显著变化

## 🎯 行动建议
给出**2-3条**具体可执行的建议，按优先级排序：

### 立即执行（本周）
- 具体动作 + 预期效果

### 短期规划（本月）
- 具体动作 + 预期效果

每条建议必须：
1. 基于数据发现
2. 具体到可以分配给人执行
3. 有明确的成功标准

## 💡 业务洞察
基于用户画像数据，给出1-2条产品或营销层面的洞察：
- 目标用户是谁？他们的核心需求是什么？
- 有什么潜在的业务机会？

---

## 禁止事项
- ❌ 不要逐项复述所有数据
- ❌ 不要用"建议优化用户体验"这类空话
- ❌ 不要编造数据
- ❌ 不要给出没有数据支撑的建议

## 输出要求
- 语言简洁有力，避免冗长
- 多用表格、列表，少用大段文字
- 总长度控制在500字以内`;

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

// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

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


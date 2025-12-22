/**
 * AI 顾问系统监控 API (管理后台)
 * GET /api/admin/advisor/monitoring
 *
 * 返回系统健康状态、AI 服务状态、错误率等监控数据
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth";
import { getAISettings } from "@/lib/ai";

// 获取日期范围
function getDateRange(range: string): { start: Date; end: Date } {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  let start: Date;

  switch (range) {
    case "1hour":
      start = new Date(now.getTime() - 60 * 60 * 1000);
      return { start, end: now };
    case "today":
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case "7days":
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
      break;
    case "30days":
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
      break;
    default:
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  return { start, end };
}

export async function GET(request: NextRequest) {
  // 验证管理员身份
  const admin = await verifyAuth(request);
  if (!admin) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
      { status: 401 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const range = searchParams.get("range") || "today";
    const { start, end } = getDateRange(range);

    // 1. 获取 AI 设置
    const aiSettings = await getAISettings();

    // 2. 检查 API Keys 配置状态
    const apiKeyStatus = {
      openai: !!(aiSettings.apiKeys?.openai || process.env.OPENAI_API_KEY),
      deepseek: !!(aiSettings.apiKeys?.deepseek || process.env.DEEPSEEK_API_KEY),
      qwen: !!(aiSettings.apiKeys?.qwen || process.env.QWEN_API_KEY),
      anthropic: !!(aiSettings.apiKeys?.anthropic || process.env.ANTHROPIC_API_KEY),
    };

    // 当前使用的服务商是否有配置 API Key
    const textProviderConfigured = apiKeyStatus[aiSettings.provider as keyof typeof apiKeyStatus] ?? false;
    const visionProviderConfigured = apiKeyStatus[aiSettings.visionProvider as keyof typeof apiKeyStatus] ?? false;

    // 3. 获取分析统计
    const [
      totalAnalysis,
      aiAnalysis,
      fallbackAnalysis,
      completedAnalysis,
      faceScanUsed,
    ] = await Promise.all([
      prisma.advisorSession.count({
        where: { createdAt: { gte: start, lte: end }, analysisStartedAt: { not: null } },
      }),
      prisma.advisorSession.count({
        where: { createdAt: { gte: start, lte: end }, analysisSource: "ai" },
      }),
      prisma.advisorSession.count({
        where: { createdAt: { gte: start, lte: end }, analysisSource: "fallback" },
      }),
      prisma.advisorSession.count({
        where: { createdAt: { gte: start, lte: end }, analysisCompletedAt: { not: null } },
      }),
      prisma.advisorSession.count({
        where: { createdAt: { gte: start, lte: end }, faceScanUsed: true },
      }),
    ]);

    // 4. 计算成功率
    const aiSuccessRate = totalAnalysis > 0 ? (aiAnalysis / totalAnalysis) : 0;
    const fallbackRate = totalAnalysis > 0 ? (fallbackAnalysis / totalAnalysis) : 0;
    const completionRate = totalAnalysis > 0 ? (completedAnalysis / totalAnalysis) : 0;

    // 5. 获取最近的分析记录（用于显示最近活动）
    const recentSessions = await prisma.advisorSession.findMany({
      where: { createdAt: { gte: start, lte: end }, analysisStartedAt: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        sessionId: true,
        createdAt: true,
        analysisSource: true,
        analysisCompletedAt: true,
        faceScanUsed: true,
        deviceType: true,
      },
    });

    // 6. 按小时分组的分析数量（最近24小时）
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const hourlyData = await prisma.advisorSession.findMany({
      where: { createdAt: { gte: last24Hours }, analysisStartedAt: { not: null } },
      select: { createdAt: true, analysisSource: true },
    });

    const hourlyStats: Record<string, { ai: number; fallback: number }> = {};
    for (let i = 0; i < 24; i++) {
      const hour = new Date(Date.now() - i * 60 * 60 * 1000);
      const hourKey = hour.toISOString().slice(0, 13);
      hourlyStats[hourKey] = { ai: 0, fallback: 0 };
    }

    hourlyData.forEach((session) => {
      const hourKey = session.createdAt.toISOString().slice(0, 13);
      if (hourlyStats[hourKey]) {
        if (session.analysisSource === "ai") {
          hourlyStats[hourKey].ai++;
        } else {
          hourlyStats[hourKey].fallback++;
        }
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        // 服务状态
        serviceStatus: {
          textProvider: aiSettings.provider,
          textModel: aiSettings.model,
          textProviderConfigured,
          visionProvider: aiSettings.visionProvider,
          visionModel: aiSettings.visionModel,
          visionProviderConfigured,
          apiKeyStatus,
          overallHealth: textProviderConfigured && visionProviderConfigured ? "healthy" : "degraded",
        },
        // 分析统计
        analysisStats: {
          total: totalAnalysis,
          ai: aiAnalysis,
          fallback: fallbackAnalysis,
          completed: completedAnalysis,
          faceScanUsed,
          aiSuccessRate,
          fallbackRate,
          completionRate,
        },
        // 最近活动
        recentActivity: recentSessions.map((s) => ({
          id: s.id,
          sessionId: s.sessionId.slice(0, 8) + "...",
          time: s.createdAt.toISOString(),
          source: s.analysisSource,
          completed: !!s.analysisCompletedAt,
          hasFaceScan: s.faceScanUsed,
          device: s.deviceType || "unknown",
        })),
        // 24小时趋势
        hourlyTrend: Object.entries(hourlyStats)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([hour, stats]) => ({
            hour: hour.slice(11) + ":00",
            ai: stats.ai,
            fallback: stats.fallback,
          })),
        // 查询时间范围
        dateRange: { start: start.toISOString(), end: end.toISOString() },
      },
    });
  } catch (error) {
    console.error("Monitoring query error:", error);
    return NextResponse.json(
      { success: false, error: { message: "查询失败" } },
      { status: 500 }
    );
  }
}


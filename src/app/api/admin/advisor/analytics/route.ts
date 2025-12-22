/**
 * AI 顾问统计数据查询 API (管理后台)
 * GET /api/admin/advisor/analytics
 * 
 * 查询统计数据，支持日期范围筛选
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth";

// 获取日期范围
function getDateRange(range: string): { start: Date; end: Date } {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  let start: Date;
  
  switch (range) {
    case "today":
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case "yesterday":
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      end.setDate(end.getDate() - 1);
      break;
    case "7days":
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
      break;
    case "30days":
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
      break;
    case "90days":
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 89);
      break;
    default:
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
  }
  
  return { start, end };
}

export async function GET(request: NextRequest) {
  // 验证管理员身份
  const admin = await verifyAuth(request);
  if (!admin) {
    return NextResponse.json(
      { success: false, error: { message: "未授权访问" } },
      { status: 401 }
    );
  }
  
  try {
    const { searchParams } = new URL(request.url);
    const range = searchParams.get("range") || "7days";
    const { start, end } = getDateRange(range);
    
    // 1. 获取总体统计
    const [
      totalSessions,
      completedSessions,
      faceScanUsed,
      faceScanSkipped,
      aiAnalysis,
      fallbackAnalysis,
      sharedResults,
    ] = await Promise.all([
      // 总会话数
      prisma.advisorSession.count({
        where: { createdAt: { gte: start, lte: end } },
      }),
      // 完成的会话数（到达结果页）
      prisma.advisorSession.count({
        where: { 
          createdAt: { gte: start, lte: end },
          completedAt: { not: null },
        },
      }),
      // 使用面扫的会话数
      prisma.advisorSession.count({
        where: { 
          createdAt: { gte: start, lte: end },
          faceScanUsed: true,
        },
      }),
      // 跳过面扫的会话数
      prisma.advisorSession.count({
        where: { 
          createdAt: { gte: start, lte: end },
          faceScanSkipped: true,
        },
      }),
      // AI分析次数
      prisma.advisorSession.count({
        where: { 
          createdAt: { gte: start, lte: end },
          analysisSource: "ai",
        },
      }),
      // 降级分析次数
      prisma.advisorSession.count({
        where: { 
          createdAt: { gte: start, lte: end },
          analysisSource: "fallback",
        },
      }),
      // 分享次数
      prisma.advisorSession.count({
        where: { 
          createdAt: { gte: start, lte: end },
          resultShared: true,
        },
      }),
    ]);
    
    // 2. 计算转化率
    const conversionRate = totalSessions > 0
      ? completedSessions / totalSessions
      : 0;

    const faceScanRate = (faceScanUsed + faceScanSkipped) > 0
      ? faceScanUsed / (faceScanUsed + faceScanSkipped)
      : 0;

    // AI 使用率
    const totalAnalysis = aiAnalysis + fallbackAnalysis;
    const aiUsageRate = totalAnalysis > 0 ? aiAnalysis / totalAnalysis : 0;
    
    // 3. 获取漏斗数据
    const [
      startedQuestionnaire,
      completedQuestionnaire,
      startedFaceScan,
      completedAnalysis,
      viewedResult,
    ] = await Promise.all([
      prisma.advisorSession.count({
        where: { 
          createdAt: { gte: start, lte: end },
          questionnaireStartedAt: { not: null },
        },
      }),
      prisma.advisorSession.count({
        where: { 
          createdAt: { gte: start, lte: end },
          questionnaireCompletedAt: { not: null },
        },
      }),
      prisma.advisorSession.count({
        where: { 
          createdAt: { gte: start, lte: end },
          faceScanStartedAt: { not: null },
        },
      }),
      prisma.advisorSession.count({
        where: { 
          createdAt: { gte: start, lte: end },
          analysisCompletedAt: { not: null },
        },
      }),
      prisma.advisorSession.count({
        where: { 
          createdAt: { gte: start, lte: end },
          resultViewedAt: { not: null },
        },
      }),
    ]);
    
    // 4. 获取每日趋势数据
    // 辅助函数：将 Date 转为本地日期字符串 YYYY-MM-DD
    const toLocalDateKey = (date: Date): string => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };

    // 查询时间范围内创建的会话（用于 sessions 计数）
    const sessionsCreated = await prisma.advisorSession.findMany({
      where: { createdAt: { gte: start, lte: end } },
      select: {
        createdAt: true,
        faceScanUsed: true,
        faceScanSkipped: true,
        answers: true,
        deviceType: true,
      },
    });

    // 查询时间范围内完成的会话（用于 completed 计数，按 completedAt 日期）
    const sessionsCompleted = await prisma.advisorSession.findMany({
      where: { completedAt: { gte: start, lte: end } },
      select: {
        completedAt: true,
      },
    });

    // 按日期分组
    const dailyData: Record<string, {
      date: string;
      sessions: number;
      completed: number;
      faceScanUsed: number;
      faceScanSkipped: number;
    }> = {};

    // 初始化日期（使用本地时间）
    const currentDate = new Date(start);
    while (currentDate <= end) {
      const dateKey = toLocalDateKey(currentDate);
      dailyData[dateKey] = {
        date: dateKey,
        sessions: 0,
        completed: 0,
        faceScanUsed: 0,
        faceScanSkipped: 0,
      };
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // 填充会话开始数据（按 createdAt 本地日期）
    sessionsCreated.forEach((session) => {
      const dateKey = toLocalDateKey(new Date(session.createdAt));
      if (dailyData[dateKey]) {
        dailyData[dateKey].sessions++;
        if (session.faceScanUsed) dailyData[dateKey].faceScanUsed++;
        if (session.faceScanSkipped) dailyData[dateKey].faceScanSkipped++;
      }
    });

    // 填充会话完成数据（按 completedAt 本地日期）
    sessionsCompleted.forEach((session) => {
      if (session.completedAt) {
        const dateKey = toLocalDateKey(new Date(session.completedAt));
        if (dailyData[dateKey]) {
          dailyData[dateKey].completed++;
        }
      }
    });
    
    // 5. 问卷答案分布（覆盖所有8道问卷题目）
    const answerDistribution: Record<string, Record<string, number>> = {
      skinType: {},
      primaryConcern: {},
      ageRange: {},
      currentRoutine: {},
      allergies: {},
      budget: {},
      pregnancyStatus: {},
      medicationHistory: {},
    };

    // 多选题字段列表（这些字段的值可能是逗号分隔的多选值）
    const multipleChoiceFields = ["primaryConcern"];

    sessionsCreated.forEach((session) => {
      if (session.answers && typeof session.answers === "object") {
        const answers = session.answers as Record<string, string | string[]>;
        Object.keys(answerDistribution).forEach((key) => {
          const answer = answers[key];
          if (answer) {
            // 处理多选题：可能是数组或逗号分隔的字符串
            if (multipleChoiceFields.includes(key)) {
              // 获取选项数组
              let options: string[] = [];
              if (Array.isArray(answer)) {
                options = answer;
              } else if (typeof answer === "string" && answer.includes(",")) {
                options = answer.split(",").map(v => v.trim());
              } else if (typeof answer === "string") {
                options = [answer];
              }
              // 每个选项分别计数
              options.forEach((opt) => {
                if (opt) {
                  answerDistribution[key][opt] = (answerDistribution[key][opt] || 0) + 1;
                }
              });
            } else {
              // 单选题：直接计数
              const value = typeof answer === "string" ? answer : String(answer);
              answerDistribution[key][value] = (answerDistribution[key][value] || 0) + 1;
            }
          }
        });
      }
    });

    // 6. 设备分布
    const deviceDistribution: Record<string, number> = {
      desktop: 0,
      mobile: 0,
      tablet: 0,
    };

    sessionsCreated.forEach((session) => {
      if (session.deviceType && deviceDistribution[session.deviceType] !== undefined) {
        deviceDistribution[session.deviceType]++;
      }
    });
    
    return NextResponse.json({
      success: true,
      data: {
        // 概览数据 - 字段名与前端 AnalyticsData.overview 对应
        overview: {
          totalSessions,
          completedSessions,
          conversionRate,
          faceScanUsed,
          faceScanSkipped,
          faceScanRate,
          aiAnalysisCount: aiAnalysis,
          fallbackAnalysisCount: fallbackAnalysis,
          aiUsageRate,
          totalShares: sharedResults,
        },
        // 漏斗数据 - 字段名与前端 AnalyticsData.funnel 对应
        funnel: {
          started: totalSessions,
          completedQuestionnaire,
          startedFaceScan,
          completedFaceScan: faceScanUsed,
          skippedFaceScan: faceScanSkipped,
          completedAnalysis,
          viewedResult,
          shared: sharedResults,
        },
        // 每日趋势
        daily: Object.values(dailyData).sort((a, b) => a.date.localeCompare(b.date)),
        // 答案分布
        answerDistribution,
        // 设备分布
        deviceDistribution,
        // 查询时间范围
        dateRange: { start: start.toISOString(), end: end.toISOString() },
      },
    });
    
  } catch (error) {
    console.error("Analytics query error:", error);
    return NextResponse.json(
      { success: false, error: { message: "查询失败" } },
      { status: 500 }
    );
  }
}


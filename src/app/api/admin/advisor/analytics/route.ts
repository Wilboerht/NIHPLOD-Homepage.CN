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
  const authResult = await verifyAuth(request);
  if (!authResult || !authResult.success) {
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
      ? ((completedSessions / totalSessions) * 100).toFixed(1)
      : "0";
    
    const faceScanRate = (faceScanUsed + faceScanSkipped) > 0
      ? ((faceScanUsed / (faceScanUsed + faceScanSkipped)) * 100).toFixed(1)
      : "0";
    
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
    const sessions = await prisma.advisorSession.findMany({
      where: { createdAt: { gte: start, lte: end } },
      select: {
        createdAt: true,
        completedAt: true,
        faceScanUsed: true,
        faceScanSkipped: true,
        answers: true,
        deviceType: true,
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
    
    // 初始化日期
    const currentDate = new Date(start);
    while (currentDate <= end) {
      const dateKey = currentDate.toISOString().split("T")[0];
      dailyData[dateKey] = {
        date: dateKey,
        sessions: 0,
        completed: 0,
        faceScanUsed: 0,
        faceScanSkipped: 0,
      };
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    // 填充数据
    sessions.forEach((session) => {
      const dateKey = session.createdAt.toISOString().split("T")[0];
      if (dailyData[dateKey]) {
        dailyData[dateKey].sessions++;
        if (session.completedAt) dailyData[dateKey].completed++;
        if (session.faceScanUsed) dailyData[dateKey].faceScanUsed++;
        if (session.faceScanSkipped) dailyData[dateKey].faceScanSkipped++;
      }
    });
    
    // 5. 问卷答案分布
    const answerDistribution: Record<string, Record<string, number>> = {
      skinType: {},
      primaryConcern: {},
      ageRange: {},
      currentRoutine: {},
      budget: {},
    };
    
    sessions.forEach((session) => {
      if (session.answers && typeof session.answers === "object") {
        const answers = session.answers as Record<string, string>;
        Object.keys(answerDistribution).forEach((key) => {
          if (answers[key]) {
            answerDistribution[key][answers[key]] = 
              (answerDistribution[key][answers[key]] || 0) + 1;
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
    
    sessions.forEach((session) => {
      if (session.deviceType && deviceDistribution[session.deviceType] !== undefined) {
        deviceDistribution[session.deviceType]++;
      }
    });
    
    return NextResponse.json({
      success: true,
      data: {
        // 概览数据
        overview: {
          totalSessions,
          completedSessions,
          conversionRate: parseFloat(conversionRate),
          faceScanUsed,
          faceScanSkipped,
          faceScanRate: parseFloat(faceScanRate),
          aiAnalysis,
          fallbackAnalysis,
          sharedResults,
        },
        // 漏斗数据
        funnel: {
          started: totalSessions,
          startedQuestionnaire,
          completedQuestionnaire,
          startedFaceScan,
          completedOrSkippedFaceScan: faceScanUsed + faceScanSkipped,
          completedAnalysis,
          viewedResult,
          sharedResult: sharedResults,
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


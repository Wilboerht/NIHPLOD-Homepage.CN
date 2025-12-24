/**
 * AI 顾问统计数据查询 API (管理后台)
 * GET /api/admin/advisor/analytics
 *
 * 查询统计数据，支持日期范围筛选和同期对比
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth";

// 获取日期范围及上周期范围
function getDateRange(range: string): {
  start: Date;
  end: Date;
  prevStart: Date;
  prevEnd: Date;
  daysCount: number;
} {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  let start: Date;
  let daysCount: number;

  switch (range) {
    case "today":
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      daysCount = 1;
      break;
    case "yesterday":
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      end.setDate(end.getDate() - 1);
      daysCount = 1;
      break;
    case "7days":
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
      daysCount = 7;
      break;
    case "30days":
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
      daysCount = 30;
      break;
    case "90days":
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 89);
      daysCount = 90;
      break;
    default:
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
      daysCount = 7;
  }

  // 计算上周期时间范围
  const prevEnd = new Date(start);
  prevEnd.setMilliseconds(-1); // start 的前一毫秒
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - daysCount + 1);
  prevStart.setHours(0, 0, 0, 0);

  return { start, end, prevStart, prevEnd, daysCount };
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
    const { start, end, prevStart, prevEnd } = getDateRange(range);

    // 1. 获取当前周期和上周期总体统计
    const [
      totalSessions,
      completedSessions,
      faceScanUsed,
      faceScanSkipped,
      aiAnalysis,
      fallbackAnalysis,
      sharedResults,
      // 上周期数据
      prevTotalSessions,
      prevCompletedSessions,
      prevFaceScanUsed,
      prevFaceScanSkipped,
      prevAiAnalysis,
      prevFallbackAnalysis,
      prevSharedResults,
    ] = await Promise.all([
      // 当前周期 - 总会话数
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
      // 上周期 - 总会话数
      prisma.advisorSession.count({
        where: { createdAt: { gte: prevStart, lte: prevEnd } },
      }),
      // 上周期 - 完成的会话数
      prisma.advisorSession.count({
        where: {
          createdAt: { gte: prevStart, lte: prevEnd },
          completedAt: { not: null },
        },
      }),
      // 上周期 - 使用面扫的会话数
      prisma.advisorSession.count({
        where: {
          createdAt: { gte: prevStart, lte: prevEnd },
          faceScanUsed: true,
        },
      }),
      // 上周期 - 跳过面扫的会话数
      prisma.advisorSession.count({
        where: {
          createdAt: { gte: prevStart, lte: prevEnd },
          faceScanSkipped: true,
        },
      }),
      // 上周期 - AI分析次数
      prisma.advisorSession.count({
        where: {
          createdAt: { gte: prevStart, lte: prevEnd },
          analysisSource: "ai",
        },
      }),
      // 上周期 - 降级分析次数
      prisma.advisorSession.count({
        where: {
          createdAt: { gte: prevStart, lte: prevEnd },
          analysisSource: "fallback",
        },
      }),
      // 上周期 - 分享次数
      prisma.advisorSession.count({
        where: {
          createdAt: { gte: prevStart, lte: prevEnd },
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

    // 计算上周期各项比率
    const prevConversionRate = prevTotalSessions > 0
      ? prevCompletedSessions / prevTotalSessions
      : 0;
    const prevFaceScanRate = (prevFaceScanUsed + prevFaceScanSkipped) > 0
      ? prevFaceScanUsed / (prevFaceScanUsed + prevFaceScanSkipped)
      : 0;
    const prevTotalAnalysis = prevAiAnalysis + prevFallbackAnalysis;
    const prevAiUsageRate = prevTotalAnalysis > 0 ? prevAiAnalysis / prevTotalAnalysis : 0;

    // 计算同期变化率的辅助函数
    const calcChange = (current: number, previous: number): number | null => {
      if (previous === 0) return current > 0 ? 100 : null; // 上期为0，本期有值则显示+100%
      return ((current - previous) / previous) * 100;
    };
    
    // 3. 获取漏斗数据
    const [
      _startedQuestionnaire,
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
        ip: true,
        province: true, // 省份（用于地图展示）
        city: true,     // 城市
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

    // 7. 时段分布（按小时统计）
    const hourlyDistribution: Record<string, number> = {};
    for (let i = 0; i < 24; i++) {
      hourlyDistribution[String(i).padStart(2, "0")] = 0;
    }

    sessionsCreated.forEach((session) => {
      const hour = String(session.createdAt.getHours()).padStart(2, "0");
      hourlyDistribution[hour]++;
    });

    // 7.1 周热力图数据（按星期几 × 小时统计）
    // 结构: { "0": { "00": 5, "01": 3, ... }, "1": {...}, ... }
    // 键 "0"-"6" 代表周日到周六
    const weeklyHeatmap: Record<string, Record<string, number>> = {};
    for (let day = 0; day < 7; day++) {
      weeklyHeatmap[String(day)] = {};
      for (let hour = 0; hour < 24; hour++) {
        weeklyHeatmap[String(day)][String(hour).padStart(2, "0")] = 0;
      }
    }

    sessionsCreated.forEach((session) => {
      const dayOfWeek = session.createdAt.getDay(); // 0 = 周日, 1 = 周一, ...
      const hour = String(session.createdAt.getHours()).padStart(2, "0");
      weeklyHeatmap[String(dayOfWeek)][hour]++;
    });

    // 8. 省份地域分布（用于中国地图展示）
    // 中国省份列表（用于判断是否为中国地区）
    const CHINA_PROVINCES = new Set([
      "北京", "天津", "河北", "山西", "内蒙古",
      "辽宁", "吉林", "黑龙江",
      "上海", "江苏", "浙江", "安徽", "福建", "江西", "山东",
      "河南", "湖北", "湖南", "广东", "广西", "海南",
      "重庆", "四川", "贵州", "云南", "西藏",
      "陕西", "甘肃", "青海", "宁夏", "新疆",
      "台湾", "香港", "澳门",
    ]);

    const provinceDistribution: Record<string, number> = {};
    let unknownRegionCount = 0; // 无法识别地区
    let overseasCount = 0; // 海外地区（province 有值但不在中国省份列表中）

    sessionsCreated.forEach((session) => {
      if (session.province) {
        // 清理省份名称（去除"省"、"市"等后缀）
        const cleanProvince = session.province.replace(/(省|市|自治区|特别行政区|壮族自治区|回族自治区|维吾尔自治区)$/g, "");

        if (CHINA_PROVINCES.has(cleanProvince) || CHINA_PROVINCES.has(session.province)) {
          const normalizedProvince = CHINA_PROVINCES.has(cleanProvince) ? cleanProvince : session.province;
          provinceDistribution[normalizedProvince] = (provinceDistribution[normalizedProvince] || 0) + 1;
        } else {
          // 有值但不是中国省份，可能是海外
          overseasCount++;
        }
      } else {
        // 没有省份信息，归类为未知地区
        unknownRegionCount++;
      }
    });

    // 将省份分布转换为数组并按数量排序
    const provinceStats = Object.entries(provinceDistribution)
      .map(([province, count]) => ({ province, count }))
      .sort((a, b) => b.count - a.count);

    // 9. 城市分布（可选，用于详细统计）
    const cityDistribution: Record<string, number> = {};

    sessionsCreated.forEach((session) => {
      if (session.city) {
        const cityKey = session.province ? `${session.province}-${session.city}` : session.city;
        cityDistribution[cityKey] = (cityDistribution[cityKey] || 0) + 1;
      }
    });

    // 城市分布取前 20
    const topCities = Object.entries(cityDistribution)
      .map(([city, count]) => ({ city, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

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
        // 同期对比数据
        comparison: {
          totalSessionsChange: calcChange(totalSessions, prevTotalSessions),
          completedSessionsChange: calcChange(completedSessions, prevCompletedSessions),
          conversionRateChange: calcChange(conversionRate, prevConversionRate),
          faceScanRateChange: calcChange(faceScanRate, prevFaceScanRate),
          aiUsageRateChange: calcChange(aiUsageRate, prevAiUsageRate),
          totalSharesChange: calcChange(sharedResults, prevSharedResults),
          // 上周期原始数据
          prev: {
            totalSessions: prevTotalSessions,
            completedSessions: prevCompletedSessions,
            conversionRate: prevConversionRate,
            faceScanUsed: prevFaceScanUsed,
            faceScanSkipped: prevFaceScanSkipped,
            faceScanRate: prevFaceScanRate,
            aiAnalysisCount: prevAiAnalysis,
            fallbackAnalysisCount: prevFallbackAnalysis,
            aiUsageRate: prevAiUsageRate,
            totalShares: prevSharedResults,
          },
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
        // 时段分布（24小时）
        hourlyDistribution,
        // 周热力图数据（7天 × 24小时）
        weeklyHeatmap,
        // 省份地域分布（用于中国地图）
        provinceDistribution: provinceStats,
        // 其他地区（海外 + 未知）
        otherRegions: {
          overseas: overseasCount,    // 海外地区
          unknown: unknownRegionCount, // 未知地区（IP解析失败等）
          total: overseasCount + unknownRegionCount,
        },
        // 城市分布（前20）
        cityDistribution: topCities,
        // 查询时间范围
        dateRange: {
          start: start.toISOString(),
          end: end.toISOString(),
          prevStart: prevStart.toISOString(),
          prevEnd: prevEnd.toISOString(),
        },
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


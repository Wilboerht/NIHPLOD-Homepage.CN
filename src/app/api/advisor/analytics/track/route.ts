/**
 * AI 顾问行为追踪 API
 * POST /api/advisor/analytics/track
 * 
 * 记录用户在顾问流程中的各种行为事件
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { resolveIPLocation } from "@/lib/geoip";

// 事件类型定义
const EventSchema = z.object({
  sessionId: z.string().min(1, "会话ID必填"),
  event: z.enum([
    "session_start",           // 会话开始（进入欢迎页）
    "questionnaire_start",     // 开始答题
    "questionnaire_complete",  // 完成问卷
    "face_scan_start",         // 开始面部扫描
    "face_scan_complete",      // 完成面部扫描
    "face_scan_skip",          // 跳过面部扫描
    "analysis_start",          // 开始分析
    "analysis_complete",       // 分析完成
    "result_view",             // 查看结果
    "result_share",            // 分享结果
  ]),
  data: z.record(z.string(), z.unknown()).optional(), // 附加数据
  timestamp: z.string().optional(),
});

type _TrackEvent = z.infer<typeof EventSchema>;

// IP 脱敏处理（隐藏最后一段）
function anonymizeIP(ip: string): string {
  if (ip === "unknown") return ip;

  // IPv4: 192.168.1.100 -> 192.168.1.xxx
  if (ip.includes(".")) {
    const parts = ip.split(".");
    if (parts.length === 4) {
      parts[3] = "xxx";
      return parts.join(".");
    }
  }

  // IPv6: 简化处理，只保留前三段
  if (ip.includes(":")) {
    const parts = ip.split(":");
    if (parts.length > 3) {
      return parts.slice(0, 3).join(":") + ":xxx";
    }
  }

  return ip;
}

// 获取客户端信息
function getClientInfo(request: NextRequest) {
  const userAgent = request.headers.get("user-agent") || "";
  const rawIP = request.headers.get("x-forwarded-for")?.split(",")[0].trim()
    || request.headers.get("x-real-ip")
    || "unknown";
  const referer = request.headers.get("referer") || "";

  // 先用原始 IP 解析地理位置（必须在脱敏前）
  const geoLocation = resolveIPLocation(rawIP);

  // 然后再脱敏处理 IP 地址用于存储
  const ip = anonymizeIP(rawIP);

  // 解析设备类型
  let deviceType = "desktop";
  if (/mobile/i.test(userAgent)) {
    deviceType = "mobile";
  } else if (/tablet|ipad/i.test(userAgent)) {
    deviceType = "tablet";
  }

  // 解析浏览器
  let browser = "unknown";
  if (/chrome/i.test(userAgent) && !/edge/i.test(userAgent)) {
    browser = "chrome";
  } else if (/safari/i.test(userAgent) && !/chrome/i.test(userAgent)) {
    browser = "safari";
  } else if (/firefox/i.test(userAgent)) {
    browser = "firefox";
  } else if (/edge/i.test(userAgent)) {
    browser = "edge";
  } else if (/msie|trident/i.test(userAgent)) {
    browser = "ie";
  }

  // 解析操作系统
  let os = "unknown";
  if (/windows/i.test(userAgent)) {
    os = "windows";
  } else if (/macintosh|mac os/i.test(userAgent)) {
    os = "macos";
  } else if (/linux/i.test(userAgent)) {
    os = "linux";
  } else if (/android/i.test(userAgent)) {
    os = "android";
  } else if (/iphone|ipad|ipod/i.test(userAgent)) {
    os = "ios";
  }

  // 返回客户端信息，包括地理位置
  return { userAgent, ip, referer, deviceType, browser, os, geoLocation };
}

// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = EventSchema.safeParse(body);
    
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: { message: "参数错误", details: result.error.issues } },
        { status: 400 }
      );
    }
    
    const { sessionId, event, data } = result.data;
    const clientInfo = getClientInfo(request);
    const now = new Date();
    
    // 根据事件类型更新会话记录
    switch (event) {
      case "session_start": {
        // 创建或更新会话（地理位置已在 getClientInfo 中解析）
        await prisma.advisorSession.upsert({
          where: { sessionId },
          create: {
            sessionId,
            startedAt: now,
            userAgent: clientInfo.userAgent,
            ip: clientInfo.ip,
            province: clientInfo.geoLocation.province,
            city: clientInfo.geoLocation.city,
            referrer: clientInfo.referer,
            deviceType: clientInfo.deviceType,
            browser: clientInfo.browser,
            os: clientInfo.os,
            fingerprint: (data?.fingerprint as string) || null,
            utmSource: (data?.utm_source as string) || null,
            utmMedium: (data?.utm_medium as string) || null,
            utmCampaign: (data?.utm_campaign as string) || null,
          },
          update: {
            // 会话已存在时不更新
          },
        });
        break;
      }
      
      case "questionnaire_start": {
        await prisma.advisorSession.update({
          where: { sessionId },
          data: { questionnaireStartedAt: now },
        });
        break;
      }
      
      case "questionnaire_complete": {
        await prisma.advisorSession.update({
          where: { sessionId },
          data: {
            questionnaireCompletedAt: now,
            answers: data?.answers ? data.answers as Prisma.InputJsonValue : Prisma.JsonNull,
          },
        });
        break;
      }
      
      case "face_scan_start": {
        await prisma.advisorSession.update({
          where: { sessionId },
          data: { faceScanStartedAt: now },
        });
        break;
      }
      
      case "face_scan_complete": {
        await prisma.advisorSession.update({
          where: { sessionId },
          data: { 
            faceScanCompletedAt: now,
            faceScanUsed: true,
            faceScanSkipped: false,
          },
        });
        break;
      }
      
      case "face_scan_skip": {
        await prisma.advisorSession.update({
          where: { sessionId },
          data: { 
            faceScanSkipped: true,
            faceScanUsed: false,
          },
        });
        break;
      }
      
      case "analysis_start": {
        await prisma.advisorSession.update({
          where: { sessionId },
          data: { analysisStartedAt: now },
        });
        break;
      }
      
      case "analysis_complete": {
        await prisma.advisorSession.update({
          where: { sessionId },
          data: { 
            analysisCompletedAt: now,
            analysisSource: (data?.source as string) || null,
          },
        });
        break;
      }
      
      case "result_view": {
        await prisma.advisorSession.update({
          where: { sessionId },
          data: { 
            resultViewedAt: now,
            completedAt: now,
          },
        });
        break;
      }
      
      case "result_share": {
        await prisma.advisorSession.update({
          where: { sessionId },
          data: { 
            resultShared: true,
            shareMethod: (data?.method as string) || null,
          },
        });
        break;
      }
    }
    
    return NextResponse.json({ success: true });
    
  } catch (error) {
    console.error("Analytics track error:", error);
    
    // 对于分析API，即使出错也返回200，不影响用户体验
    return NextResponse.json({ success: true });
  }
}


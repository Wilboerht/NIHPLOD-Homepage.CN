/**
 * POST /api/lottery/enter - 参与抽奖
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getClientIP } from "@/lib/ratelimit";
import {
  hashPhone,
  encryptPhone,
  isValidPhone,
  calculateRiskScore,
  type RiskFactors,
} from "@/lib/lottery";

// 花朵数据 Schema
const FlowerDataSchema = z.object({
  colors: z.array(z.string()), // 使用的颜色列表
  strokeCount: z.number(),     // 笔画数
  duration: z.number(),        // 绘制时长（毫秒）
  complexity: z.number(),      // 复杂度评分 0-100
});

// 请求参数校验
const EnterSchema = z.object({
  activityId: z.string().min(1, "活动ID不能为空"),
  phone: z.string().refine(isValidPhone, "请输入正确的手机号"),
  drawingDataUrl: z.string().min(1, "请画一朵花"),
  drawingType: z.enum(["flower", "signature"]).default("flower"),
  flowerData: FlowerDataSchema,
  deviceId: z.string().min(1, "设备ID不能为空"),
  sessionId: z.string().optional(),
  inviteCode: z.string().optional(), // 邀请码（从分享链接获取）
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = EnterSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: validated.error.issues[0]?.message || "参数错误" } },
        { status: 400 }
      );
    }

    const { activityId, phone, drawingDataUrl, drawingType, flowerData, deviceId, sessionId, inviteCode } = validated.data;
    const ip = getClientIP(request);

    // 1. 检查活动是否存在且有效
    const activity = await prisma.lotteryActivity.findUnique({
      where: { id: activityId },
    });

    if (!activity) {
      return NextResponse.json(
        { success: false, error: { code: "ACTIVITY_NOT_FOUND", message: "活动不存在" } },
        { status: 404 }
      );
    }

    const now = new Date();
    if (activity.status !== "active") {
      return NextResponse.json(
        { success: false, error: { code: "ACTIVITY_NOT_ACTIVE", message: "活动未开始或已结束" } },
        { status: 400 }
      );
    }

    if (now < activity.startTime) {
      return NextResponse.json(
        { success: false, error: { code: "ACTIVITY_NOT_STARTED", message: "活动尚未开始" } },
        { status: 400 }
      );
    }

    if (now > activity.endTime) {
      return NextResponse.json(
        { success: false, error: { code: "ACTIVITY_ENDED", message: "活动已结束" } },
        { status: 400 }
      );
    }

    // 2. 检查是否已参与（同一活动同一手机号）
    const phoneHash = hashPhone(phone);
    const existingEntry = await prisma.lotteryEntry.findUnique({
      where: {
        activityId_phoneHash: {
          activityId,
          phoneHash,
        },
      },
    });

    if (existingEntry) {
      return NextResponse.json(
        { success: false, error: { code: "ALREADY_ENTERED", message: "您已参与过本次活动" } },
        { status: 400 }
      );
    }

    // 3. 计算风控评分
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 查询同 IP 今日参与次数
    const ipEntryCount = await prisma.lotteryEntry.count({
      where: {
        activityId,
        ip,
        createdAt: { gte: today },
      },
    });

    // 查询同设备参与次数（本活动）
    const deviceEntryCount = await prisma.lotteryEntry.count({
      where: {
        activityId,
        deviceId,
      },
    });

    const riskFactors: RiskFactors = {
      phone,
      ip,
      deviceId,
      signatureComplexity: flowerData.complexity,
      signatureStrokeCount: flowerData.strokeCount,
      signatureDuration: flowerData.duration,
      ipEntryCount,
      deviceEntryCount,
    };

    const riskResult = calculateRiskScore(riskFactors);

    // 4. 上传画作图片（这里简化处理，直接存 base64，生产环境应上传到 OSS）
    // TODO: 实现画作图片上传到 OSS
    const drawingUrl = drawingDataUrl;

    // 5. 获取当前花园花朵数量，用于计算花朵在花园中的初始位置
    const currentFlowerCount = await prisma.lotteryEntry.count({
      where: { activityId },
    });

    // 为花朵生成随机位置和旋转（用于花园展示）
    const flowerDisplayData = {
      ...flowerData,
      // 花园中的位置 (0-100 百分比)
      posX: Math.random() * 80 + 10, // 10-90%
      posY: Math.random() * 80 + 10,
      scale: 0.8 + Math.random() * 0.4, // 0.8-1.2
      rotation: Math.random() * 30 - 15, // -15 到 15 度
      zIndex: currentFlowerCount, // 层级
    };

    // 6. 验证邀请码（如果有）
    let validInviteCode: string | null = null;
    if (inviteCode) {
      // 检查邀请码是否存在且属于本活动
      const inviter = await prisma.lotteryEntry.findFirst({
        where: {
          inviteCode,
          activityId,
        },
        select: { id: true, inviteCode: true, phoneHash: true },
      });

      // 邀请码有效且不是自己邀请自己
      if (inviter && inviter.phoneHash !== phoneHash) {
        validInviteCode = inviteCode;
      }
    }

    // 7. 创建参与记录
    const entry = await prisma.lotteryEntry.create({
      data: {
        activityId,
        phone: encryptPhone(phone),
        phoneHash,
        drawingUrl,
        drawingType,
        flowerData: flowerDisplayData,
        sessionId,
        ip,
        deviceId,
        riskScore: riskResult.score,
        riskFactors: riskResult.factors,
        signatureData: flowerData, // 兼容旧字段
        invitedBy: validInviteCode, // 记录被谁邀请
      },
    });

    // 8. 如果有有效邀请码，给邀请者加权重
    if (validInviteCode) {
      await prisma.lotteryEntry.updateMany({
        where: {
          inviteCode: validInviteCode,
          activityId,
        },
        data: {
          inviteCount: { increment: 1 },
          bonusWeight: { increment: 10 }, // 每邀请1人 +10 权重
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        entryId: entry.id,
        inviteCode: entry.inviteCode, // 返回用户的专属邀请码
        drawTime: activity.drawTime,
        flowerCount: currentFlowerCount + 1,
        message: validInviteCode
          ? "您的花朵已加入花园！邀请好友已获得中奖率加成"
          : "您的花朵已加入花园！分享给好友可提高中奖率",
      },
    });
  } catch (error) {
    console.error("参与抽奖失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "系统繁忙，请稍后再试" } },
      { status: 500 }
    );
  }
}


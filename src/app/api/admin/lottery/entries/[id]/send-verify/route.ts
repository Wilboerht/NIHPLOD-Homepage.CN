/**
 * 管理端 - 发送验证短信给中奖者
 * POST /api/admin/lottery/entries/[id]/send-verify
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth";
import { decryptPhone, generateVerifyCode, hashVerifyCode } from "@/lib/lottery";
import { sendSMS } from "@/lib/sms";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
        { status: 401 }
      );
    }

    const { id: entryId } = await params;

    // 获取参与记录
    const entry = await prisma.lotteryEntry.findUnique({
      where: { id: entryId },
      include: { activity: true },
    });

    if (!entry) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "记录不存在" } },
        { status: 404 }
      );
    }

    if (entry.status !== "won") {
      return NextResponse.json(
        { success: false, error: { code: "NOT_WINNER", message: "该用户未中奖" } },
        { status: 400 }
      );
    }

    // 检查是否已发送过验证码（5分钟内不重复发送）
    if (entry.verifyCodeSentAt) {
      const timeDiff = Date.now() - entry.verifyCodeSentAt.getTime();
      if (timeDiff < 5 * 60 * 1000) {
        const remainingSeconds = Math.ceil((5 * 60 * 1000 - timeDiff) / 1000);
        return NextResponse.json(
          { success: false, error: { code: "TOO_FREQUENT", message: `请 ${remainingSeconds} 秒后再试` } },
          { status: 429 }
        );
      }
    }

    // 生成验证码
    const code = generateVerifyCode();
    const hashedCode = hashVerifyCode(code);

    // 解密手机号
    const phone = decryptPhone(entry.phone);

    // 发送短信
    const smsResult = await sendSMS({
      phone,
      template: "LOTTERY_VERIFY",
      params: {
        code,
        activityName: entry.activity.name,
        prizeName: entry.activity.prizeName,
      },
    });

    if (!smsResult.success) {
      return NextResponse.json(
        { success: false, error: { code: "SMS_FAILED", message: smsResult.error || "短信发送失败" } },
        { status: 500 }
      );
    }

    // 更新记录
    await prisma.lotteryEntry.update({
      where: { id: entryId },
      data: {
        verifyCode: hashedCode,
        verifyCodeSentAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      message: "验证码已发送",
    });
  } catch (error) {
    console.error("发送验证短信失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "发送失败" } },
      { status: 500 }
    );
  }
}


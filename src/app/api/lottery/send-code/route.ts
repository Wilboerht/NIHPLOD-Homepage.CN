/**
 * 发送验证码 API
 * POST /api/lottery/send-code
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";

// 简单的验证码存储（实际应使用 Redis）
const codeStore = new Map<string, { code: string; expires: number }>();

const RequestSchema = z.object({
  phone: z.string().regex(/^1[3-9]\d{9}$/, "请输入正确的手机号"),
  entryId: z.string(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = RequestSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: validated.error.errors[0]?.message } },
        { status: 400 }
      );
    }

    const { phone, entryId } = validated.data;

    // 验证中奖记录
    const entry = await prisma.lotteryEntry.findUnique({
      where: { id: entryId },
    });

    if (!entry || !entry.isWinner) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_WINNER", message: "无效的领奖链接" } },
        { status: 403 }
      );
    }

    // 验证手机号是否匹配
    if (entry.phone !== phone) {
      return NextResponse.json(
        { success: false, error: { code: "PHONE_MISMATCH", message: "手机号与参与时不一致" } },
        { status: 400 }
      );
    }

    // 检查发送频率
    const cacheKey = `lottery_code_${phone}`;
    const existing = codeStore.get(cacheKey);
    if (existing && existing.expires > Date.now() - 55000) {
      return NextResponse.json(
        { success: false, error: { code: "TOO_FREQUENT", message: "发送太频繁，请稍后再试" } },
        { status: 429 }
      );
    }

    // 生成6位验证码
    const code = Math.random().toString().slice(2, 8);

    // 存储验证码（5分钟有效）
    codeStore.set(cacheKey, {
      code,
      expires: Date.now() + 5 * 60 * 1000,
    });

    // TODO: 实际发送短信
    // await sendSMS(phone, `【NIHPLOD】您的验证码是 ${code}，5分钟内有效。`);

    console.log(`[验证码] ${phone}: ${code}`);

    return NextResponse.json({
      success: true,
      data: { message: "验证码已发送" },
    });
  } catch (error) {
    console.error("发送验证码失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "发送失败" } },
      { status: 500 }
    );
  }
}

// 导出验证函数供其他路由使用
export function verifyCode(phone: string, code: string): boolean {
  const cacheKey = `lottery_code_${phone}`;
  const stored = codeStore.get(cacheKey);

  if (!stored) return false;
  if (stored.expires < Date.now()) {
    codeStore.delete(cacheKey);
    return false;
  }

  if (stored.code === code) {
    codeStore.delete(cacheKey); // 验证成功后删除
    return true;
  }

  return false;
}


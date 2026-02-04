/**
 * 验证手机号 API
 * POST /api/lottery/verify
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";

// 简单的验证码存储引用
const codeStore = new Map<string, { code: string; expires: number }>();

const RequestSchema = z.object({
  phone: z.string().regex(/^1[3-9]\d{9}$/, "请输入正确的手机号"),
  code: z.string().length(6, "请输入6位验证码"),
  entryId: z.string(),
});

// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = RequestSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: validated.error.issues[0]?.message } },
        { status: 400 }
      );
    }

    const { phone, code, entryId } = validated.data;

    // 验证中奖记录
    const entry = await prisma.lotteryEntry.findUnique({
      where: { id: entryId },
    });

    if (!entry || (entry.status !== "won" && entry.status !== "verified")) {
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

    // 验证验证码
    const cacheKey = `lottery_code_${phone}`;
    const stored = codeStore.get(cacheKey);

    // 开发环境允许使用固定验证码
    const isValidCode = 
      (stored && stored.expires > Date.now() && stored.code === code) ||
      (process.env.NODE_ENV === "development" && code === "123456");

    if (!isValidCode) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_CODE", message: "验证码错误或已过期" } },
        { status: 400 }
      );
    }

    // 验证成功，删除验证码
    codeStore.delete(cacheKey);

    return NextResponse.json({
      success: true,
      data: { message: "验证成功" },
    });
  } catch (error) {
    console.error("验证失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "验证失败" } },
      { status: 500 }
    );
  }
}


/**
 * 手机号登录/注册 API
 * POST /api/auth/login
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { signUserToken, getTokenExpiresAt } from "@/lib/jwt";
import { USER_COOKIE_OPTIONS, USER_COOKIE_NAME } from "@/types/auth";
import { z } from "zod";

// 请求参数验证
const loginSchema = z.object({
  phone: z.string().regex(/^1[3-9]\d{9}$/, "请输入正确的手机号"),
  code: z.string().length(6, "验证码为6位数字"),
});

// 注册奖励点数
const REGISTER_BONUS_POINTS = 10;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // 参数验证
    const result = loginSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_PARAMS",
            message: result.error.issues[0]?.message || "参数错误",
          },
        },
        { status: 400 }
      );
    }

    const { phone, code } = result.data;

    // 查找验证码
    const smsCode = await prisma.smsCode.findFirst({
      where: {
        phone,
        type: "login",
        used: false,
        expiresAt: { gte: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!smsCode) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "CODE_EXPIRED",
            message: "验证码已过期或不存在",
          },
        },
        { status: 400 }
      );
    }

    // 验证码校验
    if (smsCode.code !== code) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "CODE_INVALID",
            message: "验证码错误",
          },
        },
        { status: 400 }
      );
    }

    // 标记验证码已使用
    await prisma.smsCode.update({
      where: { id: smsCode.id },
      data: { used: true },
    });

    // 查找或创建用户
    let user = await prisma.user.findUnique({
      where: { phone },
    });

    let isNewUser = false;

    if (!user) {
      // 新用户注册
      isNewUser = true;
      user = await prisma.user.create({
        data: {
          phone,
          phoneVerified: true,
          points: REGISTER_BONUS_POINTS,
          totalPoints: REGISTER_BONUS_POINTS,
        },
      });

      // 记录注册奖励点数
      await prisma.pointRecord.create({
        data: {
          userId: user.id,
          type: "REGISTER_BONUS",
          amount: REGISTER_BONUS_POINTS,
          balance: REGISTER_BONUS_POINTS,
          description: "新用户注册奖励",
        },
      });

      console.log(`[Login] 新用户注册: ${phone.slice(0, 3)}****${phone.slice(-4)}`);
    } else {
      // 更新手机验证状态
      if (!user.phoneVerified) {
        await prisma.user.update({
          where: { id: user.id },
          data: { phoneVerified: true },
        });
      }
      console.log(`[Login] 用户登录: ${phone.slice(0, 3)}****${phone.slice(-4)}`);
    }

    // 签发 Token
    const token = await signUserToken({
      id: user.id,
      phone: user.phone,
    });

    const expiresAt = getTokenExpiresAt(30);

    // 构建响应
    const response = NextResponse.json({
      success: true,
      data: {
        user: {
          id: user.id,
          phone: user.phone,
          nickname: user.nickname,
          avatar: user.avatar,
          points: user.points,
        },
        isNewUser,
        expiresAt,
      },
    });

    // 设置 Cookie
    response.cookies.set(USER_COOKIE_NAME, token, USER_COOKIE_OPTIONS);

    return response;
  } catch (error) {
    console.error("[Login] 异常:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "服务器错误",
        },
      },
      { status: 500 }
    );
  }
}


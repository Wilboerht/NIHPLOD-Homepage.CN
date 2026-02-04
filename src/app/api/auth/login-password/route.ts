/**
 * 手机号+密码登录 API
 * POST /api/auth/login-password
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { signUserToken, getTokenExpiresAt } from "@/lib/jwt";
import { verifyPassword } from "@/lib/password";
import { USER_COOKIE_OPTIONS, USER_COOKIE_NAME } from "@/types/auth";
import { z } from "zod";

// 请求参数验证
const loginSchema = z.object({
  phone: z.string().regex(/^1[3-9]\d{9}$/, "请输入正确的手机号"),
  password: z.string().min(6, "密码至少6位").max(32, "密码最多32位"),
});

// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

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

    const { phone, password } = result.data;

    // 查找用户
    const user = await prisma.user.findUnique({
      where: { phone },
    });

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "USER_NOT_FOUND",
            message: "用户不存在，请先注册",
          },
        },
        { status: 400 }
      );
    }

    // 检查是否设置了密码
    if (!user.password) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "PASSWORD_NOT_SET",
            message: "该账号未设置密码，请使用验证码登录后设置密码",
          },
        },
        { status: 400 }
      );
    }

    // 验证密码
    const isValid = await verifyPassword(password, user.password);
    if (!isValid) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "PASSWORD_INCORRECT",
            message: "密码错误",
          },
        },
        { status: 400 }
      );
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
        expiresAt,
      },
    });

    // 设置 Cookie
    response.cookies.set(USER_COOKIE_NAME, token, USER_COOKIE_OPTIONS);

    console.log(`[LoginPassword] 用户登录: ${phone.slice(0, 3)}****${phone.slice(-4)}`);

    return response;
  } catch (error) {
    console.error("[LoginPassword] 异常:", error);
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


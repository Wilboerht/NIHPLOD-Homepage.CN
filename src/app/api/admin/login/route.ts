import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { signToken } from "@/lib/jwt";
import { AdminLoginSchema } from "@/schemas/api";

// POST /api/admin/login - 管理员登录
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // 验证请求数据
    const result = AdminLoginSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "请求数据格式错误",
            details: result.error.issues,
          },
        },
        { status: 400 }
      );
    }

    const { email, password } = result.data;

    // 查找管理员
    const admin = await prisma.admin.findUnique({
      where: { email },
    });

    if (!admin) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_CREDENTIALS", message: "邮箱或密码错误" },
        },
        { status: 401 }
      );
    }

    // 验证密码
    const isPasswordValid = await bcrypt.compare(password, admin.password);
    if (!isPasswordValid) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_CREDENTIALS", message: "邮箱或密码错误" },
        },
        { status: 401 }
      );
    }

    // 生成 JWT token
    const token = await signToken({
      id: admin.id,
      email: admin.email,
      name: admin.name,
    });

    // 计算过期时间（7天）
    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;

    return NextResponse.json({
      success: true,
      data: {
        token,
        expiresAt,
        user: {
          id: admin.id,
          email: admin.email,
          name: admin.name,
        },
      },
    });
  } catch (error) {
    console.error("登录失败:", error);
    return NextResponse.json(
      {
        success: false,
        error: { code: "LOGIN_ERROR", message: "登录失败，请稍后重试" },
      },
      { status: 500 }
    );
  }
}

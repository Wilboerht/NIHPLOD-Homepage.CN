/**
 * 用户资料 API
 * GET /api/user/profile - 获取用户资料
 * PUT /api/user/profile - 更新用户资料
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyUserAuth } from "@/lib/auth";
import { z } from "zod";

// 更新参数验证
const updateSchema = z.object({
  nickname: z.string().max(20).optional(),
  avatar: z.string().url().optional().or(z.literal("")),
});

// GET - 获取用户资料
export async function GET(request: NextRequest) {
  try {
    // 验证用户身份
    const payload = await verifyUserAuth(request);

    if (!payload) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "请先登录",
          },
        },
        { status: 401 }
      );
    }

    // 获取用户资料
    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      select: {
        id: true,
        phone: true,
        nickname: true,
        avatar: true,
        points: true,
        totalPoints: true,
        createdAt: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "USER_NOT_FOUND",
            message: "用户不存在",
          },
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { user },
    });
  } catch (error) {
    console.error("[GetProfile] 异常:", error);
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

// PUT - 更新用户资料
export async function PUT(request: NextRequest) {
  try {
    // 验证用户身份
    const payload = await verifyUserAuth(request);
    
    if (!payload) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "请先登录",
          },
        },
        { status: 401 }
      );
    }

    const body = await request.json();
    
    // 参数验证
    const result = updateSchema.safeParse(body);
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

    const { nickname, avatar } = result.data;

    // 更新用户资料
    const user = await prisma.user.update({
      where: { id: payload.id },
      data: {
        ...(nickname !== undefined && { nickname: nickname || null }),
        ...(avatar !== undefined && { avatar: avatar || null }),
      },
      select: {
        id: true,
        phone: true,
        nickname: true,
        avatar: true,
        points: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: { user },
    });
  } catch (error) {
    console.error("[UpdateProfile] 异常:", error);
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


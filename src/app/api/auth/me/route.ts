/**
 * 当前用户信息 API
 * GET  /api/auth/me - 获取用户信息（含统计）
 * PUT  /api/auth/me - 更新用户信息
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withUserAuth } from "@/lib/auth";
import { apiConsole } from "@/lib/logger";

// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

export const GET = withUserAuth(async (request: NextRequest, payload) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      select: {
        id: true,
        phone: true,
        nickname: true,
        avatar: true,
        createdAt: true,
        _count: {
          select: {
            orders: true,
            addresses: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "USER_NOT_FOUND", message: "用户不存在" } },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: user.id,
          phone: user.phone,
          nickname: user.nickname,
          avatar: user.avatar,
          createdAt: user.createdAt,
          stats: {
            orderCount: user._count.orders,
            addressCount: user._count.addresses,
          },
        },
      },
    });
  } catch (error) {
    apiConsole.error("[GetMe] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
});

/**
 * PUT /api/auth/me - 更新用户信息（nickname, avatar）
 */
export const PUT = withUserAuth(async (request: NextRequest, payload) => {
  try {
    const body = await request.json();

    const updateData: Record<string, string> = {};
    if (body.nickname !== undefined) updateData.nickname = body.nickname;
    if (body.avatar !== undefined) updateData.avatar = body.avatar;
    if (body.name !== undefined && body.nickname === undefined) updateData.nickname = body.name;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: "没有可更新的字段" } },
        { status: 400 }
      );
    }

    const user = await prisma.user.update({
      where: { id: payload.id },
      data: updateData,
      select: { id: true, phone: true, nickname: true, avatar: true },
    });

    return NextResponse.json({
      success: true,
      data: { user: { id: user.id, phone: user.phone, nickname: user.nickname, avatar: user.avatar } },
    });
  } catch (error) {
    apiConsole.error("[PutMe] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "更新失败，请稍后重试" } },
      { status: 500 }
    );
  }
});


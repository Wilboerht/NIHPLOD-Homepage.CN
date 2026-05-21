/**
 * 单个地址操作 API
 * GET /api/user/addresses/:id - 获取地址详情
 * PUT /api/user/addresses/:id - 更新地址
 * DELETE /api/user/addresses/:id - 删除地址
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyUserAuth } from "@/lib/auth";
import { z } from "zod";
import { apiConsole } from "@/lib/logger";

type RouteContext = { params: Promise<{ id: string }> };

// 地址参数验证
const updateSchema = z.object({
  name: z.string().min(1).max(20).optional(),
  phone: z.string().regex(/^1[3-9]\d{9}$/).optional(),
  province: z.string().min(1).optional(),
  city: z.string().min(1).optional(),
  district: z.string().min(1).optional(),
  detail: z.string().min(1).max(200).optional(),
  isDefault: z.boolean().optional(),
});

// 获取地址详情
// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const payload = await verifyUserAuth(request);
    if (!payload) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "请先登录" } },
        { status: 401 }
      );
    }

    const { id } = await context.params;

    const address = await prisma.address.findFirst({
      where: { id, userId: payload.id },
    });

    if (!address) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "地址不存在" } },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: { address } });
  } catch (error) {
    apiConsole.error("[GetAddress] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

// 更新地址
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const payload = await verifyUserAuth(request);
    if (!payload) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "请先登录" } },
        { status: 401 }
      );
    }

    const { id } = await context.params;
    const body = await request.json();

    const result = updateSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: result.error.issues[0]?.message || "参数错误" } },
        { status: 400 }
      );
    }

    // 检查地址是否存在且属于当前用户
    const existing = await prisma.address.findFirst({
      where: { id, userId: payload.id },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "地址不存在" } },
        { status: 404 }
      );
    }

    const { isDefault, ...updateData } = result.data;

    // 如果设为默认，先取消其他默认地址
    if (isDefault) {
      await prisma.address.updateMany({
        where: { userId: payload.id, isDefault: true },
        data: { isDefault: false },
      });
    }

    const address = await prisma.address.update({
      where: { id },
      data: {
        ...updateData,
        ...(isDefault !== undefined && { isDefault }),
      },
    });

    return NextResponse.json({ success: true, data: { address } });
  } catch (error) {
    apiConsole.error("[UpdateAddress] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

// 删除地址
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const payload = await verifyUserAuth(request);
    if (!payload) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "请先登录" } },
        { status: 401 }
      );
    }

    const { id } = await context.params;

    // 检查地址是否存在且属于当前用户
    const existing = await prisma.address.findFirst({
      where: { id, userId: payload.id },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "地址不存在" } },
        { status: 404 }
      );
    }

    await prisma.address.delete({ where: { id } });

    // 如果删除的是默认地址，将最新的地址设为默认
    if (existing.isDefault) {
      const latest = await prisma.address.findFirst({
        where: { userId: payload.id },
        orderBy: { createdAt: "desc" },
      });
      if (latest) {
        await prisma.address.update({
          where: { id: latest.id },
          data: { isDefault: true },
        });
      }
    }

    return NextResponse.json({ success: true, data: { message: "地址已删除" } });
  } catch (error) {
    apiConsole.error("[DeleteAddress] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}


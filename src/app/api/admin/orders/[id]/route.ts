/**
 * 管理端订单详情 API
 * GET /api/admin/orders/:id
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth";
import { apiConsole } from "@/lib/logger";
import { validateCUID, invalidIdResponse } from "@/lib/validation";
import { z } from "zod";

const adminNoteSchema = z
  .object({
    adminNote: z.string().max(500).optional(),
  })
  .strict();

type RouteContext = { params: Promise<{ id: string }> };

// 强制动态渲染，禁止静态预渲染
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }

    const { id } = await context.params;

    if (!validateCUID(id)) {
      return invalidIdResponse();
    }

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, nickname: true, phone: true, avatar: true } },
        items: true,
        userCoupon: {
          include: { coupon: true },
        },
      },
    });

    if (!order) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "订单不存在" } },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { order },
    });
  } catch (error) {
    apiConsole.error("[AdminOrderDetail] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

// PATCH /api/admin/orders/:id - 更新订单部分字段（如管理备注）
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }

    const { id } = await context.params;
    if (!validateCUID(id)) {
      return invalidIdResponse();
    }

    const body = await request.json();

    const parsed = adminNoteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "VALIDATION_ERROR", message: "参数错误", details: parsed.error.issues },
        },
        { status: 400 }
      );
    }

    const updateData = parsed.data;
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: "无有效更新字段" } },
        { status: 400 }
      );
    }

    const order = await prisma.order.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      data: { order },
    });
  } catch (error) {
    apiConsole.error("[AdminOrderDetail] PATCH 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

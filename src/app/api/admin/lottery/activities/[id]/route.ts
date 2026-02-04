/**
 * 管理端 - 单个抽奖活动管理
 * GET /api/admin/lottery/activities/[id] - 获取活动详情
 * PUT /api/admin/lottery/activities/[id] - 更新活动
 * DELETE /api/admin/lottery/activities/[id] - 删除活动
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth";

// 更新活动参数校验
const UpdateActivitySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  prizeName: z.string().min(1).optional(),
  prizeImage: z.string().optional(),
  prizeCount: z.number().int().min(1).optional(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  drawTime: z.string().datetime().optional(),
  status: z.enum(["draft", "active", "drawing", "finished", "cancelled"]).optional(),
  rules: z.object({
    ipLimit: z.number().optional(),
    deviceLimit: z.number().optional(),
  }).optional(),
});

type Params = { params: Promise<{ id: string }> };

// GET - 获取活动详情
// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
        { status: 401 }
      );
    }

    const { id } = await params;

    const activity = await prisma.lotteryActivity.findUnique({
      where: { id },
      include: {
        _count: { select: { entries: true } },
      },
    });

    if (!activity) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "活动不存在" } },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        ...activity,
        entryCount: activity._count.entries,
      },
    });
  } catch (error) {
    console.error("获取活动详情失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "获取失败" } },
      { status: 500 }
    );
  }
}

// PUT - 更新活动
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
        { status: 401 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const validated = UpdateActivitySchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: validated.error.issues[0]?.message || "参数错误" } },
        { status: 400 }
      );
    }

    const { startTime, endTime, drawTime, ...rest } = validated.data;

    const updateData: Record<string, unknown> = { ...rest };
    if (startTime) updateData.startTime = new Date(startTime);
    if (endTime) updateData.endTime = new Date(endTime);
    if (drawTime) updateData.drawTime = new Date(drawTime);

    const activity = await prisma.lotteryActivity.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      data: activity,
    });
  } catch (error) {
    console.error("更新活动失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "更新失败" } },
      { status: 500 }
    );
  }
}

// DELETE - 删除活动
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
        { status: 401 }
      );
    }

    const { id } = await params;

    // 检查是否有参与记录
    const entryCount = await prisma.lotteryEntry.count({ where: { activityId: id } });
    if (entryCount > 0) {
      return NextResponse.json(
        { success: false, error: { code: "HAS_ENTRIES", message: `活动已有 ${entryCount} 人参与，无法删除` } },
        { status: 400 }
      );
    }

    await prisma.lotteryActivity.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("删除活动失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "删除失败" } },
      { status: 500 }
    );
  }
}


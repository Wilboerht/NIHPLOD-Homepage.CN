/**
 * 管理端 - 抽奖活动管理 API
 * GET /api/admin/lottery/activities - 获取活动列表
 * POST /api/admin/lottery/activities - 创建活动
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth";

// 创建活动参数校验
const CreateActivitySchema = z.object({
  name: z.string().min(1, "活动名称不能为空").max(100),
  description: z.string().optional(),
  prizeName: z.string().min(1, "奖品名称不能为空"),
  prizeImage: z.string().optional(),
  prizeCount: z.number().int().min(1, "奖品数量至少为1"),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  drawTime: z.string().datetime(),
  rules: z.object({
    ipLimit: z.number().optional(),
    deviceLimit: z.number().optional(),
  }).optional(),
});

// GET - 获取活动列表
// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "20");

    const where = status ? { status } : {};

    const [activities, total] = await Promise.all([
      prisma.lotteryActivity.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          _count: { select: { entries: true } },
        },
      }),
      prisma.lotteryActivity.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        items: activities.map((a) => ({
          ...a,
          entryCount: a._count.entries,
        })),
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      },
    });
  } catch (error) {
    console.error("获取活动列表失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "获取失败" } },
      { status: 500 }
    );
  }
}

// POST - 创建活动
export async function POST(request: NextRequest) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
        { status: 401 }
      );
    }

    const body = await request.json();
    const validated = CreateActivitySchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: validated.error.issues[0]?.message || "参数错误" } },
        { status: 400 }
      );
    }

    const { startTime, endTime, drawTime, ...rest } = validated.data;

    // 校验时间逻辑
    const start = new Date(startTime);
    const end = new Date(endTime);
    const draw = new Date(drawTime);

    if (end <= start) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_TIME", message: "结束时间必须晚于开始时间" } },
        { status: 400 }
      );
    }

    if (draw < end) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_TIME", message: "开奖时间不能早于报名截止时间" } },
        { status: 400 }
      );
    }

    const activity = await prisma.lotteryActivity.create({
      data: {
        ...rest,
        startTime: start,
        endTime: end,
        drawTime: draw,
        status: "draft",
      },
    });

    return NextResponse.json({
      success: true,
      data: activity,
    });
  } catch (error) {
    console.error("创建活动失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "创建失败" } },
      { status: 500 }
    );
  }
}


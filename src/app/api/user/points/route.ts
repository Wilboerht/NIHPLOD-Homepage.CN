/**
 * 用户积分 API
 * GET /api/user/points - 获取积分记录
 * POST /api/user/points/sign-in - 每日签到
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyUserAuth } from "@/lib/auth";

// 获取积分记录
// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const payload = await verifyUserAuth(request);
    
    if (!payload) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "请先登录" } },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "20");
    const type = searchParams.get("type"); // 可选过滤类型

    // 获取用户当前积分
    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      select: { points: true, totalPoints: true },
    });

    // 构建查询条件
    const where: Record<string, unknown> = { userId: payload.id };
    if (type) {
      where.type = type;
    }

    // 查询积分记录
    const [records, total] = await Promise.all([
      prisma.pointRecord.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.pointRecord.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        points: user?.points ?? 0,
        totalPoints: user?.totalPoints ?? 0,
        records,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      },
    });
  } catch (error) {
    console.error("[GetPoints] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}


/**
 * 会员管理 API (管理后台)
 * GET  /api/admin/vip - 获取会员统计和等级配置
 * PUT  /api/admin/vip - 更新等级权益配置
 * POST /api/admin/vip - 手动调整用户积分
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { cuidSchema } from "@/lib/validation";
import { z } from "zod";
import { logError } from "@/lib/logger";

// 更新等级权益 schema
const updateBenefitSchema = z.object({
  level: z.enum(["SILVER", "GOLD", "DIAMOND"]),
  name: z.string().min(1).optional(),
  nameEn: z.string().optional(),
  icon: z.string().optional(),
  minPoints: z.number().int().min(0).optional(),
  maxPoints: z.number().int().min(0).nullable().optional(),
  pointRate: z.number().int().min(1).optional(),
  benefits: z.array(z.object({
    icon: z.string(),
    title: z.string(),
    desc: z.string(),
  })).optional(),
  colorClass: z.string().optional(),
});

// 调整积分 schema
const adjustPointsSchema = z.object({
  userId: cuidSchema,
  points: z.number().int(),
  note: z.string().min(1, "请填写调整原因"),
});

export const dynamic = "force-dynamic";

// GET - 获取会员统计和配置
export async function GET(request: NextRequest) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request, "vip:read");
    if (rateLimitResponse) return rateLimitResponse;

    // 会员统计
    const [totalUsers, levelCounts, totalPoints, benefits] = await Promise.all([
      prisma.user.count({ where: { status: "ACTIVE" } }),
      prisma.user.groupBy({
        by: ["membershipLevel"],
        _count: true,
        where: { status: "ACTIVE" },
      }),
      prisma.user.aggregate({
        _sum: { totalPoints: true },
        where: { status: "ACTIVE" },
      }),
      prisma.membershipBenefit.findMany({
        orderBy: { minPoints: "asc" },
      }),
    ]);

    const stats = {
      totalUsers,
      totalPoints: totalPoints._sum.totalPoints ?? 0,
      levels: [
        { level: "SILVER", count: 0 },
        { level: "GOLD", count: 0 },
        { level: "DIAMOND", count: 0 },
      ].map((l) => {
        const found = levelCounts.find((lc) => lc.membershipLevel === l.level);
        return { ...l, count: found?._count ?? 0 };
      }),
    };

    return NextResponse.json({
      success: true,
      data: { stats, benefits },
    });
  } catch (error) {
    logError("AdminVIP GET", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

// PUT - 更新等级权益
export async function PUT(request: NextRequest) {
  if (!validateCSRFToken(request)) {
    return csrfForbiddenResponse();
  }

  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request, "vip:write");
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json();
    const parsed = updateBenefitSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: parsed.error.issues[0]?.message } },
        { status: 400 }
      );
    }

    const { level, ...data } = parsed.data;

    const benefit = await prisma.membershipBenefit.upsert({
      where: { level },
      create: {
        level,
        name: data.name ?? `${level === "SILVER" ? "银卡" : level === "GOLD" ? "金卡" : "钻石"}会员`,
        minPoints: data.minPoints ?? (level === "SILVER" ? 0 : level === "GOLD" ? 5000 : 20000),
        maxPoints: data.maxPoints ?? (level === "SILVER" ? 4999 : level === "GOLD" ? 19999 : null),
        pointRate: data.pointRate ?? 1,
        benefits: data.benefits ?? [],
        ...(data.nameEn && { nameEn: data.nameEn }),
        ...(data.icon && { icon: data.icon }),
        ...(data.colorClass && { colorClass: data.colorClass }),
      },
      update: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.nameEn !== undefined && { nameEn: data.nameEn }),
        ...(data.icon !== undefined && { icon: data.icon }),
        ...(data.minPoints !== undefined && { minPoints: data.minPoints }),
        ...(data.maxPoints !== undefined && { maxPoints: data.maxPoints }),
        ...(data.pointRate !== undefined && { pointRate: data.pointRate }),
        ...(data.benefits !== undefined && { benefits: data.benefits }),
        ...(data.colorClass !== undefined && { colorClass: data.colorClass }),
      },
    });

    return NextResponse.json({ success: true, data: { benefit } });
  } catch (error) {
    logError("AdminVIP PUT", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

// POST - 手动调整用户积分
export async function POST(request: NextRequest) {
  if (!validateCSRFToken(request)) {
    return csrfForbiddenResponse();
  }

  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request, "vip:write");
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json();
    const parsed = adjustPointsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: parsed.error.issues[0]?.message } },
        { status: 400 }
      );
    }

    const { userId, points, note } = parsed.data;

    // 查找用户
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, totalPoints: true, membershipLevel: true },
    });
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "用户不存在" } },
        { status: 404 }
      );
    }

    const newTotal = Math.max(0, user.totalPoints + points);

    // 重新计算等级
    let newLevel = user.membershipLevel;
    if (newTotal >= 20000) newLevel = "DIAMOND";
    else if (newTotal >= 5000) newLevel = "GOLD";
    else newLevel = "SILVER";

    await prisma.$transaction(async (tx) => {
      await tx.pointTransaction.create({
        data: {
          userId,
          points,
          type: "ADMIN_ADJUST",
          note: `${note} (管理员: ${admin.name})`,
        },
      });

      await tx.user.update({
        where: { id: userId },
        data: {
          totalPoints: newTotal,
          membershipLevel: newLevel,
        },
      });
    });

    return NextResponse.json({
      success: true,
      data: {
        previousPoints: user.totalPoints,
        newPoints: newTotal,
        previousLevel: user.membershipLevel,
        newLevel,
      },
    });
  } catch (error) {
    logError("AdminVIP POST", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

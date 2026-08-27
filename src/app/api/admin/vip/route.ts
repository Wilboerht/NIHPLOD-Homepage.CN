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
import { createAuditLog } from "@/lib/audit";
import { z } from "zod";
import { logError } from "@/lib/logger";
import { LEVEL_DEFAULT_BENEFITS, type LevelBenefitItem } from "@/lib/membership";
import { invalidateProfileCache } from "@/lib/points";

// 更新等级权益 schema
const updateBenefitSchema = z.object({
  level: z.enum(["REGULAR", "ADVANCED", "VIP", "SVIP"]),
  name: z.string().min(1).max(50).optional(),
  nameEn: z.string().max(50).optional(),
  icon: z.string().max(50).optional(),
  minSpent: z.number().int().min(0).optional(),
  maxSpent: z.number().int().min(0).nullable().optional(),
  benefits: z
    .array(
      z.object({
        icon: z.string(),
        title: z.string(),
        desc: z.string(),
      })
    )
    .optional(),
  colorClass: z.string().optional(),
});

// 调整积分 schema
const adjustPointsSchema = z.object({
  userId: cuidSchema,
  points: z.number().int(),
  note: z.string().min(1, "请填写调整原因").max(200, "调整原因不能超过200个字符"),
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
    const [totalUsers, levelCounts, totalPoints, dbBenefits] = await Promise.all([
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
      prisma.membershipBenefit.findMany(),
    ]);

    // 四档权益合并：DB 配置优先，缺失的等级返回默认配置（id 为 null，PUT upsert 时自动创建）
    const benefits = Object.values(LEVEL_DEFAULT_BENEFITS).map((defaults) => {
      const db = dbBenefits.find((b) => b.level === defaults.level);
      const dbBenefitItems = db?.benefits as LevelBenefitItem[] | null;
      return {
        id: db?.id ?? null,
        level: defaults.level,
        name: db?.name ?? defaults.name,
        nameEn: db?.nameEn ?? defaults.nameEn,
        icon: db?.icon ?? defaults.icon,
        minSpent: db?.minSpent ?? defaults.minSpent,
        maxSpent: db?.maxSpent ?? defaults.maxSpent,
        benefits: dbBenefitItems?.length ? dbBenefitItems : defaults.benefits,
        colorClass: db?.colorClass ?? defaults.colorClass,
      };
    });

    const stats = {
      totalUsers,
      totalPoints: totalPoints._sum.totalPoints ?? 0,
      levels: [
        { level: "REGULAR", count: 0 },
        { level: "ADVANCED", count: 0 },
        { level: "VIP", count: 0 },
        { level: "SVIP", count: 0 },
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

    // 权益配置变更：仅超级管理员可操作
    if (admin.role !== "owner") {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "仅超级管理员可修改等级权益" } },
        { status: 403 }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request, "vip:write");
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json();
    const parsed = updateBenefitSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_PARAMS", message: parsed.error.issues[0]?.message },
        },
        { status: 400 }
      );
    }

    const { level, ...data } = parsed.data;

    // 默认等级配置（与用户端共享）
    const defaults = LEVEL_DEFAULT_BENEFITS[level];

    // 注意：此处保存的 minSpent/maxSpent 仅影响前台展示的权益文案；
    // 实际判级以 src/lib/points.ts 中 calculateLevel 的硬编码阈值为准（DB 配置不参与判级）。
    const benefit = await prisma.membershipBenefit.upsert({
      where: { level },
      create: {
        level,
        name: data.name ?? defaults.name,
        minSpent: data.minSpent ?? defaults.minSpent,
        maxSpent: data.maxSpent ?? defaults.maxSpent,
        benefits: data.benefits ?? [],
        ...(data.nameEn && { nameEn: data.nameEn }),
        ...(data.icon && { icon: data.icon }),
        ...(data.colorClass && { colorClass: data.colorClass }),
      },
      update: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.nameEn !== undefined && { nameEn: data.nameEn }),
        ...(data.icon !== undefined && { icon: data.icon }),
        ...(data.minSpent !== undefined && { minSpent: data.minSpent }),
        ...(data.maxSpent !== undefined && { maxSpent: data.maxSpent }),
        ...(data.benefits !== undefined && { benefits: data.benefits }),
        ...(data.colorClass !== undefined && { colorClass: data.colorClass }),
      },
    });

    // 记录审计日志
    await createAuditLog({
      action: "update_vip_benefit",
      targetType: "vip",
      targetId: level,
      detail: { level, updatedFields: Object.keys(data).filter((k) => k !== "password") },
      adminId: admin.id,
      request,
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

    // 资金/权益操作：仅超级管理员可手动调整积分
    if (admin.role !== "owner") {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "仅超级管理员可调整用户积分" } },
        { status: 403 }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request, "vip:write");
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json();
    const parsed = adjustPointsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_PARAMS", message: parsed.error.issues[0]?.message },
        },
        { status: 400 }
      );
    }

    const { userId, points, note } = parsed.data;

    // 查找用户
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, totalPoints: true },
    });
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "用户不存在" } },
        { status: 404 }
      );
    }

    const newTotal = Math.max(0, user.totalPoints + points);
    // 与 applyExternalPointsSync 对齐的账目不变量：余额下限钳制为 0 后，
    // 流水必须记录**实际生效**的增量（effectiveDelta = 新余额 - 旧余额），
    // 而非请求值 points，保证「流水合计 == 余额」。
    // effectiveDelta 为 0（如余额已为 0 时再扣分）时行为与外部同步一致：
    // 仍记录一条 0 增量流水，保留「管理员执行过该调整」的审计痕迹。
    const effectiveDelta = newTotal - user.totalPoints;

    // 注意：手动调分仅调整积分，不影响等级（等级只随累计消费金额变动）
    await prisma.$transaction(async (tx) => {
      await tx.pointTransaction.create({
        data: {
          userId,
          points: effectiveDelta,
          type: "ADMIN_ADJUST",
          note: `${note} (管理员: ${admin.name})`,
        },
      });

      await tx.user.update({
        where: { id: userId },
        data: {
          totalPoints: newTotal,
        },
      });
    });

    // 失效用户资料缓存，确保用户端立即看到最新积分
    invalidateProfileCache();

    await createAuditLog({
      action: "user_points_adjust",
      targetType: "user",
      targetId: userId,
      detail: { points, effectiveDelta, newTotal, note },
      adminId: admin.id,
      request,
    });

    return NextResponse.json({
      success: true,
      data: {
        previousPoints: user.totalPoints,
        newPoints: newTotal,
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

/**
 * 会员管理 API (管理后台)
 * GET  /api/admin/vip - 获取会员统计和等级配置
 * PUT  /api/admin/vip - 更新等级权益配置
 *
 * 等级体系（2026-09 简化）：普通会员(注册) / 高级会员(消费满 ¥1,000)
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { createAuditLog } from "@/lib/audit";
import { z } from "zod";
import { logError } from "@/lib/logger";
import { LEVEL_DEFAULT_BENEFITS, type LevelBenefitItem } from "@/lib/membership";

// 更新等级权益 schema
const updateBenefitSchema = z.object({
  level: z.enum(["REGULAR", "ADVANCED"]),
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
    const [totalUsers, levelCounts, dbBenefits] = await Promise.all([
      prisma.user.count({ where: { status: "ACTIVE" } }),
      prisma.user.groupBy({
        by: ["membershipLevel"],
        _count: true,
        where: { status: "ACTIVE" },
      }),
      prisma.membershipBenefit.findMany(),
    ]);

    // 两档权益合并：DB 配置优先，缺失的等级返回默认配置（id 为 null，PUT upsert 时自动创建）
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
      levels: [
        { level: "REGULAR", count: 0 },
        { level: "ADVANCED", count: 0 },
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

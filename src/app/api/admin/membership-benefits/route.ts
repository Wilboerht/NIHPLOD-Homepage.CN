/**
 * 会员权益配置 API（管理端，仅超级管理员）
 * GET /api/admin/membership-benefits - 四档权益配置（DB 覆盖 + 代码默认值兜底）
 * PUT /api/admin/membership-benefits - 更新指定档位权益配置（upsert）
 *
 * 注意：实际等级判定以 lib/points.ts LEVEL_THRESHOLDS 硬编码阈值为准（唯一权威），
 * 此处的 minSpent 仅影响前台权益/进度的展示文案。
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { createAuditLog } from "@/lib/audit";
import { apiConsole } from "@/lib/logger";
import { LEVEL_DEFAULT_BENEFITS, type LevelDefaultBenefit, type LevelBenefitItem } from "@/lib/membership";
import type { MembershipLevel } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

const LEVELS = ["REGULAR", "SILVER", "GOLD", "DIAMOND"] as const;

const benefitItemSchema = z.object({
  icon: z.string().max(200).default(""),
  title: z.string().min(1, "权益标题不能为空").max(50, "权益标题过长"),
  desc: z.string().min(1, "权益描述不能为空").max(300, "权益描述过长"),
});

const updateSchema = z.object({
  level: z.enum(LEVELS),
  name: z.string().min(1, "等级名称不能为空").max(50),
  nameEn: z.string().max(50).optional(),
  icon: z.string().max(200).optional(),
  minSpent: z.number().int().min(0).max(100000000),
  maxSpent: z.number().int().min(0).max(100000000).nullable(),
  benefits: z.array(benefitItemSchema).min(1, "至少保留一条权益").max(20, "权益项最多 20 条"),
  colorClass: z.string().max(100).optional(),
});

/** 合并 DB 覆盖与代码默认值 */
function mergeLevel(
  defaults: LevelDefaultBenefit,
  db: {
    name: string;
    nameEn: string | null;
    icon: string | null;
    minSpent: number;
    maxSpent: number | null;
    benefits: unknown;
    colorClass: string | null;
  } | null
): LevelDefaultBenefit & { source: "db" | "default" } {
  if (!db) return { ...defaults, source: "default" };
  const dbBenefits = Array.isArray(db.benefits) ? (db.benefits as LevelBenefitItem[]) : [];
  return {
    level: defaults.level,
    name: db.name,
    nameEn: db.nameEn ?? defaults.nameEn,
    icon: db.icon ?? defaults.icon,
    minSpent: db.minSpent,
    maxSpent: db.maxSpent,
    benefits: dbBenefits.length > 0 ? dbBenefits : defaults.benefits,
    colorClass: db.colorClass ?? defaults.colorClass,
    source: "db",
  };
}

export async function GET(request: NextRequest) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }
    if (admin.role !== "owner") {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "仅超级管理员可查看会员权益配置" } },
        { status: 403 }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request, "membership:read");
    if (rateLimitResponse) return rateLimitResponse;

    const rows = await prisma.membershipBenefit.findMany();
    const rowMap = new Map(rows.map((r) => [r.level as string, r]));

    const levels = LEVELS.map((level) =>
      mergeLevel(LEVEL_DEFAULT_BENEFITS[level as MembershipLevel], rowMap.get(level) ?? null)
    );

    return NextResponse.json({ success: true, data: { levels } });
  } catch (error) {
    apiConsole.error("[AdminMembershipBenefits] 查询失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

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
    if (admin.role !== "owner") {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "仅超级管理员可更新会员权益配置" } },
        { status: 403 }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request, "membership:write");
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_PARAMS", message: parsed.error.issues[0]?.message || "参数错误" },
        },
        { status: 400 }
      );
    }

    const { level, name, nameEn, icon, minSpent, maxSpent, benefits, colorClass } = parsed.data;

    const previous = await prisma.membershipBenefit.findUnique({ where: { level } });

    const saved = await prisma.membershipBenefit.upsert({
      where: { level },
      create: {
        level,
        name,
        nameEn: nameEn ?? null,
        icon: icon ?? null,
        minSpent,
        maxSpent,
        benefits,
        colorClass: colorClass ?? null,
      },
      update: {
        name,
        nameEn: nameEn ?? null,
        icon: icon ?? null,
        minSpent,
        maxSpent,
        benefits,
        colorClass: colorClass ?? null,
      },
    });

    await createAuditLog({
      action: "update_vip_benefit",
      targetType: "vip",
      targetId: level,
      detail: {
        level,
        before: previous
          ? {
              name: previous.name,
              minSpent: previous.minSpent,
              maxSpent: previous.maxSpent,
              benefits: previous.benefits,
            }
          : null,
        after: { name, minSpent, maxSpent, benefits },
      },
      adminId: admin.id,
      request,
    });

    // 可空列回传归一化为字符串，保持与 GET 合并结果一致的契约（避免前端对 null 调 .trim()）
    return NextResponse.json({
      success: true,
      data: {
        level: saved.level,
        name: saved.name,
        nameEn: saved.nameEn ?? "",
        icon: saved.icon ?? "",
        minSpent: saved.minSpent,
        maxSpent: saved.maxSpent,
        benefits: saved.benefits,
        colorClass: saved.colorClass ?? "",
        source: "db" as const,
      },
    });
  } catch (error) {
    apiConsole.error("[AdminMembershipBenefits] 更新失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

/**
 * 会员权益配置 API（管理端，仅超级管理员）
 * GET /api/admin/membership-benefits - 四档权益配置（DB 覆盖 + 代码默认值兜底）
 * PUT /api/admin/membership-benefits - 更新指定档位权益配置（upsert）
 * DELETE /api/admin/membership-benefits?level=XXX - 删除指定档位的 DB 覆盖（恢复代码默认值）
 *
 * 注意：等级判级与前台展示的消费门槛统一由 lib/membership.ts LEVEL_THRESHOLDS 提供
 * （唯一权威，随代码发布），本接口不提供门槛编辑（携带门槛字段将被拒绝）。
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { beginAuditLog, finishAuditLog } from "@/lib/audit";
import { apiConsole } from "@/lib/logger";
import { hasAdminPermission } from "@/lib/admin-permissions";
import {
  LEVEL_DEFAULT_BENEFITS,
  type LevelDefaultBenefit,
  type LevelBenefitItem,
} from "@/lib/membership";
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
  benefits: z.array(benefitItemSchema).min(1, "至少保留一条权益").max(20, "权益项最多 20 条"),
  colorClass: z.string().max(100).optional(),
});

/** 管理端可编辑的展示字段（消费门槛由代码常量提供，不在此列） */
type EditableLevelFields = Pick<
  LevelDefaultBenefit,
  "level" | "name" | "nameEn" | "icon" | "benefits" | "colorClass"
>;

/** 合并 DB 覆盖与代码默认值（仅展示字段；门槛不参与） */
function mergeLevel(
  defaults: LevelDefaultBenefit,
  db: {
    name: string;
    nameEn: string | null;
    icon: string | null;
    benefits: unknown;
    colorClass: string | null;
  } | null
): EditableLevelFields & { source: "db" | "default" } {
  if (!db) {
    const { level, name, nameEn, icon, benefits, colorClass } = defaults;
    return { level, name, nameEn, icon, benefits, colorClass, source: "default" };
  }
  const dbBenefits = Array.isArray(db.benefits) ? (db.benefits as LevelBenefitItem[]) : [];
  return {
    level: defaults.level,
    name: db.name,
    nameEn: db.nameEn ?? defaults.nameEn,
    icon: db.icon ?? defaults.icon,
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
    if (!hasAdminPermission(admin, "membership:read")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：会员权益查看" } },
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

export async function DELETE(request: NextRequest) {
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
    if (!hasAdminPermission(admin, "membership:write")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：会员权益编辑" } },
        { status: 403 }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request, "membership:write");
    if (rateLimitResponse) return rateLimitResponse;

    const { searchParams } = new URL(request.url);
    const parsed = z.object({ level: z.enum(LEVELS) }).safeParse({
      level: searchParams.get("level"),
    });
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: "参数错误" } },
        { status: 400 }
      );
    }
    const { level } = parsed.data;

    const previous = await prisma.membershipBenefit.findUnique({ where: { level } });
    if (!previous) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "该档位当前使用默认配置，无需恢复" },
        },
        { status: 404 }
      );
    }

    const auditDetail = {
      level,
      before: {
        name: previous.name,
        benefits: previous.benefits,
      },
      after: null,
    };
    const auditId = await beginAuditLog({
      action: "reset_vip_benefit",
      targetType: "vip",
      targetId: level,
      detail: auditDetail,
      adminId: admin.id,
      request,
    });
    if (!auditId) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "AUDIT_UNAVAILABLE", message: "审计服务不可用，已拒绝操作" },
        },
        { status: 503 }
      );
    }

    await prisma.membershipBenefit.delete({ where: { level } }).catch(async (error) => {
      await finishAuditLog(auditId, "FAILURE", auditDetail);
      throw error;
    });

    await finishAuditLog(auditId, "SUCCESS", auditDetail);

    const defaults = LEVEL_DEFAULT_BENEFITS[level as MembershipLevel];
    return NextResponse.json({
      success: true,
      data: {
        level: defaults.level,
        name: defaults.name,
        nameEn: defaults.nameEn,
        icon: defaults.icon,
        benefits: defaults.benefits,
        colorClass: defaults.colorClass,
        source: "default" as const,
      },
    });
  } catch (error) {
    apiConsole.error("[AdminMembershipBenefits] 恢复默认失败:", error);
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
    if (!hasAdminPermission(admin, "membership:write")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：会员权益编辑" } },
        { status: 403 }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request, "membership:write");
    if (rateLimitResponse) return rateLimitResponse;

    const body = (await request.json()) as Record<string, unknown>;
    if ("minSpent" in body || "maxSpent" in body) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "THRESHOLD_IMMUTABLE",
            message: "消费门槛由系统固定（随代码发布），不支持修改",
          },
        },
        { status: 400 }
      );
    }
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

    const { level, name, nameEn, icon, benefits, colorClass } = parsed.data;

    const previous = await prisma.membershipBenefit.findUnique({ where: { level } });

    const auditDetail = {
      level,
      before: previous
        ? {
            name: previous.name,
            benefits: previous.benefits,
          }
        : null,
      after: { name, benefits },
    };
    const auditId = await beginAuditLog({
      action: "update_vip_benefit",
      targetType: "vip",
      targetId: level,
      detail: auditDetail,
      adminId: admin.id,
      request,
    });
    if (!auditId) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "AUDIT_UNAVAILABLE", message: "审计服务不可用，已拒绝操作" },
        },
        { status: 503 }
      );
    }

    const saved = await prisma.membershipBenefit
      .upsert({
        where: { level },
        create: {
          level,
          name,
          nameEn: nameEn ?? null,
          icon: icon ?? null,
          benefits,
          colorClass: colorClass ?? null,
        },
        update: {
          name,
          nameEn: nameEn ?? null,
          icon: icon ?? null,
          benefits,
          colorClass: colorClass ?? null,
        },
      })
      .catch(async (error) => {
        await finishAuditLog(auditId, "FAILURE", auditDetail);
        throw error;
      });

    await finishAuditLog(auditId, "SUCCESS", auditDetail);

    // 可空列回传归一化为字符串，保持与 GET 合并结果一致的契约（避免前端对 null 调 .trim()）
    return NextResponse.json({
      success: true,
      data: {
        level: saved.level,
        name: saved.name,
        nameEn: saved.nameEn ?? "",
        icon: saved.icon ?? "",
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

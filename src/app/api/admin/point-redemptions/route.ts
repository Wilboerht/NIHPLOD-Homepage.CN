/**
 * 积分兑换记录 API（管理端）
 * GET /api/admin/point-redemptions - 兑换记录列表（按状态筛选 + 分页）
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { apiConsole } from "@/lib/logger";
import { maskPhone, maskAddress } from "@/lib/mask-phone";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { createAuditLogStrict } from "@/lib/audit";
import { requireAdminStepUp } from "@/lib/admin-totp";

const querySchema = z.object({
  page: z.preprocess((val) => (val ? Number(val) : 1), z.number().min(1)),
  pageSize: z.preprocess((val) => (val ? Number(val) : 20), z.number().min(1).max(100)),
  status: z.enum(["PENDING", "FULFILLED", "CANCELLED"]).optional(),
  search: z.string().max(100).optional(),
});

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }

    if (!hasAdminPermission(admin, "redemptions:read")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：兑换记录查看" } },
        { status: 403 }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request, "point-redemptions:read");
    if (rateLimitResponse) return rateLimitResponse;

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      page: searchParams.get("page"),
      pageSize: searchParams.get("pageSize"),
      status: searchParams.get("status") || undefined,
      search: searchParams.get("search")?.trim() || undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: "参数错误" } },
        { status: 400 }
      );
    }

    const { page, pageSize, status, search } = parsed.data;
    const where: Prisma.PointRedemptionWhereInput = status ? { status } : {};
    if (search) {
      where.OR = [
        { productName: { contains: search, mode: "insensitive" } },
        // 手机号仅精确匹配：模糊匹配会让无敏感权限的角色逐位穷举还原完整手机号
        { user: { phone: { equals: search } } },
        { user: { nickname: { contains: search, mode: "insensitive" } } },
      ];
    }
    // PII 最小化：列表默认脱敏；履约管理员需显式 reveal=1 并完成 step-up，
    // 才返回完整收件人手机号/地址，且严格审计失败时拒绝返回明文。
    const canFulfill = hasAdminPermission(admin, "redemptions:fulfill");
    const wantsReveal = searchParams.get("reveal") === "1";
    const canViewPii = canFulfill && wantsReveal;
    if (canViewPii) {
      const stepUp = await requireAdminStepUp(request, admin);
      if (stepUp) return stepUp;
    }

    const [redemptions, total, statusCounts, pointsAgg] = await Promise.all([
      prisma.pointRedemption.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        select: {
          id: true,
          productName: true,
          priceYuan: true,
          points: true,
          status: true,
          recipient: true,
          phone: true,
          address: true,
          carrier: true,
          waybillNo: true,
          createdAt: true,
          fulfilledAt: true,
          user: { select: { id: true, phone: true, nickname: true } },
        },
      }),
      prisma.pointRedemption.count({ where }),
      prisma.pointRedemption.groupBy({ by: ["status"], _count: true }),
      // 全站可用积分总额（所有用户 PointBalance.available 之和，可为负：含退款超兑债务）
      prisma.pointBalance.aggregate({ _sum: { available: true } }),
    ]);

    const counts: Record<string, number> = { PENDING: 0, FULFILLED: 0, CANCELLED: 0 };
    for (const row of statusCounts) {
      counts[row.status] = row._count;
    }

    if (canViewPii && redemptions.length > 0) {
      try {
        await createAuditLogStrict({
          action: "point_redemption_pii_view",
          targetType: "point_redemption",
          actorType: "ADMIN",
          actorEmail: admin.email,
          actorName: admin.name,
          actorRole: admin.role,
          authMethod: "step_up",
          sessionJti: admin.jti ?? null,
          source: "WEB",
          detail: {
            filters: { status: status ?? null, search: search ?? null },
            page,
            pageSize,
            count: redemptions.length,
            fields: ["recipient", "phone", "address"],
          },
          adminId: admin.id,
          request,
        });
      } catch {
        return NextResponse.json(
          {
            success: false,
            error: { code: "AUDIT_UNAVAILABLE", message: "审计服务不可用，已拒绝返回完整收件信息" },
          },
          { status: 503 }
        );
      }
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          piiRevealed: canViewPii,
          redemptions: redemptions.map((r) => ({
            id: r.id,
            productName: r.productName,
            priceYuan: Number(r.priceYuan),
            points: r.points,
            status: r.status,
            // PII 最小化：仅显式 reveal + step-up 后可见完整收件信息
            recipient: canViewPii
              ? r.recipient
              : r.recipient
                ? `${r.recipient.slice(0, 1)}**`
                : null,
            phone: canViewPii ? r.phone : r.phone ? maskPhone(r.phone) : null,
            address: canViewPii ? r.address : maskAddress(r.address),
            carrier: r.carrier,
            waybillNo: r.waybillNo,
            createdAt: r.createdAt.toISOString(),
            fulfilledAt: r.fulfilledAt?.toISOString() ?? null,
            user: {
              id: r.user.id,
              phone: maskPhone(r.user.phone),
              nickname: r.user.nickname,
            },
          })),
          counts,
          pointsTotal: pointsAgg._sum.available ?? 0,
          pagination: {
            page,
            pageSize,
            total,
            totalPages: Math.ceil(total / pageSize),
          },
        },
      },
      { headers: { "Cache-Control": "no-store, private" } }
    );
  } catch (error) {
    apiConsole.error("[AdminPointRedemptions] 查询失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

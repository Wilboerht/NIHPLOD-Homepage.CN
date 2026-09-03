/**
 * 积分兑换产品管理 API（管理端，产品数据来自产品库）
 * GET   /api/admin/point-gifts - 产品列表（可筛选"可兑换"，产品本身在 产品管理 维护）
 * PATCH /api/admin/point-gifts - 设置/取消产品的"积分可兑"标记（仅超级管理员）
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { createAuditLog } from "@/lib/audit";
import { apiConsole } from "@/lib/logger";

const querySchema = z.object({
  page: z.preprocess((val) => (val ? Number(val) : 1), z.number().min(1)),
  pageSize: z.preprocess((val) => (val ? Number(val) : 20), z.number().min(1).max(100)),
  search: z.string().max(100).optional(),
  redeemable: z.enum(["all", "true", "false"]).optional(),
});

const updateSchema = z.object({
  productId: z.string().cuid(),
  pointRedeemable: z.boolean(),
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

    const rateLimitResponse = await checkAdminRateLimit(request, "point-gifts:read");
    if (rateLimitResponse) return rateLimitResponse;

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      page: searchParams.get("page"),
      pageSize: searchParams.get("pageSize"),
      search: searchParams.get("search") || undefined,
      redeemable: searchParams.get("redeemable") || "all",
    });
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: "参数错误" } },
        { status: 400 }
      );
    }

    const { page, pageSize, search, redeemable } = parsed.data;
    const where = {
      ...(redeemable === "true" ? { pointRedeemable: true } : {}),
      ...(redeemable === "false" ? { pointRedeemable: false } : {}),
      ...(search
        ? { OR: [{ name: { contains: search, mode: "insensitive" as const } }] }
        : {}),
    };

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          name: true,
          price: true,
          published: true,
          pointRedeemable: true,
          category: { select: { name: true } },
        },
      }),
      prisma.product.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        products: products.map((p) => ({
          id: p.id,
          name: p.name,
          priceYuan: Number(p.price),
          published: p.published,
          pointRedeemable: p.pointRedeemable,
          categoryName: p.category.name,
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
    apiConsole.error("[AdminPointGifts] 查询失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
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
        { success: false, error: { code: "FORBIDDEN", message: "仅超级管理员可设置积分可兑" } },
        { status: 403 }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request, "point-gifts:write");
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

    const { productId, pointRedeemable } = parsed.data;

    const existing = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, name: true, published: true },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "产品不存在" } },
        { status: 404 }
      );
    }
    if (pointRedeemable && !existing.published) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "PRODUCT_NOT_PUBLISHED", message: "仅已发布产品可设为积分可兑" },
        },
        { status: 400 }
      );
    }

    const product = await prisma.product.update({
      where: { id: productId },
      data: { pointRedeemable },
      select: { id: true, name: true, pointRedeemable: true },
    });

    await createAuditLog({
      action: "point_gift_update",
      targetType: "point_gift",
      targetId: productId,
      detail: { productName: product.name, pointRedeemable },
      adminId: admin.id,
      request,
    });

    return NextResponse.json({ success: true, data: { product } });
  } catch (error) {
    apiConsole.error("[AdminPointGifts] 更新失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

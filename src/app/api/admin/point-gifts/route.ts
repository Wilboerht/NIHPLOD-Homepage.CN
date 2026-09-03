/**
 * 积分礼品管理 API（管理端）
 * GET   /api/admin/point-gifts - 礼品列表（含下架）
 * POST  /api/admin/point-gifts - 新增礼品（仅超级管理员）
 * PATCH /api/admin/point-gifts - 更新/上下架礼品（仅超级管理员）
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { createAuditLog } from "@/lib/audit";
import { apiConsole } from "@/lib/logger";

const createSchema = z.object({
  name: z.string().trim().min(1, "礼品名称必填").max(50),
  description: z.string().trim().max(500).optional(),
  image: z.string().max(500).optional(),
  valueYuan: z.number().int().min(1, "市场价值必须为正整数").max(1_000_000),
  sort: z.number().int().min(0).max(9999).optional(),
});

const updateSchema = createSchema.partial().extend({
  id: z.string().cuid(),
  active: z.boolean().optional(),
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

    const gifts = await prisma.pointGift.findMany({
      orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
    });

    return NextResponse.json({
      success: true,
      data: {
        gifts: gifts.map((g) => ({
          ...g,
          createdAt: g.createdAt.toISOString(),
          updatedAt: g.updatedAt.toISOString(),
        })),
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

async function requireOwner(request: NextRequest) {
  const admin = await verifyAuth(request);
  if (!admin) {
    return {
      admin: null,
      response: NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      ),
    };
  }
  if (admin.role !== "owner") {
    return {
      admin: null,
      response: NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "仅超级管理员可管理礼品" } },
        { status: 403 }
      ),
    };
  }
  const rateLimitResponse = await checkAdminRateLimit(request, "point-gifts:write");
  if (rateLimitResponse) {
    return { admin: null, response: rateLimitResponse };
  }
  return { admin, response: null };
}

export async function POST(request: NextRequest) {
  if (!validateCSRFToken(request)) {
    return csrfForbiddenResponse();
  }

  try {
    const { admin, response } = await requireOwner(request);
    if (response) return response;

    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_PARAMS", message: parsed.error.issues[0]?.message || "参数错误" },
        },
        { status: 400 }
      );
    }

    const gift = await prisma.pointGift.create({
      data: {
        name: parsed.data.name,
        description: parsed.data.description || null,
        image: parsed.data.image || null,
        valueYuan: parsed.data.valueYuan,
        sort: parsed.data.sort ?? 0,
      },
    });

    await createAuditLog({
      action: "point_gift_create",
      targetType: "point_gift",
      targetId: gift.id,
      detail: { name: gift.name, valueYuan: gift.valueYuan },
      adminId: admin!.id,
      request,
    });

    return NextResponse.json({ success: true, data: { gift } });
  } catch (error) {
    apiConsole.error("[AdminPointGifts] 新增失败:", error);
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
    const { admin, response } = await requireOwner(request);
    if (response) return response;

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

    const { id, ...fields } = parsed.data;
    const gift = await prisma.pointGift.update({
      where: { id },
      data: {
        ...(fields.name !== undefined && { name: fields.name }),
        ...(fields.description !== undefined && { description: fields.description || null }),
        ...(fields.image !== undefined && { image: fields.image || null }),
        ...(fields.valueYuan !== undefined && { valueYuan: fields.valueYuan }),
        ...(fields.sort !== undefined && { sort: fields.sort }),
        ...(fields.active !== undefined && { active: fields.active }),
      },
    });

    await createAuditLog({
      action: "point_gift_update",
      targetType: "point_gift",
      targetId: id,
      detail: { updatedFields: Object.keys(fields) },
      adminId: admin!.id,
      request,
    });

    return NextResponse.json({ success: true, data: { gift } });
  } catch (error) {
    apiConsole.error("[AdminPointGifts] 更新失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

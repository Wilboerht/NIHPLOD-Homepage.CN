import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { z } from "zod";
import { logError } from "@/lib/logger";
import { createAuditLog } from "@/lib/audit";
import { validateCUID, invalidIdResponse } from "@/lib/validation";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";

const updateSchema = z
  .object({
    name: z.string().min(1).optional(),
    type: z.enum(["DISCOUNT_AMOUNT", "DISCOUNT_PERCENT"]).optional(),
    value: z.number().positive().optional(),
    minAmount: z.number().min(0).optional(),
    daysValid: z.number().int().positive().nullable().optional(),
    startDate: z.string().optional().nullable(),
    endDate: z.string().optional().nullable(),
    totalLimit: z.number().int().positive().nullable().optional(),
    userLimit: z.number().int().positive().optional(),
    isActive: z.boolean().optional(),
    code: z.string().optional().nullable(),
    scopeType: z.enum(["ALL", "CATEGORY", "PRODUCT"]).optional(),
    scopeIds: z.array(z.string()).optional(),
  })
  .superRefine((data, ctx) => {
    if (
      data.type === "DISCOUNT_PERCENT" &&
      data.value !== undefined &&
      (data.value <= 0 || data.value >= 1)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value"],
        message: "折扣比例必须在 0 到 1 之间",
      });
    }
  });

type RouteContext = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

// PATCH - 更新优惠券（上下架、编辑）
export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const admin = await verifyAuth(req);
    if (!admin)
      return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED", message: "未授权" } }, { status: 401 });

    // 资金/权益操作：仅超级管理员可修改优惠券
    if (admin.role !== "owner")
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "仅超级管理员可修改优惠券" } },
        { status: 403 }
      );

    const rateLimitResponse = await checkAdminRateLimit(req);
    if (rateLimitResponse) return rateLimitResponse;

    if (!validateCSRFToken(req)) {
      return csrfForbiddenResponse();
    }

    const { id } = await context.params;
    if (!validateCUID(id)) {
      return invalidIdResponse();
    }

    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "参数错误", details: parsed.error.issues } },
        { status: 400 }
      );
    }
    const data = parsed.data;

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: "无有效更新字段" } },
        { status: 400 }
      );
    }

    const coupon = await prisma.coupon.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.type !== undefined && { type: data.type }),
        ...(data.value !== undefined && { value: data.value }),
        ...(data.minAmount !== undefined && { minAmount: data.minAmount }),
        ...(data.daysValid !== undefined && { daysValid: data.daysValid }),
        ...(data.startDate !== undefined && {
          startDate: data.startDate ? new Date(data.startDate) : null,
        }),
        ...(data.endDate !== undefined && {
          endDate: data.endDate ? new Date(data.endDate) : null,
        }),
        ...(data.totalLimit !== undefined && { totalLimit: data.totalLimit }),
        ...(data.userLimit !== undefined && { userLimit: data.userLimit }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...(data.code !== undefined && { code: data.code }),
        ...(data.scopeType !== undefined && { scopeType: data.scopeType }),
        ...(data.scopeIds !== undefined && { scopeIds: data.scopeIds }),
      },
    });

    await createAuditLog({
      action: "update_coupon",
      targetType: "coupon",
      targetId: coupon.id,
      detail: { name: coupon.name, changes: data },
      adminId: admin.id,
      request: req,
    });

    return NextResponse.json({ success: true, data: coupon });
  } catch (e: unknown) {
    logError("AdminCouponUpdate", e, { id: context.params });
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "VALIDATION_ERROR", message: "参数错误", details: e.issues },
        },
        { status: 400 }
      );
    }
    const isDuplicateCode =
      e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "P2002";
    if (isDuplicateCode) {
      return NextResponse.json(
        { success: false, error: { code: "DUPLICATE_CODE", message: "兑换码已存在，请更换" } },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: "UPDATE_FAILED", message: "更新失败" } },
      { status: 500 }
    );
  }
}

// DELETE - 删除优惠券
export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const admin = await verifyAuth(req);
    if (!admin)
      return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED", message: "未授权" } }, { status: 401 });

    // 资金/权益操作：仅超级管理员可删除优惠券
    if (admin.role !== "owner")
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "仅超级管理员可删除优惠券" } },
        { status: 403 }
      );

    const rateLimitResponse = await checkAdminRateLimit(req);
    if (rateLimitResponse) return rateLimitResponse;

    if (!validateCSRFToken(req)) {
      return csrfForbiddenResponse();
    }

    const { id } = await context.params;

    if (!validateCUID(id)) {
      return invalidIdResponse();
    }

    // 保护：如果已有用户领取，禁止删除（避免级联删除用户资产）
    const issuedCount = await prisma.userCoupon.count({ where: { couponId: id } });
    if (issuedCount > 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "COUPON_IN_USE",
            message: `该优惠券已被 ${issuedCount} 位用户领取，无法删除`,
          },
        },
        { status: 409 }
      );
    }

    const coupon = await prisma.coupon.delete({
      where: { id },
    });

    await createAuditLog({
      action: "delete_coupon",
      targetType: "coupon",
      targetId: coupon.id,
      detail: { name: coupon.name },
      adminId: admin.id,
      request: req,
    });

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    logError("AdminCouponDelete", e, { id: context.params });
    return NextResponse.json(
      { success: false, error: { code: "DELETE_FAILED", message: "删除失败，可能已有用户领取" } },
      { status: 500 }
    );
  }
}

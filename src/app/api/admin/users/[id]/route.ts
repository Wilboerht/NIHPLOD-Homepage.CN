/**
 * 管理端用户详情 API
 * GET /api/admin/users/:id
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit";
import { apiConsole } from "@/lib/logger";
import { z } from "zod";
import type { UserStatus } from "@/generated/prisma/client";
import { validateCUID, invalidIdResponse } from "@/lib/validation";
import { blacklistUserTokens, removeFromBlacklist } from "@/lib/token-blacklist";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";

type RouteContext = { params: Promise<{ id: string }> };

// 强制动态渲染，禁止静态预渲染
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }

    const { id } = await context.params;

    if (!validateCUID(id)) {
      return invalidIdResponse();
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        phone: true,
        phoneVerified: true,
        nickname: true,
        avatar: true,
        status: true,
        wechatOpenId: true,
        wechatUnionId: true,
        createdAt: true,
        updatedAt: true,
        orders: {
          take: 10,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            orderNo: true,
            status: true,
            payAmount: true,
            createdAt: true,
          },
        },
        addresses: {
          orderBy: { isDefault: "desc", createdAt: "desc" },
          select: {
            id: true,
            name: true,
            phone: true,
            province: true,
            city: true,
            district: true,
            detail: true,
            isDefault: true,
          },
        },
        userCoupons: {
          where: { status: "UNUSED" },
          select: {
            id: true,
            coupon: {
              select: {
                name: true,
                type: true,
                value: true,
              },
            },
          },
        },
        _count: { select: { orders: true } },
      },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "用户不存在" } },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { user },
    });
  } catch (error) {
    apiConsole.error("[AdminUserDetail] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

const updateUserSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED", "BANNED"] as const),
});

// PATCH /api/admin/users/:id - 修改用户状态
export async function PATCH(request: NextRequest, context: RouteContext) {
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

    const { id } = await context.params;
    if (!validateCUID(id)) {
      return invalidIdResponse();
    }

    const body = await request.json();
    const result = updateUserSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: "参数错误" } },
        { status: 400 }
      );
    }

    const { status } = result.data;

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, phone: true, status: true },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "用户不存在" } },
        { status: 404 }
      );
    }

    if (user.status === status) {
      return NextResponse.json({ success: true, data: { user } });
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: { status: status as UserStatus },
      select: { id: true, phone: true, status: true },
    });

    // 冻结/封禁用户时：撤销所有 Refresh Token + 加入 access token 黑名单 + 级联清理
    if (status !== "ACTIVE") {
      await prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      // 加入 access token 黑名单，消除剩余 15 分钟窗口期
      const reason = status === "SUSPENDED" ? "账号已被临时冻结" : "账号已被永久封禁";
      blacklistUserTokens(user.id, reason);

      // 级联清理：清空购物车、过期未使用优惠券
      await prisma.cartItem.deleteMany({ where: { userId: id } });
      await prisma.userCoupon.updateMany({
        where: { userId: id, status: "UNUSED" },
        data: { status: "EXPIRED" },
      });
    } else {
      // 解封时从黑名单移除
      removeFromBlacklist(user.id);
    }

    await createAuditLog({
      action: "user_status_change",
      targetType: "user",
      targetId: user.id,
      detail: { previousStatus: user.status, newStatus: status, phone: user.phone },
      adminId: admin.id,
      request,
    });

    return NextResponse.json({ success: true, data: { user: updatedUser } });
  } catch (error) {
    apiConsole.error("[AdminUserUpdate] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/users/:id - 软删除用户（GDPR 合规）
export async function DELETE(request: NextRequest, context: RouteContext) {
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

    const { id } = await context.params;
    if (!validateCUID(id)) {
      return invalidIdResponse();
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, phone: true, status: true },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "用户不存在" } },
        { status: 404 }
      );
    }

    // 软删除：封禁 + 匿名化 PII
    const anonymizedPhone = `deleted_${user.id.slice(0, 8)}`;
    await prisma.user.update({
      where: { id },
      data: {
        status: "BANNED",
        phone: anonymizedPhone,
        nickname: "[已删除]",
        avatar: null,
        wechatOpenId: null,
        wechatUnionId: null,
      },
    });

    // 撤销所有 token + 加入黑名单
    await prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    blacklistUserTokens(user.id, "用户数据已被删除");

    // 级联清理
    await prisma.cartItem.deleteMany({ where: { userId: id } });
    await prisma.userCoupon.updateMany({
      where: { userId: id, status: "UNUSED" },
      data: { status: "EXPIRED" },
    });

    await createAuditLog({
      action: "user_deleted",
      targetType: "user",
      targetId: user.id,
      detail: { anonymizedPhone, previousStatus: user.status },
      adminId: admin.id,
      request,
    });

    return NextResponse.json({ success: true, data: { message: "用户数据已删除" } });
  } catch (error) {
    apiConsole.error("[AdminUserDelete] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

/**
 * 用户收货地址单条操作 API
 * PATCH /api/user/addresses/[id] - 编辑地址（isDefault=true 时取消其他默认）
 * DELETE /api/user/addresses/[id] - 删除地址（删除默认地址时自动将最早一条设为默认）
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyUserAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { apiConsole } from "@/lib/logger";
import { validateCUID, invalidIdResponse } from "@/lib/validation";
import { addressFieldsSchema, type UserAddressView } from "@/lib/user-address";

type RouteContext = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

function toView(a: {
  id: string;
  recipient: string;
  phone: string;
  region: string;
  detail: string;
  isDefault: boolean;
}): UserAddressView {
  return {
    id: a.id,
    recipient: a.recipient,
    phone: a.phone,
    region: a.region,
    detail: a.detail,
    isDefault: a.isDefault,
  };
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  if (!validateCSRFToken(request)) {
    return csrfForbiddenResponse();
  }

  try {
    const user = await verifyUserAuth(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "请先登录" } },
        { status: 401 }
      );
    }

    const { id } = await context.params;
    if (!validateCUID(id)) {
      return invalidIdResponse();
    }

    const parsed = addressFieldsSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_PARAMS", message: parsed.error.issues[0]?.message || "参数错误" },
        },
        { status: 400 }
      );
    }

    const { recipient, phone, region, detail, isDefault } = parsed.data;

    const existing = await prisma.userAddress.findUnique({
      where: { id },
      select: { userId: true, isDefault: true },
    });
    if (!existing || existing.userId !== user.id) {
      // 越权查询统一 404，不泄露地址存在性
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "收货地址不存在" } },
        { status: 404 }
      );
    }

    const address = await prisma.$transaction(async (tx) => {
      if (isDefault === true) {
        await tx.userAddress.updateMany({
          where: { userId: user.id, isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
      }
      const updated = await tx.userAddress.update({
        where: { id },
        data: {
          recipient,
          phone,
          region,
          detail,
          // 未显式传 isDefault 时保留原值；显式 false 表示取消默认
          isDefault: isDefault === undefined ? undefined : isDefault,
        },
      });
      // 原默认地址被显式取消默认：自动将剩余最早一条设为默认，保证地址簿始终有默认地址
      if (existing.isDefault && isDefault === false) {
        const earliest = await tx.userAddress.findFirst({
          where: { userId: user.id, id: { not: id } },
          orderBy: { createdAt: "asc" },
          select: { id: true },
        });
        if (earliest) {
          await tx.userAddress.update({
            where: { id: earliest.id },
            data: { isDefault: true },
          });
        }
      }
      return updated;
    });

    return NextResponse.json({ success: true, data: { address: toView(address) } });
  } catch (error) {
    apiConsole.error("[UserAddress] 编辑失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  if (!validateCSRFToken(request)) {
    return csrfForbiddenResponse();
  }

  try {
    const user = await verifyUserAuth(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "请先登录" } },
        { status: 401 }
      );
    }

    const { id } = await context.params;
    if (!validateCUID(id)) {
      return invalidIdResponse();
    }

    const existing = await prisma.userAddress.findUnique({
      where: { id },
      select: { userId: true, isDefault: true },
    });
    if (!existing || existing.userId !== user.id) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "收货地址不存在" } },
        { status: 404 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.userAddress.delete({ where: { id } });
      if (existing.isDefault) {
        // 删除默认地址后，自动将剩余最早一条设为默认，保证地址簿始终有默认地址
        const earliest = await tx.userAddress.findFirst({
          where: { userId: user.id },
          orderBy: { createdAt: "asc" },
          select: { id: true },
        });
        if (earliest) {
          await tx.userAddress.update({
            where: { id: earliest.id },
            data: { isDefault: true },
          });
        }
      }
    });

    return NextResponse.json({ success: true, data: {} });
  } catch (error) {
    apiConsole.error("[UserAddress] 删除失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

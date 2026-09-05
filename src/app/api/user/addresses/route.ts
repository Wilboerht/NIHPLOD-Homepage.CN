/**
 * 用户收货地址 API
 * GET /api/user/addresses - 地址列表（默认地址优先，其次按创建时间）
 * POST /api/user/addresses - 新增地址（第一条自动设为默认；isDefault=true 时取消其他默认）
 *
 * 用途：积分兑礼礼品寄送（兑换时选择地址并快照入库）。
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withUserAuth } from "@/lib/auth";
import { apiConsole } from "@/lib/logger";
import { MAX_ADDRESSES, addressFieldsSchema, type UserAddressView } from "@/lib/user-address";

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

export const GET = withUserAuth(async (_request: NextRequest, payload) => {
  try {
    const addresses = await prisma.userAddress.findMany({
      where: { userId: payload.id },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });
    return NextResponse.json({
      success: true,
      data: { addresses: addresses.map(toView) },
    });
  } catch (error) {
    apiConsole.error("[UserAddress] 查询失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
});

export const POST = withUserAuth(async (request: NextRequest, payload) => {
  try {
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

    const count = await prisma.userAddress.count({ where: { userId: payload.id } });
    if (count >= MAX_ADDRESSES) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "ADDRESS_LIMIT", message: `最多保存 ${MAX_ADDRESSES} 个收货地址` },
        },
        { status: 400 }
      );
    }

    // 第一条地址自动设为默认；显式指定默认时取消其他默认
    const makeDefault = isDefault === true || count === 0;

    const address = await prisma.$transaction(async (tx) => {
      if (makeDefault) {
        await tx.userAddress.updateMany({
          where: { userId: payload.id, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.userAddress.create({
        data: {
          userId: payload.id,
          recipient,
          phone,
          region,
          detail,
          isDefault: makeDefault,
        },
      });
    });

    return NextResponse.json({ success: true, data: { address: toView(address) } });
  } catch (error) {
    apiConsole.error("[UserAddress] 新增失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
});

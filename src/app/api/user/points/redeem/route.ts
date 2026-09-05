/**
 * 用户积分兑换 API
 * POST /api/user/points/redeem - 兑换产品（产品库中标记可兑的产品，按当前等级兑礼率折算扣分）
 *
 * Body: { productId, addressId, requestId }
 * - addressId：收货地址（兑换时必填，履约寄送；地址快照存入兑换记录）
 * - requestId：客户端为每次确认弹窗生成的唯一 ID（UUID），幂等键；
 *   同一 requestId 重复提交不重复扣分（duplicated: true）。
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withUserAuth } from "@/lib/auth";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { apiConsole } from "@/lib/logger";
import { validateCUID, invalidIdResponse } from "@/lib/validation";
import { redeemGiftForUser } from "@/lib/point-gifts";

const redeemSchema = z.object({
  productId: z.string().min(1).max(64),
  addressId: z.string().min(1, "请选择收货地址").max(64),
  requestId: z.string().min(1, "缺少请求标识").max(64),
});

export const dynamic = "force-dynamic";

export const POST = withUserAuth(async (request: NextRequest, payload) => {
  if (!validateCSRFToken(request)) {
    return csrfForbiddenResponse();
  }

  try {
    const body = await request.json();
    const parsed = redeemSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_PARAMS", message: parsed.error.issues[0]?.message || "参数错误" },
        },
        { status: 400 }
      );
    }

    const { productId, addressId, requestId } = parsed.data;
    if (!validateCUID(productId) || !validateCUID(addressId)) {
      return invalidIdResponse();
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      select: { membershipLevel: true },
    });
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "USER_NOT_FOUND", message: "用户不存在" } },
        { status: 404 }
      );
    }

    const result = await redeemGiftForUser({
      userId: payload.id,
      productId,
      addressId,
      requestId,
      level: user.membershipLevel,
    });

    if (!result.ok) {
      const statusMap: Record<string, number> = {
        PRODUCT_NOT_FOUND: 404,
        PRODUCT_NOT_REDEEMABLE: 400,
        NOT_ELIGIBLE: 403,
        ADDRESS_NOT_FOUND: 400,
        INSUFFICIENT: 400,
        INVALID_REQUEST: 400,
      };
      return NextResponse.json(
        { success: false, error: { code: result.code, message: result.message } },
        { status: statusMap[result.code] ?? 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        redemptionId: result.redemptionId,
        points: result.points,
        available: result.available,
        duplicated: result.duplicated,
      },
    });
  } catch (error) {
    apiConsole.error("[UserPointRedeem] 兑换失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "兑换失败，请稍后重试" } },
      { status: 500 }
    );
  }
});

/**
 * 用户积分兑换 API
 * POST /api/user/points/redeem - 兑换产品（产品库中标记可兑的产品，按当前等级兑礼率折算扣分）
 *
 * Body: { productId, addressId, requestId }
 * - addressId：收货地址（兑换时必填，履约寄送；地址快照存入兑换记录）
 * - requestId：客户端为每次确认弹窗生成的唯一 ID（UUID），幂等键；
 *   同一 requestId 重复提交不重复扣分（duplicated: true）。
 *
 * 数据操作与 OAuth 资源端点（/api/oauth/points/redeem）共用。
 */
import { NextRequest, NextResponse } from "next/server";
import { withUserAuth } from "@/lib/auth";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { rateLimit } from "@/lib/ratelimit";
import { redeemPointsResponse } from "@/lib/points-mall-api";

export const dynamic = "force-dynamic";

export const POST = withUserAuth(async (request: NextRequest, payload) => {
  if (!validateCSRFToken(request)) {
    return csrfForbiddenResponse();
  }

  // 用户级限流：兑换会扣分并生成履约单，防高频兑换滥用
  const limitResult = await rateLimit(`user:${payload.id}`, "default", {
    maxRequests: 10,
    windowMs: 60 * 1000,
  });
  if (!limitResult.success) {
    return NextResponse.json(
      { success: false, error: { code: "RATE_LIMITED", message: "操作过于频繁，请稍后再试" } },
      { status: 429 }
    );
  }

  return redeemPointsResponse(payload.id, request);
});

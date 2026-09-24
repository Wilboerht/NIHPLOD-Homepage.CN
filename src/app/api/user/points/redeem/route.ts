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
import { NextRequest } from "next/server";
import { withUserAuth } from "@/lib/auth";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { redeemPointsResponse } from "@/lib/points-mall-api";

export const dynamic = "force-dynamic";

export const POST = withUserAuth(async (request: NextRequest, payload) => {
  if (!validateCSRFToken(request)) {
    return csrfForbiddenResponse();
  }
  return redeemPointsResponse(payload.id, request);
});

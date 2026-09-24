/**
 * 用户兑换记录 API（积分商城「我的兑换记录」无限滚动加载）
 * GET /api/user/points/redemptions?offset=10
 *
 * - offset：已加载条数（默认 0），每次返回最多 10 条（按兑换时间倒序）
 * - hasMore：是否还有更多记录（客户端据此继续滚动加载）
 *
 * 数据操作与 OAuth 资源端点（/api/oauth/points/redemptions）共用。
 */
import { NextRequest } from "next/server";
import { withUserAuth } from "@/lib/auth";
import { getRedemptionsResponse } from "@/lib/points-mall-api";

export const dynamic = "force-dynamic";

export const GET = withUserAuth(async (request: NextRequest, payload) =>
  getRedemptionsResponse(payload.id, request)
);

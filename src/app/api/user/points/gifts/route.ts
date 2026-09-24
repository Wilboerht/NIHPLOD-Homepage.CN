/**
 * 用户积分兑换 API
 * GET /api/user/points/gifts - 可兑换产品列表（含按当前等级折算的所需积分与产品详情）
 *
 * 数据操作与 OAuth 资源端点（/api/oauth/points/gifts）共用。
 */
import { NextRequest } from "next/server";
import { withUserAuth } from "@/lib/auth";
import { getPointGiftsResponse } from "@/lib/points-mall-api";

export const dynamic = "force-dynamic";

export const GET = withUserAuth(async (_request: NextRequest, payload) =>
  getPointGiftsResponse(payload.id)
);

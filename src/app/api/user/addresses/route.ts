/**
 * 用户收货地址 API
 * GET  /api/user/addresses - 地址列表（默认地址优先，其次按创建时间）
 * POST /api/user/addresses - 新增地址（第一条自动设为默认；isDefault=true 时取消其他默认）
 *
 * 用途：积分兑礼礼品寄送（兑换时选择地址并快照入库）。
 * 数据操作与 OAuth 资源端点（/api/oauth/addresses）共用。
 */
import { NextRequest } from "next/server";
import { withUserAuth } from "@/lib/auth";
import { getAddressesResponse, createAddressResponse } from "@/lib/points-mall-api";

export const dynamic = "force-dynamic";

export const GET = withUserAuth(async (_request: NextRequest, payload) =>
  getAddressesResponse(payload.id)
);

export const POST = withUserAuth(async (request: NextRequest, payload) =>
  createAddressResponse(payload.id, request)
);

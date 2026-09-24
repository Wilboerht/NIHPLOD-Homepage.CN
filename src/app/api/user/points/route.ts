/**
 * 用户积分 API
 * GET /api/user/points - 查询积分余额（含物化：过期/释放）与最近流水
 *
 * 数据操作与 OAuth 资源端点（/api/oauth/points）共用
 * （见 src/lib/points-mall-api.ts），保证两套入口契约一致。
 */
import { NextRequest } from "next/server";
import { withUserAuth } from "@/lib/auth";
import { getPointsOverviewResponse } from "@/lib/points-mall-api";

export const dynamic = "force-dynamic";

export const GET = withUserAuth(async (_request: NextRequest, payload) =>
  getPointsOverviewResponse(payload.id)
);

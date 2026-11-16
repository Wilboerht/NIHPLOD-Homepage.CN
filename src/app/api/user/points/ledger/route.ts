/**
 * 用户积分流水 API
 * GET /api/user/points/ledger?offset=0 - 近一年积分流水（分页，每页 20 条）
 *
 * 与 OAuth /api/oauth/points/ledger 共用 points-mall-api 数据核心。
 */
import { NextRequest, NextResponse } from "next/server";
import { withUserAuth } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";
import { getPointsLedgerResponse } from "@/lib/points-mall-api";

export const dynamic = "force-dynamic";

export const GET = withUserAuth(async (request: NextRequest, payload) => {
  const limited = await rateLimit(`user:${payload.id}`, "default", {
    maxRequests: 30,
    windowMs: 60 * 1000,
  });
  if (!limited.success) {
    return NextResponse.json(
      { success: false, error: { code: "RATE_LIMITED", message: "操作过于频繁，请稍后再试" } },
      { status: 429 }
    );
  }
  return getPointsLedgerResponse(payload.id, request);
});

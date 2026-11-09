/**
 * 用户申请兑换售后
 * POST /api/user/points/redemptions/[id]/after-sales
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyUserAuth } from "@/lib/auth";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { rateLimit } from "@/lib/ratelimit";
import { requestAfterSalesResponse } from "@/lib/points-mall-api";

type RouteContext = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: RouteContext) {
  if (!validateCSRFToken(request)) return csrfForbiddenResponse();
  const user = await verifyUserAuth(request);
  if (!user) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "请先登录" } },
      { status: 401 }
    );
  }
  const limit = await rateLimit(`user:${user.id}`, "default", {
    maxRequests: 5,
    windowMs: 60 * 1000,
  });
  if (!limit.success) {
    return NextResponse.json(
      { success: false, error: { code: "RATE_LIMITED", message: "操作过于频繁，请稍后再试" } },
      { status: 429 }
    );
  }
  const { id } = await context.params;
  return requestAfterSalesResponse(user.id, id, request);
}

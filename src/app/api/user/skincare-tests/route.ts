/**
 * 护肤档案 · 测肤记录 BFF（主站用户中心「护肤档案」）
 * GET /api/user/skincare-tests?page=&limit=&lite=1&before=<ISO>
 *
 * 代理子站 /api/internal/test-history，透传 { history, pagination }；
 * 子站不可达时返回 502 契约错误（前端展示错误条 + 重试）。
 */
import { NextRequest, NextResponse } from "next/server";
import { withUserAuth } from "@/lib/auth";
import { advisorRequest, mapAdvisorError, resolveClientIp } from "@/lib/advisor-internal";

export const dynamic = "force-dynamic";

export const GET = withUserAuth(async (request: NextRequest, payload) => {
  const { searchParams } = new URL(request.url);

  // 用户真实 IP：子站懒认领历史游客测肤会话用
  const clientIp = resolveClientIp(request);

  const result = await advisorRequest<unknown>("/api/internal/test-history", {
    query: {
      userId: payload.id,
      clientIp: clientIp === "unknown" ? undefined : clientIp,
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      lite: searchParams.get("lite") ?? undefined,
      before: searchParams.get("before") ?? undefined,
    },
  });

  if (!result.ok) {
    const mapped = mapAdvisorError(result);
    return NextResponse.json(
      { success: false, error: { code: mapped.code, message: mapped.message } },
      { status: mapped.status }
    );
  }

  return NextResponse.json(result.data);
});

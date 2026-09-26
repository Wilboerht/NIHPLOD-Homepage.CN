/**
 * 护肤档案 · 肌肤评分趋势 BFF（主站用户中心「护肤档案」）
 * GET /api/user/skincare-trends
 *
 * 代理子站 /api/internal/skin-trends，原样透传 { success, data }；
 * data=null 表示子站有效测肤样本不足 2 次（前端走解锁引导）。
 * 子站不可达时返回 502 契约错误（前端展示错误条 + 重试）。
 */
import { NextRequest, NextResponse } from "next/server";
import { withUserAuth } from "@/lib/auth";
import { advisorRequest, mapAdvisorError, resolveClientIp } from "@/lib/advisor-internal";

export const dynamic = "force-dynamic";

export const GET = withUserAuth(async (request: NextRequest, payload) => {
  // 用户真实 IP：子站先做游客会话懒认领再取趋势（与档案/测肤列表一致）
  const clientIp = resolveClientIp(request);

  const result = await advisorRequest<unknown>("/api/internal/skin-trends", {
    query: { userId: payload.id, clientIp: clientIp === "unknown" ? undefined : clientIp },
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

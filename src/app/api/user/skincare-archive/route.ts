/**
 * 护肤档案 BFF（主站用户中心「护肤档案」）
 * GET /api/user/skincare-archive?bootstrap=1&limit=&before=&month=&offset=
 * POST /api/user/skincare-archive（打卡/更新，body 同子站：{ date, skinState, tags, note }）
 * DELETE /api/user/skincare-archive?date=YYYY-MM-DD
 *
 * 代理子站内部接口（子站是护肤档案唯一数据源）：
 * - bootstrap=1 → /api/internal/diary/archive（首屏聚合：条目+分页+里程碑统计）
 * - 其他        → /api/internal/diary（时间线游标分页 / 日历月 / 写入 / 删除）
 *
 * 积分策略：官网是自己的积分账本，打卡写入成功后由本路由直接发分
 * （grantCheckinPoints，reference=checkin:{userId}:{date} 与子站口径一致、幂等）；
 * 子站内部写入路径不发分，避免重复。
 *
 * 成功时原样透传子站响应体（{ success, data, pagination, summary }），
 * 子站不可达时返回 502 契约错误（前端展示错误条 + 重试）。
 */
import { NextRequest, NextResponse } from "next/server";
import { withUserAuth } from "@/lib/auth";
import { advisorRequest, mapAdvisorError, resolveClientIp } from "@/lib/advisor-internal";
import { upsertSkincareDiary } from "@/lib/skincare-diary";

export const dynamic = "force-dynamic";

export const GET = withUserAuth(async (request: NextRequest, payload) => {
  const { searchParams } = new URL(request.url);
  const bootstrap = searchParams.get("bootstrap") === "1";

  // 用户真实 IP：子站懒认领历史游客测肤会话用（服务器间调用本身代表不了用户 IP；
  // resolveClientIp 在 TRUST_PROXY 未配置等异常时降级 "unknown"，不打断主流程）
  const clientIp = resolveClientIp(request);

  const result = await advisorRequest<unknown>(
    bootstrap ? "/api/internal/diary/archive" : "/api/internal/diary",
    {
      query: {
        userId: payload.id,
        clientIp: clientIp === "unknown" ? undefined : clientIp,
        limit: searchParams.get("limit") ?? undefined,
        before: searchParams.get("before") ?? undefined,
        month: searchParams.get("month") ?? undefined,
        offset: searchParams.get("offset") ?? undefined,
      },
    }
  );

  if (!result.ok) {
    const mapped = mapAdvisorError(result);
    return NextResponse.json(
      { success: false, error: { code: mapped.code, message: mapped.message } },
      { status: mapped.status }
    );
  }

  return NextResponse.json(result.data);
});

export const POST = withUserAuth(async (request: NextRequest, payload) => {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { success: false, error: { code: "INVALID_BODY", message: "请求格式错误" } },
      { status: 400 }
    );
  }
  const result = await upsertSkincareDiary(payload.id, body);
  if (!result.ok) {
    const mapped = mapAdvisorError(result);
    return NextResponse.json(
      { success: false, error: { code: mapped.code, message: mapped.message } },
      { status: mapped.status }
    );
  }
  return NextResponse.json({
    success: true,
    data: result.entry,
    ...(result.points ? { points: result.points } : {}),
  });
});

export const DELETE = withUserAuth(async (request: NextRequest, payload) => {
  const { searchParams } = new URL(request.url);

  const result = await advisorRequest<{ success?: boolean; deleted?: number }>(
    "/api/internal/diary",
    {
      method: "DELETE",
      query: { userId: payload.id, date: searchParams.get("date") ?? undefined },
    }
  );

  if (!result.ok) {
    const mapped = mapAdvisorError(result);
    return NextResponse.json(
      { success: false, error: { code: mapped.code, message: mapped.message } },
      { status: mapped.status }
    );
  }

  return NextResponse.json({ success: true, deleted: result.data?.deleted ?? 0 });
});

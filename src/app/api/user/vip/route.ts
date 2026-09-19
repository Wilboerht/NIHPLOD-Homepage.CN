/**
 * 会员信息 API
 * GET /api/user/vip - 获取用户会员等级、累计消费、权益信息
 *
 * 等级体系（四档）：普通会员(注册) / 银卡(消费满 ¥1,000) / 金卡(消费满 ¥5,000) / 钻石卡(消费满 ¥10,000)
 */
import { NextRequest, NextResponse } from "next/server";
import { withUserAuth } from "@/lib/auth";
import { getMembershipView } from "@/lib/membership-view";
import { apiConsole } from "@/lib/logger";
import { createSignedInternalRequestHeaders } from "@/lib/internal-api";

export const dynamic = "force-dynamic";

/** 测肤子站（advisor.nihplod.cn）返回的 AI 测肤用量 */
interface SkinTestUsage {
  // level 可能为 null：子站对从未使用过测肤的用户返回 level: null
  level: string | null;
  totalUsed: number;
  todayUsed: number;
  quota: {
    lifetimeLimit: number | null;
    dailyLimit: number | null;
    unlimited: boolean;
  };
  remaining: number | null;
}

/**
 * 查询测肤子站的 AI 测肤已用次数（服务端到服务端内部接口）。
 * 任何失败（env 未配置 / 超时 / 网络错误 / 非 2xx）都返回 null，绝不影响 VIP 主流程。
 */
async function fetchSkinTestUsage(userId: string): Promise<SkinTestUsage | null> {
  try {
    // 优先 HMAC 签名调用（防重放，子站不再产生"旧版 Bearer"告警）；
    // INTERNAL_API_KEYS 未配置 advisor 条目时回退旧版 Bearer（ADVISOR_INTERNAL_SECRET）
    const signedHeaders = createSignedInternalRequestHeaders(
      "advisor",
      "GET",
      "/api/internal/skin-test-usage"
    );
    const secret = process.env.ADVISOR_INTERNAL_SECRET;
    if (!signedHeaders && !secret) return null;
    const base = (process.env.ADVISOR_API_BASE || "https://advisor.nihplod.cn").replace(/\/+$/, "");
    const res = await fetch(
      `${base}/api/internal/skin-test-usage?userId=${encodeURIComponent(userId)}`,
      {
        headers: signedHeaders ?? { Authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(3000),
        cache: "no-store",
      }
    );
    if (!res.ok) return null;
    return (await res.json()) as SkinTestUsage;
  } catch {
    return null;
  }
}

export const GET = withUserAuth(async (_request: NextRequest, payload) => {
  try {
    // 会员视图（等级/累计消费/权益配置）与 OAuth /api/oauth/membership 共用组装逻辑
    const view = await getMembershipView(payload.id);

    if (!view) {
      return NextResponse.json(
        { success: false, error: { code: "USER_NOT_FOUND", message: "用户不存在" } },
        { status: 404 }
      );
    }

    // AI 测肤用量查询在 404 判断之后发起：用户不存在时不白跑子站请求。
    // 失败时降级为 null，不影响主流程。
    const skinTestUsage = await fetchSkinTestUsage(payload.id);

    return NextResponse.json({
      success: true,
      data: {
        ...view,
        skinTestUsage,
      },
    });
  } catch (error) {
    apiConsole.error("[GetVIP] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
});

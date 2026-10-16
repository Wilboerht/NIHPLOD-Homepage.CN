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
import { fetchSkinTestUsage } from "@/lib/skin-test-usage";

export const dynamic = "force-dynamic";

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

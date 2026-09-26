/**
 * 用户第三方绑定列表
 * GET /api/user/identities
 *
 * 返回当前登录用户已绑定的第三方身份（微信开放平台/服务号/小程序、抖音等），
 * 供用户中心「安全中心 → 账号绑定」展示与自助解绑。
 * 注意：不返回 subjectId（openid），避免第三方平台标识在本站页面/日志中泄漏。
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyUserAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiConsole } from "@/lib/logger";
import { WECHAT_PLACEHOLDER_PHONE_PREFIX } from "@/types/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await verifyUserAuth(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "请先登录" } },
        { status: 401 }
      );
    }

    const [identities, account] = await Promise.all([
      prisma.externalIdentity.findMany({
        where: { userId: user.id },
        select: { id: true, provider: true, metadata: true, createdAt: true, updatedAt: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.user.findUnique({
        where: { id: user.id },
        select: { phone: true },
      }),
    ]);

    // 占位手机号（微信自动建号未绑定真实号码）解绑后将无可用登录方式，拒绝解绑
    const hasRealPhone =
      !!account?.phone && !account.phone.startsWith(WECHAT_PLACEHOLDER_PHONE_PREFIX);

    const data = identities.map((i) => {
      const meta = (i.metadata ?? null) as { nickname?: string | null; avatar?: string | null } | null;
      return {
        id: i.id,
        provider: i.provider,
        nickname: meta?.nickname ?? null,
        avatar: meta?.avatar ?? null,
        createdAt: i.createdAt.toISOString(),
        lastSyncAt: i.updatedAt.toISOString(),
        canUnbind: hasRealPhone,
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    apiConsole.error("[UserIdentities] 查询失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器内部错误" } },
      { status: 500 }
    );
  }
}

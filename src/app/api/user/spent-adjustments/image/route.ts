/**
 * 私有凭证图片访问端点（用户端）
 * GET /api/user/spent-adjustments/image?key=<objectName>
 *
 * 仅允许凭证所属用户查看：验证登录态 + 申请归属后，重定向到私有 bucket 的
 * 短时效签名 URL（24 小时）。私有 bucket 未配置时返回 404。
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyUserAuth } from "@/lib/auth";
import { apiConsole } from "@/lib/logger";
import { signPrivateObjectUrl } from "@/lib/ali-oss";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const payload = await verifyUserAuth(request);
    if (!payload) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "请先登录" } },
        { status: 401 }
      );
    }

    const key = request.nextUrl.searchParams.get("key");
    if (!key || key.length > 200) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: "参数错误" } },
        { status: 400 }
      );
    }

    // 归属校验：该对象必须属于当前用户自己的申请
    const application = await prisma.spentAdjustmentApplication.findFirst({
      where: { userId: payload.id, images: { has: key } },
      select: { id: true },
    });

    if (!application) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "图片不存在" } },
        { status: 404 }
      );
    }

    const signedUrl = signPrivateObjectUrl(key);
    if (!signedUrl) {
      apiConsole.warn("[SpentAdjustment] 私有 bucket 未配置，无法签发图片 URL");
      return NextResponse.json(
        { success: false, error: { code: "NOT_CONFIGURED", message: "图片服务未配置" } },
        { status: 404 }
      );
    }

    return NextResponse.redirect(signedUrl, 302);
  } catch (error) {
    apiConsole.error("[SpentAdjustment] 凭证图片访问失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

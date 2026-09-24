/**
 * 消费补录凭证上传 API（用户端）
 * POST /api/user/spent-adjustments/upload - 上传凭证截图（仅图片）
 *
 * 存储策略：
 * - 配置了 ALI_OSS_PRIVATE_BUCKET 时，凭证上传至私有 bucket，返回 objectName（不公开）；
 *   展示/下载一律走鉴权签名 URL（/api/user/spent-adjustments/image）；
 * - 未配置时回退公开管线（与产品图一致，返回可直接访问的 URL）。
 * 上传逻辑与 OAuth 资源端点共用（见 src/lib/spent-adjustment-files.ts）。
 */
import { NextRequest, NextResponse } from "next/server";
import { withUserAuth } from "@/lib/auth";
import { apiConsole } from "@/lib/logger";
import { rateLimit } from "@/lib/ratelimit";
import { uploadSpentProofFile } from "@/lib/spent-adjustment-files";

export const dynamic = "force-dynamic";

export const POST = withUserAuth(async (request: NextRequest, payload) => {
  try {
    // 用户级上传限流（凭证上传，防滥用）
    const limitResult = await rateLimit(`user-upload:${payload.id}`, "default", {
      maxRequests: 20,
      windowMs: 60 * 1000,
    });
    if (!limitResult.success) {
      return NextResponse.json(
        { success: false, error: { code: "RATE_LIMITED", message: "上传过于频繁，请稍后再试" } },
        { status: 429 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: { code: "NO_FILE", message: "请选择要上传的图片" } },
        { status: 400 }
      );
    }

    const result = await uploadSpentProofFile(file);
    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: { code: result.code, message: result.message } },
        { status: result.status }
      );
    }

    return NextResponse.json({
      success: true,
      data: { url: result.url, private: result.private },
    });
  } catch (error) {
    apiConsole.error("[SpentAdjustment] 凭证上传失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "上传失败，请稍后重试" } },
      { status: 500 }
    );
  }
});

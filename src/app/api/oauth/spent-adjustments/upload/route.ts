/**
 * OAuth 2.0 消费补录凭证上传端点
 * POST /api/oauth/spent-adjustments/upload - 上传凭证截图（仅图片）
 *
 * 与主站会话路由共用上传逻辑（src/lib/spent-adjustment-files.ts）：
 * 私有 bucket 优先，未配置时回退公开管线。要求 scope 含 membership。
 * 请求体 multipart/form-data，文件字段名 file。
 */
import { NextRequest, NextResponse } from "next/server";
import { getOAuthCorsHeaders } from "@/lib/oauth-cors";
import { scheduleSsoEvent } from "@/lib/sso-audit";
import { authenticateOAuthResourceRequest, isM2mPayload } from "@/lib/oauth-resource-auth";
import { guardOAuthUserActive } from "@/lib/oauth-user-guard";
import { uploadSpentProofFile, isSpentProofMultipartTooLarge } from "@/lib/spent-adjustment-files";
import { rateLimit } from "@/lib/ratelimit";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateOAuthResourceRequest(request, "POST");
    if (!auth.ok) return auth.response;
    const { payload, ip, resJson } = auth;

    if (isM2mPayload(payload)) {
      return resJson(
        { error: "invalid_request", error_description: "client_credentials token 无用户身份" },
        403
      );
    }

    const scopes = (payload.scope || "").split(" ").filter(Boolean);
    if (!scopes.includes("membership")) {
      scheduleSsoEvent({
        event: "userinfo",
        userId: payload.id,
        clientId: payload.client_id,
        ip,
        success: false,
        detail: { action: "spent_adjustments_upload", reason: "insufficient_scope" },
      });
      return resJson(
        { error: "insufficient_scope", error_description: "需要 membership scope" },
        403,
        { "WWW-Authenticate": 'Bearer error="insufficient_scope", scope="membership"' }
      );
    }

    const guard = await guardOAuthUserActive(payload.id);
    if (!guard.ok) {
      return resJson({ error: guard.error, error_description: guard.errorDescription }, guard.status);
    }

    // 用户级上传限流（与主站会话路由同口径）
    const limitResult = await rateLimit(`user-upload:${payload.id}`, "default", {
      maxRequests: 20,
      windowMs: 60 * 1000,
    });
    if (!limitResult.success) {
      return resJson(
        { success: false, error: { code: "RATE_LIMITED", message: "上传过于频繁，请稍后再试" } },
        429
      );
    }

    // 解析 multipart 前先按 Content-Length 粗筛，避免超大请求体完整缓冲进内存
    if (isSpentProofMultipartTooLarge(request.headers.get("content-length"))) {
      return resJson({ success: false, error: { code: "FILE_TOO_LARGE", message: "文件过大" } }, 413);
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return resJson({ success: false, error: { code: "NO_FILE", message: "请选择要上传的图片" } }, 400);
    }

    const result = await uploadSpentProofFile(file, payload.id);
    if (!result.ok) {
      return resJson(
        { success: false, error: { code: result.code, message: result.message } },
        result.status
      );
    }

    return resJson({ success: true, data: { url: result.url, private: result.private } });
  } catch (error) {
    apiConsole.error("[OAuth SpentAdjustments] 凭证上传失败:", error);
    return NextResponse.json(
      { error: "server_error", error_description: "服务器内部错误" },
      { status: 500 }
    );
  }
}

export async function OPTIONS(request: NextRequest) {
  const corsHeaders = await getOAuthCorsHeaders(request);
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

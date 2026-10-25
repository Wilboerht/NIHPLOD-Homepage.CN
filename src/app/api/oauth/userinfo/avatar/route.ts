/**
 * OAuth 2.0 用户头像上传端点
 * POST /api/oauth/userinfo/avatar - 上传头像图片（multipart/form-data，字段名 file）
 *
 * 要求 scope 含 profile:write（与资料修改同权限）。图片经服务端压缩（sharp）后
 * 存入公开存储（OSS / 本地），返回绝对 URL；调用方随后 PATCH（或 PUT）
 * /api/oauth/userinfo 将 avatar 更新为该 URL。
 *
 * 为什么需要本端点：/api/oss/sign 与 /api/upload 仅认主站会话/管理员凭证，
 * 微信小程序（OAuth Bearer，且 wx.uploadFile 无法携带签名流程）没有可用的上传通道。
 *
 * 图片大小限制 5MB；仅支持 JPG / PNG / WebP（服务端真实类型检测防 MIME 伪造）。
 */
import { NextRequest, NextResponse } from "next/server";
import { getOAuthCorsHeaders } from "@/lib/oauth-cors";
import { scheduleSsoEvent } from "@/lib/sso-audit";
import { authenticateOAuthResourceRequest, isM2mPayload } from "@/lib/oauth-resource-auth";
import { guardOAuthUserActive } from "@/lib/oauth-user-guard";
import { rateLimit } from "@/lib/ratelimit";
import { BODY_LIMITS } from "@/lib/body-limits";
import {
  isBodyTooLargeError,
  payloadTooLargeResponse,
  readFormDataBody,
} from "@/lib/request-body";
import { processAndSaveImage, validateFileBuffer } from "@/lib/upload";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

const MAX_AVATAR_SIZE = 5 * 1024 * 1024; // 5MB
/** 头像允许的图片真实类型（validateFileBuffer 输出） */
const ALLOWED_DETECTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

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

    // 写权限门槛与资料修改一致：profile:write
    const scopes = (payload.scope || "").split(" ").filter(Boolean);
    if (!scopes.includes("profile:write")) {
      scheduleSsoEvent({
        event: "userinfo",
        userId: payload.id,
        clientId: payload.client_id,
        ip,
        success: false,
        detail: { action: "avatar_upload", reason: "insufficient_scope" },
      });
      return resJson(
        { error: "insufficient_scope", error_description: "需要 profile:write scope" },
        403,
        { "WWW-Authenticate": 'Bearer error="insufficient_scope", scope="profile:write"' }
      );
    }

    const guard = await guardOAuthUserActive(payload.id);
    if (!guard.ok) {
      return resJson(
        { error: guard.error, error_description: guard.errorDescription },
        guard.status
      );
    }

    // 用户级上传限流（与消费补录凭证上传同口径）
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

    // 解析 multipart 前按 Content-Length 粗筛，避免超大请求体完整缓冲进内存
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > MAX_AVATAR_SIZE + 512 * 1024) {
      return resJson(
        { success: false, error: { code: "FILE_TOO_LARGE", message: "图片大小不能超过 5MB" } },
        413
      );
    }

    const formData = await readFormDataBody(request, BODY_LIMITS.imageUpload);
    const file = formData.get("file") as File | null;
    if (!file) {
      return resJson(
        { success: false, error: { code: "NO_FILE", message: "请选择头像图片" } },
        400
      );
    }
    if (file.size > MAX_AVATAR_SIZE) {
      return resJson(
        { success: false, error: { code: "FILE_TOO_LARGE", message: "图片大小不能超过 5MB" } },
        413
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // 真实文件类型检测（防 MIME 伪造；同时拦截伪装成图片的 PDF/GIF 等）
    const typeCheck = await validateFileBuffer(buffer);
    if (!typeCheck.valid || !ALLOWED_DETECTED_TYPES.includes(typeCheck.detectedType ?? "")) {
      return resJson(
        {
          success: false,
          error: { code: "INVALID_FILE_TYPE", message: "仅支持 JPG / PNG / WebP 图片" },
        },
        400
      );
    }

    // 服务端压缩处理（sharp）后存入公开存储
    const result = await processAndSaveImage(buffer, `avatar-${payload.id}`, "avatars");

    // 本地存储模式返回相对路径（/uploads/...）：补全为绝对地址，
    // 以满足 profile.avatar 的 https URL 校验与小程序 <image> 加载
    const url = result.url.startsWith("/")
      ? `${(process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "")}${result.url}`
      : result.url;

    scheduleSsoEvent({
      event: "userinfo",
      userId: payload.id,
      clientId: payload.client_id,
      ip,
      success: true,
      detail: { action: "avatar_upload" },
    });

    return resJson({ success: true, data: { url } });
  } catch (error) {
    if (isBodyTooLargeError(error)) return payloadTooLargeResponse(error.limit);
    apiConsole.error("[OAuth UserInfo] 头像上传失败:", error);
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

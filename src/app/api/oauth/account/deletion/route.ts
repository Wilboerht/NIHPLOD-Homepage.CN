/**
 * OAuth 2.0 账号注销端点
 * GET    /api/oauth/account/deletion - 查询进行中的注销申请（无则 request: null）
 * POST   /api/oauth/account/deletion - 提交注销申请（冷静期，幂等；同微信/账号重复提交返回既有申请）
 * DELETE /api/oauth/account/deletion - 撤回申请
 *
 * 与主站会话路由（/api/user/account/deletion）共用核心（src/lib/account-deletion-requests.ts）。
 * scope：查询需 profile；提交/撤回为账号级破坏性写操作，需 profile:write。
 *
 * 安全边界说明：
 * - 小程序用户密码为注册时自动生成（不可知），本通道改为要求本人手机号收到的
 *   一次性注销短信验证码（POST /send-code 获取）；Bearer token 本身不足以提交注销；
 *   破坏性操作仍由冷静期（默认 7 天，可随时撤回）兜底；
 * - 用户级频控与主站共享桶：申请 3 次/天、撤回 5 次/天；
 * - 占位手机号（wx_ 前缀）账号停留在 need-binding，不会持有 OAuth token，天然不可达；
 * - 审计与请求日志仅用 user id / clientId，不落明文手机号。
 *
 * CORS：仅允许已注册 redirect_uri 的 origin。
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOAuthCorsHeaders } from "@/lib/oauth-cors";
import { authenticateOAuthUserRequest } from "@/lib/oauth-user-auth";
import { rateLimit } from "@/lib/ratelimit";
import { BODY_LIMITS } from "@/lib/body-limits";
import {
  isBodyTooLargeError,
  payloadTooLargeResponse,
  readJsonBodyOrDefault,
} from "@/lib/request-body";
import { prisma } from "@/lib/prisma";
import { SMS_CODE_MAX_ATTEMPTS, verifySmsCodeWithLimit } from "@/lib/sms";
import { apiConsole } from "@/lib/logger";
import {
  getDeletionStatus,
  submitDeletionRequest,
  cancelDeletionRequest,
} from "@/lib/account-deletion-requests";

export const dynamic = "force-dynamic";

const READ_SCOPE = "profile";
const WRITE_SCOPE = "profile:write";

const requestSchema = z.object({
  reason: z.string().max(500, "注销原因最多 500 字").optional(),
  // 二次验证：必须提供本人手机号收到的一次性短信验证码
  smsCode: z.string().regex(/^\d{6}$/, "请输入 6 位短信验证码"),
});

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateOAuthUserRequest(request, "GET", {
      scope: READ_SCOPE,
      action: "account_deletion_status",
    });
    if (!auth.ok) return auth.response;

    const status = await getDeletionStatus(auth.payload.id);
    return auth.resJson({ success: true, data: { request: status } });
  } catch (error) {
    apiConsole.error("[OAuth AccountDeletion] 查询异常:", error);
    return NextResponse.json(
      { error: "server_error", error_description: "服务器内部错误" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateOAuthUserRequest(request, "POST", {
      scope: WRITE_SCOPE,
      action: "account_deletion_request",
    });
    if (!auth.ok) return auth.response;
    const { payload, ip, resJson } = auth;

    // 用户级频控：3 次/天（与主站共享桶）
    const limitResult = await rateLimit(`user:${payload.id}`, "account-deletion");
    if (!limitResult.success) {
      return resJson(
        {
          success: false,
          error: { code: "TOO_MANY_REQUESTS", message: "操作过于频繁，请稍后再试" },
        },
        429
      );
    }

    const body = await readJsonBodyOrDefault(request, BODY_LIMITS.oauthJson, {});
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return resJson(
        {
          success: false,
          error: { code: "INVALID_PARAMS", message: parsed.error.issues[0]?.message || "参数错误" },
        },
        400
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      select: { phone: true },
    });
    if (!user) {
      return resJson(
        { success: false, error: { code: "ACCOUNT_NOT_FOUND", message: "账号不存在" } },
        404
      );
    }

    const smsCode = await prisma.smsCode.findFirst({
      where: {
        phone: user.phone,
        type: "deletion",
        used: false,
        attempts: { lt: SMS_CODE_MAX_ATTEMPTS },
        expiresAt: { gte: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });
    if (!smsCode) {
      return resJson(
        {
          success: false,
          error: { code: "SMS_CODE_REQUIRED", message: "请先获取注销短信验证码" },
        },
        400
      );
    }

    if (!(await verifySmsCodeWithLimit(user.phone, parsed.data.smsCode, "deletion", smsCode.id))) {
      return resJson(
        { success: false, error: { code: "SMS_CODE_INVALID", message: "验证码错误或已过期" } },
        400
      );
    }

    const consumed = await prisma.smsCode.updateMany({
      where: { id: smsCode.id, used: false },
      data: { used: true },
    });
    if (consumed.count === 0) {
      return resJson(
        { success: false, error: { code: "SMS_CODE_INVALID", message: "验证码已被使用" } },
        400
      );
    }

    const result = await submitDeletionRequest({
      userId: payload.id,
      reason: parsed.data.reason,
      via: "oauth",
      clientId: payload.client_id,
      ip,
      ua: request.headers.get("user-agent"),
      request,
    });
    if (!result.ok) {
      return resJson(
        { success: false, error: { code: result.code, message: result.message } },
        result.status
      );
    }

    return resJson({
      success: true,
      data: { request: result.request, warnings: result.warnings },
    });
  } catch (error) {
    if (isBodyTooLargeError(error)) return payloadTooLargeResponse(error.limit);
    apiConsole.error("[OAuth AccountDeletion] 申请异常:", error);
    return NextResponse.json(
      { error: "server_error", error_description: "服务器内部错误" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await authenticateOAuthUserRequest(request, "DELETE", {
      scope: WRITE_SCOPE,
      action: "account_deletion_cancel",
    });
    if (!auth.ok) return auth.response;
    const { payload, ip, resJson } = auth;

    // 用户级频控：5 次/天（与主站共享桶）
    const limitResult = await rateLimit(`user:${payload.id}`, "account-deletion-cancel");
    if (!limitResult.success) {
      return resJson(
        {
          success: false,
          error: { code: "TOO_MANY_REQUESTS", message: "操作过于频繁，请稍后再试" },
        },
        429
      );
    }

    const result = await cancelDeletionRequest({
      userId: payload.id,
      via: "oauth",
      clientId: payload.client_id,
      ip,
      ua: request.headers.get("user-agent"),
      request,
    });
    if (!result.ok) {
      return resJson(
        { success: false, error: { code: result.code, message: result.message } },
        result.status
      );
    }

    return resJson({ success: true, data: { message: "注销申请已撤回" } });
  } catch (error) {
    apiConsole.error("[OAuth AccountDeletion] 撤回异常:", error);
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

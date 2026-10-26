/**
 * 账号自助注销申请（设计稿 docs/account-deletion-plan.md 第 6 节）
 *
 * GET    /api/user/account/deletion  查询当前进行中的注销申请（无则 request: null）
 * POST   /api/user/account/deletion  提交注销申请（密码验证 + CSRF + 用户级频控 3 次/天；
 *                                    幂等：已有 PENDING 申请直接返回既有申请；CANCELLED/FAILED 记录原位重置）
 * DELETE /api/user/account/deletion  撤回申请（用户级频控 5 次/天）
 *
 * 申请/查询/撤回核心与 OAuth 端点（/api/oauth/account/deletion）共用：
 * src/lib/account-deletion-requests.ts，避免冷却期与幂等语义漂移。
 *
 * 安全与口径：
 * - 微信占位手机号账号（wx_ 前缀，无密码可验）本期不支持网页端注销，引导联系客服；
 * - 审计 createAuditLog + logAuthEvent 均只用 user id，不落明文手机号；
 * - 注销不物理删除用户：到期后由执行任务匿名化（status=DELETED、phone 改 deleted_<hash>），
 *   匿名占位手机号不符合 1[3-9]\d{9} 格式，登录/发码侧天然拒绝。
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withUserAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import { verifyPassword } from "@/lib/password";
import { logAuthEvent } from "@/lib/auth-logger";
import { apiConsole } from "@/lib/logger";
import {
  getDeletionStatus,
  submitDeletionRequest,
  cancelDeletionRequest,
} from "@/lib/account-deletion-requests";
import { WECHAT_PLACEHOLDER_PHONE_PREFIX } from "@/types/auth";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  password: z.string().min(1, "请输入密码").optional(),
  reason: z.string().max(500, "注销原因最多 500 字").optional(),
});

export const GET = withUserAuth(async (_request: NextRequest, payload) => {
  try {
    const request = await getDeletionStatus(payload.id);
    return NextResponse.json({ success: true, data: { request } });
  } catch (error) {
    apiConsole.error("[AccountDeletion] 查询异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
});

export const POST = withUserAuth(async (request: NextRequest, payload) => {
  try {
    // 用户级频控：3 次/天（防恶意注销/滥用；与 OAuth 通道共享桶）
    const limitResult = await rateLimit(`user:${payload.id}`, "account-deletion");
    if (!limitResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "TOO_MANY_REQUESTS", message: "操作过于频繁，请稍后再试" },
        },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_PARAMS", message: parsed.error.issues[0]?.message || "参数错误" },
        },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      select: { id: true, phone: true, password: true, status: true },
    });

    if (!user || user.status !== "ACTIVE") {
      return NextResponse.json(
        {
          success: false,
          error: { code: "ACCOUNT_NOT_ACTIVE", message: "账号状态异常，无法申请注销" },
        },
        { status: 403 }
      );
    }

    // 身份验证：微信占位手机号账号无密码可验，本期引导线下渠道
    if (user.phone.startsWith(WECHAT_PLACEHOLDER_PHONE_PREFIX)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "PLACEHOLDER_ACCOUNT_UNSUPPORTED",
            message: "微信快捷注册的账号暂不支持网页端自助注销，请联系客服 service@nihplod.cn 办理",
          },
        },
        { status: 400 }
      );
    }

    if (!user.password) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "PASSWORD_NOT_SET", message: "请先在安全中心设置登录密码后再申请注销" },
        },
        { status: 400 }
      );
    }

    if (!parsed.data.password) {
      return NextResponse.json(
        { success: false, error: { code: "PASSWORD_REQUIRED", message: "请输入密码" } },
        { status: 400 }
      );
    }

    const passwordOk = await verifyPassword(parsed.data.password, user.password);
    if (!passwordOk) {
      logAuthEvent("user_account_deletion_request", {
        userId: user.id,
        ip: getClientIP(request),
        ua: request.headers.get("user-agent"),
        success: false,
        reason: "password_incorrect",
      });
      return NextResponse.json(
        { success: false, error: { code: "PASSWORD_INCORRECT", message: "密码错误" } },
        { status: 403 }
      );
    }

    const result = await submitDeletionRequest({
      userId: user.id,
      reason: parsed.data.reason,
      via: "web",
      ip: getClientIP(request),
      ua: request.headers.get("user-agent"),
      request,
    });
    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: { code: result.code, message: result.message } },
        { status: result.status }
      );
    }

    return NextResponse.json({
      success: true,
      data: { request: result.request, warnings: result.warnings },
    });
  } catch (error) {
    apiConsole.error("[AccountDeletion] 申请异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
});

export const DELETE = withUserAuth(async (request: NextRequest, payload) => {
  try {
    // 用户级频控：5 次/天（独立于申请额度，防撤回接口被滥用探测状态；与 OAuth 通道共享桶）
    const limitResult = await rateLimit(`user:${payload.id}`, "account-deletion-cancel");
    if (!limitResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "TOO_MANY_REQUESTS", message: "操作过于频繁，请稍后再试" },
        },
        { status: 429 }
      );
    }

    const result = await cancelDeletionRequest({
      userId: payload.id,
      via: "web",
      ip: getClientIP(request),
      ua: request.headers.get("user-agent"),
      request,
    });
    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: { code: result.code, message: result.message } },
        { status: result.status }
      );
    }

    return NextResponse.json({ success: true, data: { message: "注销申请已撤回" } });
  } catch (error) {
    apiConsole.error("[AccountDeletion] 撤回异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
});

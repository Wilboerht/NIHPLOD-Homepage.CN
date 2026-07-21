/**
 * 内部 API v1：查询用户状态（供子站同步用）
 * POST /api/v1/internal/user/status
 *
 * 子站通过此接口定期校验本地缓存的用户会话是否仍然有效。
 * 当官网管理员将用户状态改为 SUSPENDED 或 BANNED 后，
 * 子站在下一次 getSession() 调用中（最多 TTL 延迟）会感知到并强制登出。
 *
 * 认证方式：HMAC-SHA256 签名（与 /api/v1/internal/wechat/send-template 一致）。
 *
 * Body：
 *   userId: string  （必填，用户 ID）
 *
 * 响应：
 *   success: true
 *   data: { userId, status: "ACTIVE" | "SUSPENDED" | "BANNED", phone }
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import {
  verifyInternalApiSignature,
  isTimestampValid,
  checkAndRecordNonce,
  hashRequestBody,
} from "@/lib/internal-api";
import { z } from "zod";
import { apiConsole } from "@/lib/logger";

const statusQuerySchema = z.object({
  userId: z.string().cuid(),
});

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    // 1. IP 速率限制（允许高频查询，子站可能有大量并发用户）
    const ip = getClientIP(request);
    const limitResult = await rateLimit(ip, "default", { maxRequests: 300, windowMs: 60 * 1000 });
    if (!limitResult.success) {
      return NextResponse.json(
        { success: false, error: { code: "RATE_LIMITED", message: "请求过于频繁" } },
        { status: 429 }
      );
    }

    // 2. 读取并校验鉴权头
    const key = request.headers.get("x-internal-api-key");
    const signature = request.headers.get("x-internal-api-signature");
    const timestampHeader = request.headers.get("x-internal-api-timestamp");
    const nonce = request.headers.get("x-internal-api-nonce");

    if (!key || !signature || !timestampHeader || !nonce) {
      return NextResponse.json(
        { success: false, error: { code: "MISSING_AUTH", message: "缺少鉴权头" } },
        { status: 401 }
      );
    }

    const timestamp = parseInt(timestampHeader, 10);
    if (Number.isNaN(timestamp) || !isTimestampValid(timestamp)) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_TIMESTAMP", message: "请求时间戳无效或已过期" } },
        { status: 401 }
      );
    }

    if (!checkAndRecordNonce(nonce)) {
      return NextResponse.json(
        { success: false, error: { code: "REPLAY_ATTACK", message: "重复的请求 nonce" } },
        { status: 401 }
      );
    }

    // 3. 读取 body 并校验签名
    const bodyText = await request.text();
    const bodyHash = await hashRequestBody(bodyText);
    const path = "/api/v1/internal/user/status";

    const config = verifyInternalApiSignature(
      key,
      signature,
      "POST",
      path,
      timestamp,
      nonce,
      bodyHash
    );

    if (!config) {
      apiConsole.warn(`[InternalApiV1] 签名验证失败，key: ${key}, ip: ${ip}`);
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "签名验证失败" } },
        { status: 401 }
      );
    }

    // 4. 解析业务参数
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(bodyText);
    } catch {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_JSON", message: "请求体不是合法 JSON" } },
        { status: 400 }
      );
    }

    const parsed = statusQuerySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_PARAMS", message: "参数错误", details: parsed.error.issues },
        },
        { status: 400 }
      );
    }

    const { userId } = parsed.data;

    // 5. 查询用户状态
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true, updatedAt: true },
    });

    if (!user) {
      return NextResponse.json({
        success: true,
        data: { userId, status: "NOT_FOUND" as const },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        userId: user.id,
        status: user.status,
        updatedAt: user.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    apiConsole.error("[InternalApiV1] user/status 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器内部错误" } },
      { status: 500 }
    );
  }
}

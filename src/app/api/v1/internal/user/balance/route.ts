/**
 * 内部 API v1：查询用户积分/等级权威余额
 * POST /api/v1/internal/user/balance
 *
 * 官网是积分/等级权威账本。商城（子站）通过此接口拉取权威余额，
 * 用于展示对齐与对账（纠正本地与官网的漂移）。
 *
 * 认证方式：HMAC-SHA256 签名（与 /api/v1/internal/user/status 一致）。
 *
 * Body：
 *   phone: string  （必填，中国手机号，与官网注册手机号一致）
 *
 * 响应：
 *   success: true
 *   data: { totalPoints, totalSpent, membershipLevel }
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

const balanceQuerySchema = z.object({
  // 与官网注册手机号格式一致（site 本地格式，非 +86 前缀的 E.164）
  phone: z.string().regex(/^1[3-9]\d{9}$/, "请输入正确的手机号"),
});

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    // 1. IP 速率限制（允许高频查询，商城可能有大量并发用户）
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

    if (!(await checkAndRecordNonce(nonce))) {
      return NextResponse.json(
        { success: false, error: { code: "REPLAY_ATTACK", message: "重复的请求 nonce" } },
        { status: 401 }
      );
    }

    // 3. 读取 body 并校验签名
    const bodyText = await request.text();
    const bodyHash = await hashRequestBody(bodyText);
    const path = "/api/v1/internal/user/balance";

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

    const parsed = balanceQuerySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_PARAMS", message: "参数错误", details: parsed.error.issues },
        },
        { status: 400 }
      );
    }

    // 5. 按手机号查询权威余额（联邦账号以手机号关联）
    const user = await prisma.user.findUnique({
      where: { phone: parsed.data.phone },
      select: { totalPoints: true, totalSpent: true, membershipLevel: true },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "USER_NOT_FOUND", message: "用户不存在" } },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        totalPoints: user.totalPoints,
        totalSpent: user.totalSpent,
        membershipLevel: user.membershipLevel,
      },
    });
  } catch (error) {
    apiConsole.error("[InternalApiV1] user/balance 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器内部错误" } },
      { status: 500 }
    );
  }
}

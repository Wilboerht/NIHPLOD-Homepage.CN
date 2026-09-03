/**
 * 内部 API v1：商城查询用户积分余额与兑礼率
 * GET /api/v1/internal/points/balance?phone=13800138000
 *
 * 商城账户页/兑换页展示与折算前调用：官网 SSO 是积分权威账本。
 * 认证方式：HMAC-SHA256 签名（与 /api/v1/internal/points/sync 一致）。
 *
 * 响应：
 *   success: true
 *   data: {
 *     available: number        // 可用积分（可为负：退款超兑债务）
 *     frozen: number           // 冻结积分（稳定期 7 天内）
 *     nextReleaseAt: string|null // 最近解冻时间（ISO）
 *     redeemRate: number|null  // 当前等级兑礼率（null=普通档不参与）
 *     membershipLevel: string  // 当前等级
 *   }
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
import { getPointBalanceView } from "@/lib/points-ledger";
import { POINT_REDEEM_RATES } from "@/lib/membership";
import { z } from "zod";
import { apiConsole } from "@/lib/logger";

const querySchema = z.object({
  phone: z.string().regex(/^1[3-9]\d{9}$/, "请输入正确的手机号"),
});

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    // 1. IP 速率限制
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

    // 3. 解析 query 并校验签名
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({ phone: searchParams.get("phone") });
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: "参数错误" } },
        { status: 400 }
      );
    }

    const path = "/api/v1/internal/points/balance";
    // GET 无请求体：bodyHash 为空串的 SHA-256
    const config = verifyInternalApiSignature(
      key,
      signature,
      "GET",
      path,
      timestamp,
      nonce,
      hashRequestBody("")
    );
    if (!config) {
      apiConsole.warn(`[InternalApiV1] points/balance 签名验证失败，key: ${key}, ip: ${ip}`);
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "签名验证失败" } },
        { status: 401 }
      );
    }

    // 4. 按手机号定位用户
    const user = await prisma.user.findUnique({
      where: { phone: parsed.data.phone },
      select: { id: true, membershipLevel: true },
    });
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "USER_NOT_FOUND", message: "用户不存在" } },
        { status: 404 }
      );
    }

    // 5. 查询余额（含物化：过期/释放）
    const balance = await prisma.$transaction((tx) => getPointBalanceView(tx, user.id));

    return NextResponse.json({
      success: true,
      data: {
        available: balance.available,
        frozen: balance.frozen,
        nextReleaseAt: balance.nextReleaseAt?.toISOString() ?? null,
        redeemRate: POINT_REDEEM_RATES[user.membershipLevel],
        membershipLevel: user.membershipLevel,
      },
    });
  } catch (error) {
    apiConsole.error("[InternalApiV1] points/balance 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器内部错误" } },
      { status: 500 }
    );
  }
}

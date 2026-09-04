/**
 * 内部 API v1：商城积分兑礼扣减
 * POST /api/v1/internal/points/redeem
 *
 * 商城（子站）用户兑换礼品时调用：官网 SSO 是积分权威账本，
 * 按幂等 reference 扣减用户可用积分（FIFO 消耗最旧可用流水）。
 * 兑礼率（1:1 / 1:1.3 / 1:1.5）由商城按用户 membership_level 自行折算
 * 为本次需扣减的积分数量后调用本接口。
 * 普通档（redeemRate=null）不可兑礼：接口侧兜底拦截（403）。
 *
 * 认证方式：HMAC-SHA256 签名（与 /api/v1/internal/points/sync 一致）。
 *
 * Body：
 *   phone: string        （必填，中国手机号，与官网注册手机号一致）
 *   points: number       （必填，扣减积分数量，正整数）
 *   reference: string    （必填，商城侧兑换单号，幂等键；重复上报不重复扣减）
 *   note?: string        （可选，备注）
 *
 * 响应：
 *   success: true
 *   data: { available }  （扣减后的可用积分）
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
import { redeemPoints } from "@/lib/points-ledger";
import { POINT_REDEEM_RATES } from "@/lib/membership";
import { z } from "zod";
import { apiConsole } from "@/lib/logger";

const redeemSchema = z.object({
  phone: z.string().regex(/^1[3-9]\d{9}$/, "请输入正确的手机号"),
  points: z.number().int().min(1, "扣减积分必须为正整数").max(10_000_000),
  reference: z.string().min(1, "缺少幂等单据号").max(128),
  note: z.string().max(500).optional(),
});

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
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

    // 3. 读取 body 并校验签名
    const bodyText = await request.text();
    const bodyHash = await hashRequestBody(bodyText);
    const path = "/api/v1/internal/points/redeem";

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
      apiConsole.warn(`[InternalApiV1] points/redeem 签名验证失败，key: ${key}, ip: ${ip}`);
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

    const parsed = redeemSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_PARAMS", message: "参数错误", details: parsed.error.issues },
        },
        { status: 400 }
      );
    }

    const { phone, points, reference, note } = parsed.data;

    // 5. 按手机号定位用户（与消费同步口径一致）
    const user = await prisma.user.findUnique({
      where: { phone },
      select: { id: true, membershipLevel: true },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "USER_NOT_FOUND", message: "用户不存在" } },
        { status: 404 }
      );
    }

    // 6. 等级拦截：普通档不可兑礼（积分商城仅银卡及以上开放），商城侧由 redeemRate=null 控制展示
    if (POINT_REDEEM_RATES[user.membershipLevel] === null) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "NOT_ELIGIBLE", message: "银卡及以上会员可参与积分兑礼" },
        },
        { status: 403 }
      );
    }

    // 7. 事务内扣减（幂等 + 物化 + FIFO）
    const result = await prisma.$transaction((tx) =>
      redeemPoints(tx, {
        userId: user.id,
        amount: points,
        reference: `redeem:${reference}`,
        note: note ?? `商城兑换 ${reference}`,
      })
    );

    if (!result.ok) {
      return NextResponse.json(
        {
          success: false,
          error: { code: result.code, message: "可用积分不足" },
          data: { available: result.available },
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        available: result.available,
        spent: result.spent,
        redeemRate: POINT_REDEEM_RATES[user.membershipLevel],
        membershipLevel: user.membershipLevel,
        // 幂等命中（未实际扣减）时标记，商城侧可直接视为兑换成功
        ...(result.spent === 0 ? { duplicated: true } : {}),
      },
    });
  } catch (error) {
    apiConsole.error("[InternalApiV1] points/redeem 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器内部错误" } },
      { status: 500 }
    );
  }
}

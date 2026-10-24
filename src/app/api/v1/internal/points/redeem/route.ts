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
 *   userId: string       （推荐，官网 User.id 即 SSO sub；微信占位号/换手机后仍稳定，
 *                         与 phone 二选一）
 *   phone: string        （兼容保留，中国手机号，与官网注册手机号一致，与 userId 二选一）
 *   points: number       （必填，扣减积分数量，正整数）
 *   reference: string    （必填，商城侧兑换单号，幂等键；重复上报不重复扣减）
 *   note?: string        （可选，备注）
 *
 * 响应：
 *   success: true
 *   data: { userId, available }  （扣减后的可用积分）
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import {
  verifyInternalApiSignature,
  canonicalizeQuery,
  isProjectAllowed,
  isTimestampValid,
  checkAndRecordNonce,
  hashRequestBody,
} from "@/lib/internal-api";
import { redeemPoints, withPointTxRetry } from "@/lib/points-ledger";
import { auditInternalPoints } from "@/lib/internal-points-audit";
import { POINT_REDEEM_RATES } from "@/lib/membership";
import { z } from "zod";
import { apiConsole } from "@/lib/logger";

// 本端点允许的 project 白名单：积分兑礼扣减仅对商城开放
const ALLOWED_PROJECTS = ["mall"] as const;

const redeemSchema = z
  .object({
    // 定位用户：userId（推荐）与 phone（兼容）二选一
    userId: z.string().min(1, "userId 不能为空").max(64).optional(),
    phone: z
      .string()
      .regex(/^1[3-9]\d{9}$/, "请输入正确的手机号")
      .optional(),
    points: z.number().int().min(1, "扣减积分必须为正整数").max(10_000_000),
    reference: z.string().min(1, "缺少幂等单据号").max(128),
    note: z.string().max(500).optional(),
  })
  .refine((data) => (data.userId ? !data.phone : !!data.phone), {
    message: "userId 与 phone 必须且只能提供一个",
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

    // 3. 读取 body 并校验签名（nonce 在验签通过后才消费，避免签名错误的请求烧掉 nonce）
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
      bodyHash,
      { query: canonicalizeQuery(new URL(request.url).search) }
    );

    if (!config) {
      apiConsole.warn(`[InternalApiV1] points/redeem 签名验证失败，key: ${key}, ip: ${ip}`);
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "签名验证失败" } },
        { status: 401 }
      );
    }

    if (!isProjectAllowed(config, ALLOWED_PROJECTS)) {
      apiConsole.warn(
        `[InternalApiV1] project ${config.project} 无权访问 ${path}，key: ${key}, ip: ${ip}`
      );
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN_PROJECT", message: "该密钥无权访问此端点" } },
        { status: 403 }
      );
    }

    if (!(await checkAndRecordNonce(nonce))) {
      return NextResponse.json(
        { success: false, error: { code: "REPLAY_ATTACK", message: "重复的请求 nonce" } },
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

    const { userId, phone, points, reference, note } = parsed.data;

    // 5. 定位用户：userId 优先（稳定，支持微信占位号/换绑后账号），phone 兼容回退
    const user = await prisma.user.findUnique({
      where: userId ? { id: userId } : { phone: phone ?? "" },
      select: { id: true, membershipLevel: true, status: true },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "USER_NOT_FOUND", message: "用户不存在" } },
        { status: 404 }
      );
    }

    if (user.status !== "ACTIVE") {
      return NextResponse.json(
        { success: false, error: { code: "ACCOUNT_DISABLED", message: "账户不可用" } },
        { status: 403 }
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

    // 7. 事务内重读等级后再扣减（幂等 + 物化 + FIFO）：
    // 商城按外部快照折算积分，若事务提交前发生退款降档，必须拒绝让商城重新折算，
    // 避免按高档 rate 少扣积分。
    const outcome = await withPointTxRetry(() =>
      prisma.$transaction(async (tx) => {
        const fresh = await tx.user.findUnique({
          where: { id: user.id },
          select: { membershipLevel: true, status: true },
        });
        if (!fresh || fresh.status !== "ACTIVE") {
          return { kind: "INACTIVE" as const };
        }
        if (fresh.membershipLevel !== user.membershipLevel) {
          return { kind: "LEVEL_CHANGED" as const, level: fresh.membershipLevel };
        }
        if (POINT_REDEEM_RATES[fresh.membershipLevel] === null) {
          return { kind: "NOT_ELIGIBLE" as const };
        }
        const result = await redeemPoints(tx, {
          userId: user.id,
          amount: points,
          reference: `redeem:${reference}`,
          note: note ?? `商城兑换 ${reference}`,
        });
        return { kind: "OK" as const, result };
      })
    );

    if (outcome.kind === "INACTIVE") {
      return NextResponse.json(
        { success: false, error: { code: "ACCOUNT_DISABLED", message: "账户不可用" } },
        { status: 403 }
      );
    }

    if (outcome.kind === "LEVEL_CHANGED") {
      return NextResponse.json(
        {
          success: false,
          error: { code: "LEVEL_CHANGED", message: "会员等级已变化，请重新折算后再兑换" },
          data: {
            membershipLevel: outcome.level,
            redeemRate: POINT_REDEEM_RATES[outcome.level],
          },
        },
        { status: 409 }
      );
    }

    if (outcome.kind === "NOT_ELIGIBLE") {
      return NextResponse.json(
        {
          success: false,
          error: { code: "NOT_ELIGIBLE", message: "银卡及以上会员可参与积分兑礼" },
        },
        { status: 403 }
      );
    }

    const result = outcome.result;
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

    await auditInternalPoints({
      action: "points_internal_redeem",
      targetType: "point_ledger",
      targetId: reference,
      userId: user.id,
      project: config.project,
      key,
      request,
      detail: {
        points,
        reference,
        note: note ?? null,
        spent: result.spent,
        available: result.available,
        duplicated: result.spent === 0,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        userId: user.id,
        available: result.available,
        spent: result.spent,
        redeemRate: POINT_REDEEM_RATES[user.membershipLevel],
        membershipLevel: user.membershipLevel,
        // 幂等命中：未实际扣减时清空，商城不重复视为兑换成功
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

/**
 * 内部 API v1：商城兑换撤销退分
 * POST /api/v1/internal/points/refund
 *
 * 商城侧取消/退款一笔已扣分的兑换单时调用：
 * - 只允许按原兑换单号（/points/redeem 使用的 reference）全额退回；
 * - 原兑换流水必须存在且为 REDEEM，避免无源退分/凭空铸分；
 * - 退分幂等键固定为 redeem-refund:{reference}，重复上报不重复退分；
 * - 退回的积分立即到账、6 个月过期，并写入 REDEEM_REFUND 流水便于对账。
 *
 * 认证方式：HMAC-SHA256 签名（与 /api/v1/internal/points/redeem 一致）。
 *
 * Body：
 *   userId: string    （推荐，与 phone 二选一）
 *   phone: string     （兼容保留，与 userId 二选一）
 *   reference: string （必填，原兑换单号，即 /points/redeem 的 reference）
 *   note?: string     （可选，取消原因）
 *
 * 响应：
 *   success: true
 *   data: { userId, refunded, available, duplicated? }
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
import { getPointBalanceView, refundRedeemPoints, withPointTxRetry } from "@/lib/points-ledger";
import { auditInternalPoints } from "@/lib/internal-points-audit";
import { z } from "zod";
import { apiConsole } from "@/lib/logger";

// 本端点允许的 project 白名单：兑换撤销退分仅对商城开放
const ALLOWED_PROJECTS = ["mall"] as const;

const refundSchema = z
  .object({
    userId: z.string().min(1, "userId 不能为空").max(64).optional(),
    phone: z
      .string()
      .regex(/^1[3-9]\d{9}$/, "请输入正确的手机号")
      .optional(),
    reference: z.string().min(1, "缺少原兑换单号").max(128),
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

    // 3. 读取 body 并校验签名
    const bodyText = await request.text();
    const bodyHash = await hashRequestBody(bodyText);
    const path = "/api/v1/internal/points/refund";

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
      apiConsole.warn(`[InternalApiV1] points/refund 签名验证失败，key: ${key}, ip: ${ip}`);
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

    const parsed = refundSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_PARAMS", message: "参数错误", details: parsed.error.issues },
        },
        { status: 400 }
      );
    }

    const { userId, phone, reference, note } = parsed.data;

    // 5. 定位用户：userId 优先，phone 兼容
    const user = await prisma.user.findUnique({
      where: userId ? { id: userId } : { phone: phone ?? "" },
      select: { id: true, status: true },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "USER_NOT_FOUND", message: "用户不存在" } },
        { status: 404 }
      );
    }

    if (user.status === "DELETED") {
      // 已注销账户积分已作废，不能再退分（避免产生无法使用的余额）
      return NextResponse.json(
        { success: false, error: { code: "ACCOUNT_DELETED", message: "账户已注销" } },
        { status: 403 }
      );
    }

    // 6. 事务内校验原兑换流水 + 幂等退分
    const result = await withPointTxRetry(() =>
      prisma.$transaction(async (tx) => {
        const original = await tx.pointLedger.findUnique({
          where: { userId_reference: { userId: user.id, reference: `redeem:${reference}` } },
          select: { id: true, type: true, amount: true },
        });
        if (!original || original.type !== "REDEEM" || original.amount >= 0) {
          return { notFound: true as const };
        }

        const refund = await refundRedeemPoints(tx, {
          userId: user.id,
          amount: -original.amount,
          redemptionReference: reference,
          note: note ?? `商城兑换撤销 ${reference}`,
        });
        const balance = await getPointBalanceView(tx, user.id);
        return {
          notFound: false as const,
          duplicated: refund.duplicated,
          refunded: refund.amount,
          available: balance.available,
        };
      })
    );

    if (result.notFound) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "REDEMPTION_NOT_FOUND", message: "原兑换流水不存在或不可退" },
        },
        { status: 404 }
      );
    }

    await auditInternalPoints({
      action: "points_internal_refund",
      targetType: "point_ledger",
      targetId: reference,
      userId: user.id,
      project: config.project,
      key,
      request,
      detail: {
        reference,
        refunded: result.refunded,
        available: result.available,
        duplicated: result.duplicated,
        note: note ?? null,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        userId: user.id,
        refunded: result.refunded,
        available: result.available,
        ...(result.duplicated ? { duplicated: true } : {}),
      },
    });
  } catch (error) {
    apiConsole.error("[InternalApiV1] points/refund 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器内部错误" } },
      { status: 500 }
    );
  }
}

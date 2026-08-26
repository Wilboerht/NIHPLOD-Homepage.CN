/**
 * 内部 API v1：商城积分/消费变动同步上报
 * POST /api/v1/internal/points/sync
 *
 * 官网是积分/等级权威账本。商城（子站）发生积分变动（下单奖励、积分抵扣、
 * 退款扣回等）后，通过此接口上报变动量，官网入账并返回权威余额，商城侧对齐。
 *
 * 认证方式：HMAC-SHA256 签名（与 /api/v1/internal/user/status 一致）。
 *
 * Body：
 *   phone: string       （必填，中国手机号，与官网注册手机号一致）
 *   delta: number       （必填，积分变动，非零整数；正加负减）
 *   spentDelta?: number （可选，消费额变动（元），整数，默认 0；用于等级重算）
 *   reference: string   （必填，商城侧唯一单据号，幂等键；重复上报返回 duplicated: true）
 *   note?: string       （可选，流水备注）
 *
 * 响应：
 *   success: true
 *   data: { totalPoints, totalSpent, membershipLevel, duplicated? }
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
import { applyExternalPointsSync } from "@/lib/points";
import { z } from "zod";
import { apiConsole } from "@/lib/logger";

const syncSchema = z.object({
  // 与官网注册手机号格式一致（site 本地格式，非 +86 前缀的 E.164）
  phone: z.string().regex(/^1[3-9]\d{9}$/, "请输入正确的手机号"),
  // 绝对值上限 ±1,000,000：防商城侧 bug 或密钥泄露时写入天文数字
  delta: z
    .number()
    .int("积分变动必须为整数")
    .min(-1_000_000, "积分变动超出允许范围")
    .max(1_000_000, "积分变动超出允许范围")
    .refine((v) => v !== 0, "积分变动不能为 0"),
  spentDelta: z
    .number()
    .int("消费额变动必须为整数")
    .min(-1_000_000, "消费额变动超出允许范围")
    .max(1_000_000, "消费额变动超出允许范围")
    .default(0),
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
    const path = "/api/v1/internal/points/sync";

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

    const parsed = syncSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_PARAMS", message: "参数错误", details: parsed.error.issues },
        },
        { status: 400 }
      );
    }

    const { phone, delta, spentDelta, reference, note } = parsed.data;

    // 5. 按手机号定位用户（联邦账号以手机号关联）
    const user = await prisma.user.findUnique({
      where: { phone },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "USER_NOT_FOUND", message: "用户不存在" } },
        { status: 404 }
      );
    }

    // 6. 入账（事务内写流水 + 更新余额/消费额 + 重算等级，reference 幂等）
    const result = await applyExternalPointsSync({
      userId: user.id,
      delta,
      spentDelta,
      reference,
      note,
    });

    if (!result) {
      return NextResponse.json(
        { success: false, error: { code: "USER_NOT_FOUND", message: "用户不存在" } },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        totalPoints: result.totalPoints,
        totalSpent: result.totalSpent,
        membershipLevel: result.membershipLevel,
        ...(result.duplicated ? { duplicated: true } : {}),
      },
    });
  } catch (error) {
    apiConsole.error("[InternalApiV1] points/sync 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器内部错误" } },
      { status: 500 }
    );
  }
}

/**
 * 内部 API v1：活动积分发放（打卡奖励等）
 * POST /api/v1/internal/points/grant
 *
 * 供子站（当前为测肤子站 Skin-Advisor）为用户发放非消费类积分。
 * 官网是积分权威账本：子站只上报"谁、哪天、多少分、幂等键"，
 * 发放规则（连续天数 → 分值）由子站计算，账本侧只做幂等入账。
 *
 * 认证方式：HMAC-SHA256 签名（与 /api/v1/internal/points/sync 一致）。
 *
 * Body：
 *   userId: string      （必填，官网 User.id——子站本地用户 id 与 SSO sub 同源）
 *   points: number      （必填，整数 1..10，单次发放分值）
 *   reference: string   （必填，幂等键，如 checkin:{userId}:{date}；重复上报返回 duplicated: true）
 *   note?: string       （可选，备注，如 "打卡奖励·连续第 3 天"）
 *
 * 响应：
 *   success: true
 *   data: { granted: number, duplicated?, available }
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
import { grantCheckinPoints, getPointBalanceView } from "@/lib/points-ledger";
import { z } from "zod";
import { apiConsole } from "@/lib/logger";

// 本端点允许的 project 白名单：活动积分发放当前仅对测肤子站开放
const ALLOWED_PROJECTS = ["advisor"] as const;

const grantSchema = z.object({
  userId: z.string().min(1, "缺少 userId").max(64),
  points: z
    .number()
    .int("积分必须为整数")
    .min(1, "积分必须为正数")
    .max(10, "单次发放积分超出允许范围"),
  reference: z.string().min(1, "缺少幂等键").max(128),
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

    // 3. 读取 body 并校验签名（nonce 在验签通过后才消费，避免签名错误的请求烧掉 nonce）
    const bodyText = await request.text();
    const bodyHash = await hashRequestBody(bodyText);
    const path = "/api/v1/internal/points/grant";

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
      apiConsole.warn(`[InternalApiV1] 签名验证失败，key: ${key}, ip: ${ip}`);
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

    const parsed = grantSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_PARAMS", message: "参数错误", details: parsed.error.issues },
        },
        { status: 400 }
      );
    }

    const { userId, points, reference, note } = parsed.data;

    // 幂等键格式强约束：checkin:{userId}:{YYYY-MM-DD}
    // 使"每用户每日最多一次"由幂等键本身保证；否则子站可用任意 reference
    // 无限次调用本端点铸积分（密钥泄漏/内部滥用即资损）
    const referenceMatch = /^checkin:([^:]{1,64}):(\d{4}-\d{2}-\d{2})$/.exec(reference);
    if (!referenceMatch || referenceMatch[1] !== userId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_REFERENCE",
            message: "幂等键格式必须为 checkin:{userId}:{YYYY-MM-DD}",
          },
        },
        { status: 400 }
      );
    }
    const occurredAt = new Date(`${referenceMatch[2]}T00:00:00.000Z`);
    if (
      Number.isNaN(occurredAt.getTime()) ||
      occurredAt.getTime() > Date.now() + 24 * 60 * 60 * 1000
    ) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_REFERENCE", message: "幂等键日期无效" } },
        { status: 400 }
      );
    }

    // 5. 按 userId 定位用户（子站本地 user.id 即 SSO sub，与官网 User.id 同源）
    // 同时校验账户状态：封禁/冻结用户不得再被发放积分
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true },
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

    // 6. 入账（事务内写幂等流水 + 更新余额，reference 幂等），返回最新可用余额
    const result = await prisma.$transaction(async (tx) => {
      const grant = await grantCheckinPoints(tx, { userId, amount: points, reference, note });
      const balance = await getPointBalanceView(tx, userId);
      return { ...grant, available: balance.available };
    });

    return NextResponse.json({
      success: true,
      data: {
        granted: result.duplicated ? 0 : result.amount,
        ...(result.duplicated ? { duplicated: true } : {}),
        available: result.available,
      },
    });
  } catch (error) {
    apiConsole.error("[InternalApiV1] points/grant 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器内部错误" } },
      { status: 500 }
    );
  }
}

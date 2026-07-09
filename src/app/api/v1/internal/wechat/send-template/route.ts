/**
 * 内部 API v1：代子站发送微信模板消息
 * POST /api/v1/internal/wechat/send-template
 *
 * 认证方式（增强）：
 * - X-Internal-API-Key: 项目标识 key
 * - X-Internal-API-Timestamp: Unix 时间戳（秒）
 * - X-Internal-API-Nonce: 随机字符串（建议 16-32 位）
 * - X-Internal-API-Signature: HMAC-SHA256 签名
 *
 * 签名算法：
 *   signature = HMAC-SHA256(
 *     secret,
 *     "POST|/api/v1/internal/wechat/send-template|timestamp|nonce|bodySha256"
 *   )
 *
 * Body 字段：
 *   userId: string
 *   score: number
 *   primaryConcern: string
 *   reportUrl: string
 */
import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import {
  verifyInternalApiSignature,
  isTimestampValid,
  checkAndRecordNonce,
  hashRequestBody,
} from "@/lib/internal-api";
import { sendWechatTemplateMessage } from "@/lib/wechat-template";
import { z } from "zod";
import { apiConsole } from "@/lib/logger";

const sendTemplateSchema = z.object({
  userId: z.string().cuid(),
  score: z.number(),
  primaryConcern: z.string().min(1).max(100),
  reportUrl: z
    .string()
    .url()
    .max(500)
    .regex(/^https?:\/\//, "报告链接必须以 http:// 或 https:// 开头"),
});

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    // 1. IP 速率限制
    const ip = getClientIP(request);
    const limitResult = await rateLimit(ip, "default", { maxRequests: 60, windowMs: 60 * 1000 });
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
    const path = "/api/v1/internal/wechat/send-template";

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

    const parsed = sendTemplateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_PARAMS", message: "参数错误", details: parsed.error.issues },
        },
        { status: 400 }
      );
    }

    const { userId, score, primaryConcern, reportUrl } = parsed.data;

    // 5. 执行业务逻辑
    const result = await sendWechatTemplateMessage({ userId, score, primaryConcern, reportUrl });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: result.error?.code === "WECHAT_TOKEN_ERROR" ? 502 : 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { sent: result.sent, reason: result.reason },
    });
  } catch (error) {
    apiConsole.error("[InternalApiV1] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器内部错误" } },
      { status: 500 }
    );
  }
}

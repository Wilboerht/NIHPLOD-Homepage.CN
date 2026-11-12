import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  canonicalizeQuery,
  checkAndRecordNonce,
  hashRequestBody,
  isProjectAllowed,
  isTimestampValid,
  verifyInternalApiSignature,
} from "@/lib/internal-api";
import { readInternalApiBody } from "@/lib/request-body";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import { formatBaComplaintToWecom, sendWecomNotification } from "@/lib/wecom";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

const ALLOWED_PROJECTS = ["ba"] as const;
const PATH = "/api/internal/ba/complaint-submitted";

const bodySchema = z.object({
  complaintId: z.string().min(1).max(64),
  channel: z.string().max(500).nullable().optional(),
  contactInfo: z.string().max(200).nullable().optional(),
  description: z.string().min(1).max(2000),
  createdAt: z.string().max(64).nullable().optional(),
});

function jsonError(code: string, message: string, status: number): NextResponse {
  return NextResponse.json(
    { success: false, error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

/**
 * BA → 主站：新打假举报通知
 * POST /api/internal/ba/complaint-submitted
 */
export async function POST(request: NextRequest) {
  const ip = getClientIP(request);
  const limit = await rateLimit(`ba-complaint-notify-${ip}`, "default", {
    maxRequests: 120,
    windowMs: 60 * 1000,
  });
  if (!limit.success) {
    return jsonError("RATE_LIMITED", "请求过于频繁", 429);
  }

  const key = request.headers.get("x-internal-api-key");
  const signature = request.headers.get("x-internal-api-signature");
  const timestampHeader = request.headers.get("x-internal-api-timestamp");
  const nonce = request.headers.get("x-internal-api-nonce");
  if (!key || !signature || !timestampHeader || !nonce) {
    return jsonError("MISSING_AUTH", "缺少鉴权头", 401);
  }

  const timestamp = parseInt(timestampHeader, 10);
  if (Number.isNaN(timestamp) || !isTimestampValid(timestamp)) {
    return jsonError("INVALID_TIMESTAMP", "请求时间戳无效或已过期", 401);
  }

  let bodyText: string;
  try {
    bodyText = await readInternalApiBody(request);
  } catch {
    return jsonError("INVALID_REQUEST", "请求体读取失败", 400);
  }

  const config = verifyInternalApiSignature(
    key,
    signature,
    "POST",
    PATH,
    timestamp,
    nonce,
    await hashRequestBody(bodyText),
    { query: canonicalizeQuery(new URL(request.url).search) }
  );
  if (!config) {
    apiConsole.warn(`[BaComplaintNotify] 签名验证失败 key=${key} ip=${ip}`);
    return jsonError("UNAUTHORIZED", "签名验证失败", 401);
  }
  if (!isProjectAllowed(config, ALLOWED_PROJECTS)) {
    return jsonError("FORBIDDEN_PROJECT", "该项目无权访问此端点", 403);
  }
  if (!(await checkAndRecordNonce(nonce))) {
    return jsonError("REPLAY_ATTACK", "重复请求 nonce", 401);
  }

  let parsed;
  try {
    parsed = bodySchema.safeParse(JSON.parse(bodyText));
  } catch {
    return jsonError("INVALID_JSON", "请求体不是合法 JSON", 400);
  }
  if (!parsed.success) {
    return jsonError("INVALID_PARAMS", "请求参数无效", 400);
  }

  const hasWebhook = Boolean(
    process.env.WECOM_BOT_WEBHOOK?.trim() || process.env.WECOM_OPS_WEBHOOK?.trim()
  );
  if (!hasWebhook) {
    apiConsole.warn("[BaComplaintNotify] 未配置企业微信 Webhook，跳过通知");
    return NextResponse.json(
      { success: true, data: { skipped: true } },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const link = `https://nihplod.cn/admin/messages?source=ba&id=${encodeURIComponent(
    parsed.data.complaintId
  )}`;
  const content = formatBaComplaintToWecom({
    id: parsed.data.complaintId,
    channel: parsed.data.channel,
    contactInfo: parsed.data.contactInfo,
    description: parsed.data.description,
    createdAt: parsed.data.createdAt,
    link,
  });

  const result = await sendWecomNotification(content, "ops");
  if (!result.success) {
    apiConsole.error("[BaComplaintNotify] 企业微信通知失败", { error: result.error });
    return jsonError("WECOM_FAILED", "企业微信通知失败", 502);
  }

  return NextResponse.json(
    { success: true, data: { sent: true } },
    { headers: { "Cache-Control": "no-store" } }
  );
}

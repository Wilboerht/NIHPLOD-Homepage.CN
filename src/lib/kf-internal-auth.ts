import { NextResponse } from "next/server";
import {
  canonicalizeQuery,
  checkAndRecordNonce,
  hashRequestBody,
  isProjectAllowed,
  isTimestampValid,
  verifyInternalApiSignature,
} from "@/lib/internal-api";
import { readInternalApiBody } from "@/lib/request-body";

export type KfInternalAuthResult =
  | { ok: true; bodyText: string }
  | { ok: false; response: NextResponse };

function unauthorized(code: string, message: string, status = 401): KfInternalAuthResult {
  return {
    ok: false,
    response: NextResponse.json(
      { success: false, error: { code, message } },
      { status, headers: { "Cache-Control": "no-store" } }
    ),
  };
}

/**
 * 校验 KF 服务调用主站内部接口的 HMAC 签名。
 * project 固定为 kf；body 必须与签名时发送的原始文本完全一致。
 */
export async function authenticateKfInternalRequest(
  request: Request,
  path: string
): Promise<KfInternalAuthResult> {
  const key = request.headers.get("x-internal-api-key");
  const signature = request.headers.get("x-internal-api-signature");
  const timestampHeader = request.headers.get("x-internal-api-timestamp");
  const nonce = request.headers.get("x-internal-api-nonce");
  if (!key || !signature || !timestampHeader || !nonce) {
    return unauthorized("MISSING_AUTH", "缺少鉴权头");
  }

  const timestamp = parseInt(timestampHeader, 10);
  if (Number.isNaN(timestamp) || !isTimestampValid(timestamp)) {
    return unauthorized("INVALID_TIMESTAMP", "请求时间戳无效或已过期");
  }

  let bodyText: string;
  try {
    bodyText = await readInternalApiBody(request);
  } catch {
    return unauthorized("INVALID_REQUEST", "请求体读取失败", 400);
  }

  const config = verifyInternalApiSignature(
    key,
    signature,
    "POST",
    path,
    timestamp,
    nonce,
    await hashRequestBody(bodyText),
    { query: canonicalizeQuery(new URL(request.url).search) }
  );
  if (!config || !isProjectAllowed(config, ["kf"])) {
    return unauthorized("UNAUTHORIZED", "签名验证失败");
  }
  if (!(await checkAndRecordNonce(nonce))) {
    return unauthorized("REPLAY_ATTACK", "重复请求 nonce");
  }

  return { ok: true, bodyText };
}
